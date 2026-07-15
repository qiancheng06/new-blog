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
  const parsed = await readJsonObject<{ text?: string; page?: string; evaluationRunId?: string }>(req, res)
  if (!parsed) return

  const text = parsed.text?.trim()
  if (!text) return json(res, 400, { error: "text is required" })

  const event = createWorkspaceEvent({ text, page: parsed.page, evaluationRunId: parsed.evaluationRunId })
  console.log(`[web] ${text.slice(0, 60)}`)

  try {
    const result = await handleConversationEvent(event)
    json(res, 200, { reply: result.companionReply, eventId: result.event.id })
  } catch (err) {
    console.error("[web error]", err instanceof Error ? err.message : err)
    json(res, 500, { reply: CONVERSATION_FALLBACK_REPLY, error: "processing failed" })
  }
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

async function handler(req: IncomingMessage, res: ServerResponse) {
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
    if (url === "/health" && req.method === "GET") {
      return handleHealth(req, res)
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

export interface ApiServerOptions {
  port?: number
  hostname?: string
}

export function createApiServer(): Server {
  return createServer(handler)
}

export function startApiServer(options: ApiServerOptions = {}): Server {
  const server = createApiServer()
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
