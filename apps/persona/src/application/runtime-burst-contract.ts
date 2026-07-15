import { setTimeout as delay } from "timers/promises"

const burstTag = `codex-runtime-burst-${Date.now()}`
const port = Number(process.env.API_PORT) || 3105
const messageCount = 5

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)

  const eventIds: string[] = []
  for (let index = 0; index < messageCount; index += 1) {
    const text = `${burstTag}-${index}`
    const body = await postChat(port, text)
    assert(typeof body.eventId === "string" && body.eventId.length > 0, "chat response missing eventId")
    assert(body.reply === `[mock companion] ${text}`, "mock reply mismatch")
    eventIds.push(body.eventId)

    const health = await getJson<{ status?: string; events_today?: number }>(`http://127.0.0.1:${port}/health`)
    assert(health.status === "ok", "health should remain ok during burst")
    assert(typeof health.events_today === "number", "health events_today should remain numeric")
  }

  await waitForMemoryPatches(burstTag, messageCount)
  await verifyStatus(port, eventIds)

  console.log("runtime burst contract ok")
} finally {
  cleanupBurstRows(burstTag)
  await stopApiServer(server)
}

async function postChat(portNumber: number, text: string): Promise<{ reply?: string; eventId?: string }> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, page: "runtime-burst-contract" }),
  })

  if (!response.ok) {
    throw new Error(`chat failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as { reply?: string; eventId?: string }
}

async function verifyStatus(portNumber: number, eventIds: string[]): Promise<void> {
  const status = await getJson<{
    status?: string
    events_today?: number
    background_tasks?: { pending?: number }
    memory?: { topics?: number; profile?: number; timelineEvents?: number }
    recent_events?: Array<{ id?: string; preview?: string }>
  }>(`http://127.0.0.1:${portNumber}/api/status`)

  assert(status.status === "ok", "status should be ok after burst")
  assert(typeof status.events_today === "number", "status events_today should be numeric")
  assert(status.background_tasks?.pending === 0, "background tasks should settle after burst memory writes")
  assert(typeof status.memory?.topics === "number", "status memory.topics should be numeric")
  assert(typeof status.memory?.profile === "number", "status memory.profile should be numeric")
  assert(typeof status.memory?.timelineEvents === "number", "status memory.timelineEvents should be numeric")
  assert(Array.isArray(status.recent_events), "status recent_events should be an array")

  for (const eventId of eventIds.slice(-3)) {
    assert(status.recent_events.some((event) => event.id === eventId), "recent_events should include latest burst events")
  }
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

async function waitForMemoryPatches(tag: string, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const events = query<{ id: string }>("SELECT id FROM events WHERE payload LIKE ?", [`%${tag}%`])
    const topics = query<{ id: string }>("SELECT id FROM topics WHERE name LIKE ?", [`%${tag}%`])
    const timelines = query<{ id: string }>("SELECT id FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
    const profile = queryOne<{ value: string }>("SELECT value FROM profile WHERE key = ?", ["last_mock_message"])

    if (
      events.length >= expected &&
      topics.length >= expected &&
      timelines.length >= expected &&
      typeof profile?.value === "string" &&
      profile.value.includes(`${tag}-${expected - 1}`)
    ) {
      return
    }
    await delay(100)
  }
  throw new Error("burst memory patches were not fully written")
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as T
}

function cleanupBurstRows(tag: string): void {
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${tag}%`])
  run("DELETE FROM topics WHERE name LIKE ?", [`%${tag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
