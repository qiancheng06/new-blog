import { randomUUID } from "crypto"

const tag = `background-contract-${Date.now()}`
const browserSecret = `${tag}-browser-secret`
const backendSecret = `${tag}-backend-secret`
const port = Number(process.env.API_PORT) || 3117

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""
process.env.PERSONA_ANALYSIS_API_KEY = backendSecret

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const {
  enqueueMemoryAnalysis,
  startBackgroundTaskWorker,
  stopBackgroundTaskWorker,
} = await import("./background-tasks.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
const primaryEvent = insertEvent(createEvent(`${tag} primary`))
const primaryJob = enqueueMemoryAnalysis({
  sourceEventId: primaryEvent.id,
  historyEventIds: [],
  memoryEnabled: true,
})
const duplicateJob = enqueueMemoryAnalysis({
  sourceEventId: primaryEvent.id,
  historyEventIds: [],
  memoryEnabled: true,
})
assert(primaryJob.id === duplicateJob.id, "memory analysis enqueue must be idempotent per source event")

const staleEvent = insertEvent(createEvent(`${tag} stale`))
const staleJobId = randomUUID()
run(
  `INSERT INTO background_jobs
     (id, type, source_event_id, payload, status, attempts, locked_at, lock_owner, idempotency_key)
   VALUES (?, 'memory_analysis', ?, ?, 'running', 1, '2000-01-01 00:00:00', 'dead-worker', ?)`,
  [staleJobId, staleEvent.id, JSON.stringify({ historyEventIds: [], memoryEnabled: true }), `memory-analysis:${staleEvent.id}`],
)

const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  await waitForJob(primaryJob.id, "succeeded")
  await waitForJob(staleJobId, "succeeded")
  verifyIdempotentMemoryWrite()
  verifySecretsAreNotPersisted()
  await verifyStatus(port)

  stopBackgroundTaskWorker()
  const retryEvent = insertEvent(createEvent(`${tag} retry`))
  const retryJob = enqueueMemoryAnalysis({ sourceEventId: retryEvent.id, historyEventIds: [], memoryEnabled: true })
  run(
    `UPDATE background_jobs
     SET status = 'failed', attempts = max_attempts, last_error = 'contract failure', completed_at = datetime('now')
     WHERE id = ?`,
    [retryJob.id],
  )
  await verifyFailedJobApi(port, retryJob.id)
  await retryJobApi(port, retryJob.id)
  startBackgroundTaskWorker()
  await waitForJob(retryJob.id, "succeeded")
  console.log("background jobs contract ok")
} finally {
  cleanup()
  await stopApiServer(server)
}

function createEvent(text: string) {
  return {
    source: "web" as const,
    type: "message" as const,
    payload: { text },
    timestamp: new Date().toISOString(),
    metadata: { purpose: "background_contract" },
  }
}

async function verifyStatus(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/status`)
  assert(response.ok, "background status request failed")
  const body = await response.json() as {
    background_tasks?: { queued?: number; running?: number; failed?: number; pending?: number }
  }
  assert(typeof body.background_tasks?.queued === "number", "status must expose queued jobs")
  assert(typeof body.background_tasks?.running === "number", "status must expose running jobs")
  assert(typeof body.background_tasks?.failed === "number", "status must expose failed jobs")
  assert(typeof body.background_tasks?.pending === "number", "status must expose total pending work")
}

async function verifyFailedJobApi(portNumber: number, id: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/background-jobs?status=failed&limit=20`)
  assert(response.ok, "failed background jobs request failed")
  const body = await response.json() as { items?: Array<Record<string, unknown>> }
  const item = body.items?.find((candidate) => candidate.id === id)
  assert(item, "failed background job must be listed")
  assert(!("payload" in item), "background job API must not expose payload content")
  assert(item.lastError === "contract failure", "background job API must expose diagnostic error metadata")
}

async function retryJobApi(portNumber: number, id: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/background-jobs/${id}/retry`, {
    method: "POST",
  })
  if (!response.ok) throw new Error(`background retry failed: ${response.status} ${await response.text()}`)
  const body = await response.json() as { job?: { status?: string; attempts?: number } }
  assert(body.job?.status === "queued", "manual retry must queue the failed job")
  assert(body.job.attempts === 0, "manual retry must reset attempts")
}

function verifyIdempotentMemoryWrite(): void {
  const topic = queryOne<{ message_count: number }>("SELECT message_count FROM topics WHERE name = ?", [`${tag} primary`])
  assert(topic?.message_count === 1, "duplicate enqueue must not apply a memory patch twice")
}

function verifySecretsAreNotPersisted(): void {
  const leaked = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM background_jobs WHERE payload LIKE ? OR payload LIKE ?",
    [`%${browserSecret}%`, `%${backendSecret}%`],
  )
  assert(leaked?.count === 0, "browser and backend API keys must never be persisted in background jobs")
}

async function waitForJob(id: string, status: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const row = queryOne<{ status: string; last_error: string | null }>(
      "SELECT status, last_error FROM background_jobs WHERE id = ?",
      [id],
    )
    if (row?.status === status) return
    if (row?.status === "failed") throw new Error(`background job failed: ${row.last_error}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`background job ${id} did not reach ${status}`)
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${portNumber}/health`)).ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("background contract server did not become healthy")
}

function cleanup(): void {
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${tag}%`])
  run("DELETE FROM topics WHERE name LIKE ?", [`${tag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
