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
} from "../../application/memory.js"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk.toString() })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req)
  let parsed: { text?: string; page?: string; evaluationRunId?: string }
  try {
    parsed = JSON.parse(body)
  } catch {
    return json(res, 400, { error: "invalid json" })
  }

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
  }))
}

function handleMemoryProfile(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryProfile({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    key: readText(url, "key"),
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

async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS)
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
    json(res, 404, { error: "not found" })
  } catch (err) {
    console.error("[api error]", err instanceof Error ? err.message : err)
    json(res, 500, { error: "internal error" })
  }
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
  const hostname = options.hostname
  const labelHost = hostname || "localhost"

  if (hostname) {
    server.listen(port, hostname, () => {
      console.log(`api server listening on http://${labelHost}:${port}`)
    })
  } else {
    server.listen(port, () => {
      console.log(`api server listening on http://${labelHost}:${port}`)
    })
  }

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
