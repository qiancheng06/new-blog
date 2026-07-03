const contractTag = `codex-api-contract-${Date.now()}`
const port = Number(process.env.API_PORT) || 3103

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, run } = await import("../infra/db/pool.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  await verifyOptions(port)
  await verifyHealth(port)
  await verifyNotFound(port)
  await verifyInvalidChat(port)
  await verifyValidChat(port)
  await verifyEvents(port)
  await verifyStatus(port)
  console.log("api contract ok")
} finally {
  cleanupContractRows(contractTag)
  await stopApiServer(server)
}

async function verifyOptions(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, { method: "OPTIONS" })
  assert(response.status === 204, `OPTIONS /api/chat expected 204, got ${response.status}`)
  assert(response.headers.get("access-control-allow-origin") === "*", "OPTIONS missing CORS origin")
}

async function verifyHealth(portNumber: number): Promise<void> {
  const body = await getJson<{
    status?: string
    uptime?: number
    events_today?: number
  }>(`http://127.0.0.1:${portNumber}/health`)

  assert(body.status === "ok", "health.status must be ok")
  assert(typeof body.uptime === "number", "health.uptime must be number")
  assert(typeof body.events_today === "number", "health.events_today must be number")
}

async function verifyNotFound(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/missing`)
  assert(response.status === 404, `missing route expected 404, got ${response.status}`)
  const body = await response.json() as { error?: string }
  assert(body.error === "not found", "missing route error must be not found")
}

async function verifyInvalidChat(portNumber: number): Promise<void> {
  const invalidJson = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  })
  assert(invalidJson.status === 400, `invalid JSON expected 400, got ${invalidJson.status}`)
  assert((await invalidJson.json() as { error?: string }).error === "invalid json", "invalid JSON error mismatch")

  const missingText = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  })
  assert(missingText.status === 400, `missing text expected 400, got ${missingText.status}`)
  assert((await missingText.json() as { error?: string }).error === "text is required", "missing text error mismatch")
}

async function verifyValidChat(portNumber: number): Promise<void> {
  const body = await postJson<{
    reply?: string
    eventId?: string
  }>(`http://127.0.0.1:${portNumber}/api/chat`, { text: contractTag, page: "api-contract" })

  assert(typeof body.reply === "string" && body.reply.includes(contractTag), "chat.reply must include mock tag")
  assert(typeof body.eventId === "string" && body.eventId.length > 0, "chat.eventId must be non-empty string")
}

async function verifyEvents(portNumber: number): Promise<void> {
  const body = await getJson<{ events?: unknown[] }>(`http://127.0.0.1:${portNumber}/api/events`)
  assert(Array.isArray(body.events), "events.events must be array")
}

async function verifyStatus(portNumber: number): Promise<void> {
  const body = await getJson<{
    status?: string
    uptime?: number
    events_today?: number
    memory?: { topics?: number; profile?: number; timelineEvents?: number }
    recent_events?: Array<{ id?: string; source?: string; type?: string; timestamp?: string; preview?: string }>
  }>(`http://127.0.0.1:${portNumber}/api/status`)

  assert(body.status === "ok", "status.status must be ok")
  assert(typeof body.uptime === "number", "status.uptime must be number")
  assert(typeof body.events_today === "number", "status.events_today must be number")
  assert(typeof body.memory?.topics === "number", "status.memory.topics must be number")
  assert(typeof body.memory?.profile === "number", "status.memory.profile must be number")
  assert(typeof body.memory?.timelineEvents === "number", "status.memory.timelineEvents must be number")
  assert(Array.isArray(body.recent_events), "status.recent_events must be array")

  for (const event of body.recent_events) {
    assert(typeof event.id === "string", "recent event id must be string")
    assert(typeof event.source === "string", "recent event source must be string")
    assert(typeof event.type === "string", "recent event type must be string")
    assert(typeof event.timestamp === "string", "recent event timestamp must be string")
    assert(typeof event.preview === "string", "recent event preview must be string")
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as T
}

async function postJson<T>(url: string, data: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as T
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await delay(100)
  }
  throw new Error("api server did not become healthy")
}

function cleanupContractRows(tag: string): void {
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${tag}%`])
  run("DELETE FROM topics WHERE name LIKE ? OR summary LIKE ?", [`%${tag}%`, `%${tag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
