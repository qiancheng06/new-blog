import { createServer, IncomingMessage, ServerResponse, type Server } from "http"
import { config } from "../../infra/config/index.js"
import { createWorkspaceEvent } from "../../domain/event/types.js"
import {
  CONVERSATION_FALLBACK_REPLY,
  countConversationEventsToday,
  getRecentConversationEvents,
  handleConversationEvent,
} from "../../application/conversation.js"
import {
  getMemoryOverview,
  getMemoryProfile,
  getMemorySourceInspection,
  getMemoryStatusStats,
  getMemoryTimelineEvents,
  getMemoryTopics,
  changeMemoryProfileState,
  changeMemoryTopicState,
  correctMemoryProfile,
  MemoryValidationError,
  MemoryNotFoundError,
  parseMemoryListState,
} from "../../application/memory.js"
import { getPendingBackgroundTaskCount } from "../../application/background-tasks.js"
import {
  DailySummaryNotFoundError,
  DailySummaryArchiveConflictError,
  DailySummaryArchiveUnavailableError,
  DailySummaryValidationError,
  archiveDailySummary,
  generateDailySummary,
  getDailySummaries,
  getDailySummary,
} from "../../application/daily-summary.js"
import type { ProcessMessageOptions } from "../../ai-runtime/operators/process-message.js"
import { testModelConnection } from "../../application/model-connection.js"

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const MAX_JSON_BODY_BYTES = 64 * 1024

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false

    req.on("data", (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        settled = true
        reject(new RequestBodyTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString("utf-8"))
    })
    req.on("error", (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ text?: string; page?: string; evaluationRunId?: string; ai?: unknown }>(req, res)
  if (!parsed) return

  const text = parsed.text?.trim()
  if (!text) return json(res, 400, { error: "text is required" })
  const ai = parseChatAiParameters(parsed.ai)
  if ("error" in ai) return json(res, 400, { error: ai.error })

  const event = createWorkspaceEvent({ text, page: parsed.page, evaluationRunId: parsed.evaluationRunId })
  console.log(`[web] ${text.slice(0, 60)}`)

  try {
    const result = await handleConversationEvent(event, { ai: ai.value })
    json(res, 200, {
      reply: result.companionReply,
      eventId: result.event.id,
      replyEventId: result.replyEvent?.id,
    })
  } catch (err) {
    console.error("[web error]", err instanceof Error ? err.message : err)
    json(res, 500, { reply: CONVERSATION_FALLBACK_REPLY, error: "processing failed" })
  }
}

async function handleAiConnectionTest(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ ai?: unknown }>(req, res)
  if (!parsed) return
  const ai = parseChatAiParameters(parsed.ai)
  if ("error" in ai) return json(res, 400, { error: ai.error })

  try {
    json(res, 200, await testModelConnection(ai.value))
  } catch (err) {
    console.error("[ai connection test error]", err instanceof Error ? err.message : err)
    json(res, 502, { error: "model connection failed" })
  }
}

function parseChatAiParameters(input: unknown): { value: ProcessMessageOptions } | { error: string } {
  if (input === undefined) return { value: {} }
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "ai must be an object" }

  const value = input as Record<string, unknown>
  const endpoint = parseOptionalString(value.endpoint, "ai.endpoint", 2048)
  if (typeof endpoint === "object") return { error: endpoint.error }
  const model = parseOptionalString(value.model, "ai.model", 200)
  if (typeof model === "object") return { error: model.error }
  const apiKey = parseOptionalString(value.apiKey, "ai.apiKey", 4000)
  if (typeof apiKey === "object") return { error: apiKey.error }
  const connectionError = validateCustomConnection(endpoint, model, apiKey)
  if (connectionError) return { error: connectionError }
  const temperature = parseBoundedNumber(value.temperature, "ai.temperature", 0, 2)
  if (typeof temperature === "string") return { error: temperature }
  const topP = parseBoundedNumber(value.topP, "ai.topP", 0.1, 1)
  if (typeof topP === "string") return { error: topP }
  const maxTokens = parseBoundedNumber(value.maxTokens, "ai.maxTokens", 128, 4096, true)
  if (typeof maxTokens === "string") return { error: maxTokens }
  const historyLimit = parseBoundedNumber(value.historyLimit, "ai.historyLimit", 0, 10, true)
  if (typeof historyLimit === "string") return { error: historyLimit }
  const memoryEnabled = parseOptionalBoolean(value.memoryEnabled, "ai.memoryEnabled")
  if (typeof memoryEnabled === "string") return { error: memoryEnabled }
  const backgroundAnalysis = parseOptionalBoolean(value.backgroundAnalysis, "ai.backgroundAnalysis")
  if (typeof backgroundAnalysis === "string") return { error: backgroundAnalysis }

  if (value.instructions !== undefined && typeof value.instructions !== "string") {
    return { error: "ai.instructions must be a string" }
  }
  const instructions = value.instructions?.trim()
  if (instructions && instructions.length > 1000) return { error: "ai.instructions must be at most 1000 characters" }

  return {
    value: {
      endpoint,
      model,
      apiKey,
      temperature,
      topP,
      maxTokens,
      historyLimit,
      memoryEnabled,
      backgroundAnalysis,
      ...(instructions ? { instructions } : {}),
    },
  }
}

function parseOptionalString(
  input: unknown,
  name: string,
  maxLength: number,
): string | undefined | { error: string } {
  if (input === undefined || input === "") return undefined
  if (typeof input !== "string") return { error: `${name} must be a string` }
  const value = input.trim()
  if (!value) return undefined
  return value.length <= maxLength ? value : { error: `${name} must be at most ${maxLength} characters` }
}

function validateCustomConnection(endpoint?: string, model?: string, apiKey?: string): string | undefined {
  if (!endpoint && !model && !apiKey) return undefined
  if (!endpoint) return "ai.endpoint is required for a custom model connection"
  if (!model) return "ai.model is required for a custom model connection"

  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    return "ai.endpoint must be a valid URL"
  }

  const localHttp = parsed.protocol === "http:"
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]")
  if (parsed.protocol !== "https:" && !localHttp) {
    return "ai.endpoint must use HTTPS, except for localhost"
  }
  if (parsed.username || parsed.password) return "ai.endpoint must not include credentials"
  if (!localHttp && !apiKey) return "ai.apiKey is required for a remote custom model connection"
  return undefined
}

function parseBoundedNumber(
  input: unknown,
  name: string,
  min: number,
  max: number,
  integer = false,
): number | undefined | string {
  if (input === undefined) return undefined
  if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) {
    return `${name} must be a number between ${min} and ${max}`
  }
  if (integer && !Number.isInteger(input)) return `${name} must be an integer`
  return input
}

function parseOptionalBoolean(input: unknown, name: string): boolean | undefined | string {
  if (input === undefined) return undefined
  return typeof input === "boolean" ? input : `${name} must be a boolean`
}

function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  json(res, 200, {
    status: "ok",
    uptime: process.uptime(),
    events_today: countConversationEventsToday(),
    background_tasks: { pending: getPendingBackgroundTaskCount() },
  })
}

function handleEvents(_req: IncomingMessage, res: ServerResponse) {
  const events = getRecentConversationEvents(20)
  json(res, 200, { events })
}

function handleStatus(_req: IncomingMessage, res: ServerResponse) {
  const recentEvents = getRecentConversationEvents(5)
  json(res, 200, {
    status: "ok",
    uptime: process.uptime(),
    events_today: countConversationEventsToday(),
    background_tasks: { pending: getPendingBackgroundTaskCount() },
    memory: getMemoryStatusStats(),
    recent_events: recentEvents.map((event) => ({
      id: event.id,
      source: event.source,
      type: event.type,
      timestamp: event.timestamp,
      preview: getEventPreview(event.payload),
    })),
  })
}

function handleMemoryOverview(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryOverview({
    topicLimit: readNumber(url, "topicLimit"),
    profileLimit: readNumber(url, "profileLimit"),
    timelineLimit: readNumber(url, "timelineLimit"),
  }))
}

function handleMemoryTopics(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryTopics({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    name: readText(url, "name"),
    state: parseMemoryListState(readText(url, "state")),
  }))
}

function handleMemoryProfile(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryProfile({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    key: readText(url, "key"),
    state: parseMemoryListState(readText(url, "state")),
  }))
}

function handleMemoryTimeline(url: URL, res: ServerResponse) {
  const type = readText(url, "type")
  json(res, 200, getMemoryTimelineEvents({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    type: isTimelineType(type) ? type : undefined,
    date: readText(url, "date"),
    sourceEventId: readText(url, "sourceEventId"),
  }))
}

function handleMemorySources(_url: URL, res: ServerResponse) {
  json(res, 200, getMemorySourceInspection())
}

async function handleMemoryProfileCorrection(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ key?: string; value?: unknown; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = correctMemoryProfile({
      key: parsed.key ?? "",
      value: parsed.value,
      reason: parsed.reason,
    })
    json(res, 200, {
      eventId: result.event.id,
      profile: result.profile,
    })
  } catch (err) {
    if (err instanceof MemoryValidationError) {
      return json(res, 400, { error: err.message })
    }
    throw err
  }
}

async function handleMemoryProfileState(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ id?: string; state?: string; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = changeMemoryProfileState({
      id: parsed.id ?? "",
      state: parsed.state as never,
      reason: parsed.reason ?? "",
    })
    json(res, 200, { eventId: result.event.id, profile: result.profile })
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

async function handleMemoryTopicState(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ id?: string; state?: string; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = changeMemoryTopicState({
      id: parsed.id ?? "",
      state: parsed.state as never,
      reason: parsed.reason ?? "",
    })
    json(res, 200, { eventId: result.event.id, topic: result.topic })
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

async function handler(req: IncomingMessage, res: ServerResponse, onShutdownRequest?: () => void) {
  applyCorsHeaders(req, res)

  if (req.method === "OPTIONS") {
    const origin = req.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) {
      return json(res, 403, { error: "origin not allowed" })
    }
    res.writeHead(204)
    res.end()
    return
  }

  const requestUrl = new URL(req.url || "/", "http://localhost")
  const url = requestUrl.pathname

  try {
    if (url === "/api/chat" && req.method === "POST") {
      return await handleChat(req, res)
    }
    if (url === "/api/ai/test" && req.method === "POST") {
      return await handleAiConnectionTest(req, res)
    }
    if (url === "/health" && req.method === "GET") {
      return handleHealth(req, res)
    }
    if (url === "/api/runtime/shutdown" && req.method === "POST") {
      return handleRuntimeShutdown(req, res, onShutdownRequest)
    }
    if (url === "/api/events" && req.method === "GET") {
      return handleEvents(req, res)
    }
    if (url === "/api/status" && req.method === "GET") {
      return handleStatus(req, res)
    }
    if (url === "/api/memory" && req.method === "GET") {
      return handleMemoryOverview(requestUrl, res)
    }
    if (url === "/api/memory/topics" && req.method === "GET") {
      return handleMemoryTopics(requestUrl, res)
    }
    if (url === "/api/memory/profile" && req.method === "GET") {
      return handleMemoryProfile(requestUrl, res)
    }
    if (url === "/api/memory/timeline" && req.method === "GET") {
      return handleMemoryTimeline(requestUrl, res)
    }
    if (url === "/api/memory/sources" && req.method === "GET") {
      return handleMemorySources(requestUrl, res)
    }
    if (url === "/api/memory/profile/corrections" && req.method === "POST") {
      return await handleMemoryProfileCorrection(req, res)
    }
    if (url === "/api/memory/profile/state" && req.method === "POST") {
      return await handleMemoryProfileState(req, res)
    }
    if (url === "/api/memory/topics/state" && req.method === "POST") {
      return await handleMemoryTopicState(req, res)
    }
    if (url === "/api/daily-summaries" && req.method === "POST") {
      return await handleDailySummaryGeneration(req, res)
    }
    if (url === "/api/daily-summaries" && req.method === "GET") {
      return handleDailySummaries(requestUrl, res)
    }
    const dailySummaryArchiveMatch = /^\/api\/daily-summaries\/(\d{4}-\d{2}-\d{2})\/archive$/.exec(url)
    if (dailySummaryArchiveMatch && req.method === "POST") {
      return await handleDailySummaryArchive(req, dailySummaryArchiveMatch[1], res)
    }
    const dailySummaryMatch = /^\/api\/daily-summaries\/(\d{4}-\d{2}-\d{2})$/.exec(url)
    if (dailySummaryMatch && req.method === "GET") {
      return handleDailySummaryByDate(dailySummaryMatch[1], res)
    }
    json(res, 404, { error: "not found" })
  } catch (err) {
    console.error("[api error]", err instanceof Error ? err.message : err)
    json(res, 500, { error: "internal error" })
  }
}

async function readJsonObject<T extends Record<string, unknown>>(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<T | null> {
  if (readMediaType(req) !== "application/json") {
    json(res, 415, { error: "content-type must be application/json" })
    return null
  }

  const contentLength = Number(req.headers["content-length"])
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    req.resume()
    json(res, 413, { error: "request body too large" })
    return null
  }

  let body: string
  try {
    body = await readBody(req, MAX_JSON_BODY_BYTES)
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      json(res, 413, { error: "request body too large" })
      return null
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    json(res, 400, { error: "invalid json" })
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    json(res, 400, { error: "json object required" })
    return null
  }

  return parsed as T
}

function readMediaType(req: IncomingMessage): string {
  const contentType = req.headers["content-type"]
  const value = Array.isArray(contentType) ? contentType[0] : contentType
  return value?.split(";", 1)[0].trim().toLowerCase() ?? ""
}

class RequestBodyTooLargeError extends Error {}

function handleMemoryWriteError(err: unknown, res: ServerResponse): void {
  if (err instanceof MemoryValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof MemoryNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  throw err
}

function handleDailySummaryError(err: unknown, res: ServerResponse): void {
  if (err instanceof DailySummaryValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof DailySummaryNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof DailySummaryArchiveConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  if (err instanceof DailySummaryArchiveUnavailableError) {
    json(res, 503, { error: err.message })
    return
  }
  throw err
}

function readNumber(url: URL, key: string): number | undefined {
  const value = url.searchParams.get(key)
  if (value === null || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readText(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim()
  return value ? value : undefined
}

function isTimelineType(value: string | undefined): value is "insight" | "shift" | "milestone" {
  return value === "insight" || value === "shift" || value === "milestone"
}

function getEventPreview(payloadText: string): string {
  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>
    const text = payload.text
    return typeof text === "string" ? text.slice(0, 80) : ""
  } catch {
    return ""
  }
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value)
  }

  const origin = req.headers.origin
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }
}

async function handleDailySummaryGeneration(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ date?: string }>(req, res)
  if (!parsed) return

  try {
    json(res, 200, await generateDailySummary({ date: parsed.date }))
  } catch (err) {
    handleDailySummaryError(err, res)
  }
}

function handleDailySummaries(url: URL, res: ServerResponse) {
  json(res, 200, {
    items: getDailySummaries({
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }),
  })
}

function handleDailySummaryByDate(date: string, res: ServerResponse) {
  try {
    json(res, 200, { note: getDailySummary(date) })
  } catch (err) {
    handleDailySummaryError(err, res)
  }
}

async function handleDailySummaryArchive(req: IncomingMessage, date: string, res: ServerResponse) {
  const parsed = await readJsonObject<Record<string, never>>(req, res)
  if (!parsed) return

  try {
    json(res, 200, archiveDailySummary(date))
  } catch (err) {
    handleDailySummaryError(err, res)
  }
}

export interface ApiServerOptions {
  port?: number
  hostname?: string
  onShutdownRequest?: () => void
}

export function createApiServer(options: Pick<ApiServerOptions, "onShutdownRequest"> = {}): Server {
  return createServer((req, res) => handler(req, res, options.onShutdownRequest))
}

export function startApiServer(options: ApiServerOptions = {}): Server {
  const server = createApiServer(options)
  const port = options.port ?? config.apiPort
  const hostname = options.hostname ?? config.apiHost

  server.listen(port, hostname, () => {
    console.log(`api server listening on http://${hostname}:${port}`)
  })

  return server
}

export function stopApiServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function handleRuntimeShutdown(req: IncomingMessage, res: ServerResponse, onShutdownRequest?: () => void): void {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    json(res, 403, { error: "local access only" })
    return
  }
  if (!onShutdownRequest) {
    json(res, 409, { error: "runtime shutdown is unavailable" })
    return
  }

  json(res, 202, { stopping: true })
  setImmediate(onShutdownRequest)
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"
}
