import { randomUUID } from "crypto"

const contractTag = `codex-analysis-job-${Date.now()}`
const privateErrorMarker = `private-provider-output-${contractTag}`
const port = Number(process.env.API_PORT) || 3115

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { createWorkspaceEvent } = await import("../domain/event/types.js")
const { applyMemoryPatch } = await import("../domain/memory/store.js")
const {
  ensureAnalysisJob,
  getAnalysisJobById,
} = await import("../domain/analysis-job/store.js")
const { recoverAnalysisJobsAtStartup } = await import("./analysis-jobs.js")
const { correctMemoryProfile } = await import("./memory.js")
const { processMessage } = await import("../ai-runtime/operators/process-message.js")
const { drainBackgroundTasks } = await import("./background-tasks.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
const sourceEvent = insertEvent({
  ...createWorkspaceEvent({ text: contractTag }),
  timestamp: "2050-01-01T00:00:00.000Z",
})
const newerEvent = insertEvent({
  ...createWorkspaceEvent({ text: `${contractTag}-newer-profile` }),
  timestamp: "2099-01-01T00:00:00.000Z",
})
const interruptedEvent = insertEvent({
  ...createWorkspaceEvent({ text: `${contractTag}-interrupted` }),
  id: randomUUID(),
})
const server = startApiServer({ port, hostname: "127.0.0.1" })
const retryEventIds: string[] = []
let correctionEventId: string | null = null

try {
  await waitForHealth(port)
  const reply = await processMessage(sourceEvent, {
    callCompanion: async () => `reply:${contractTag}`,
    callAnalysis: async () => { throw new Error(privateErrorMarker) },
  })
  assert(reply.companionReply === `reply:${contractTag}`, "Companion reply must survive Analysis failure")
  const failedDrain = await drainBackgroundTasks(5_000)
  assert(failedDrain.completed, "failed Analysis task must settle")

  const failedJob = queryOne<AnalysisJobDbRow>("SELECT * FROM analysis_jobs WHERE source_event_id = ?", [sourceEvent.id])
  assert(failedJob?.status === "failed", "Analysis failure must persist failed status")
  assert(failedJob.attempt_count === 1, "first Analysis attempt count mismatch")
  assert(failedJob.error_code === "analysis_error", "Analysis error code mismatch")
  assert(!JSON.stringify(failedJob).includes(privateErrorMarker), "job state must not persist provider output")

  await verifyFailedJobApi(port, failedJob.id)
  seedNewerProfile()

  installCompletionFailureTrigger(failedJob.id)
  const failedRetry = await postRetry(port, failedJob.id)
  retryEventIds.push(failedRetry.retryEventId)
  assert(failedRetry.job?.status === "running", "retry response must expose running job")
  assert(failedRetry.job.attemptCount === 2, "retry must increment attempt count")
  const memoryFailed = await waitForJobStatus(failedJob.id, "failed")
  assert(memoryFailed.attempt_count === 2, "Memory failure attempt count mismatch")
  assert(memoryFailed.error_code === "memory_error", "Memory failure error code mismatch")
  verifyNoMemoryApplied()
  verifyNewerProfilePreserved()
  removeCompletionFailureTrigger()

  const retried = await postRetry(port, failedJob.id)
  retryEventIds.push(retried.retryEventId)
  assert(retried.job?.status === "running", "retry response must expose running job")
  assert(retried.job.attemptCount === 3, "second retry must increment attempt count")
  assert(retryEventIds.every((id) => typeof id === "string" && id.length > 0), "retry audit Event id missing")

  const succeeded = await waitForJobStatus(failedJob.id, "succeeded")
  assert(succeeded.attempt_count === 3, "succeeded retry attempt count mismatch")
  assert(succeeded.error_code === "", "succeeded retry must clear error code")
  for (const eventId of retryEventIds) verifyRetryAuditEvent(eventId, failedJob.id)
  verifyMemoryAppliedOnce()
  verifyNewerProfilePreserved()

  const duplicateRetry = await fetch(`http://127.0.0.1:${port}/api/analysis-jobs/${failedJob.id}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  assert(duplicateRetry.status === 409, `succeeded job retry expected 409, got ${duplicateRetry.status}`)
  verifyMemoryAppliedOnce()
  verifyGovernedCorrectionOverridesFutureSource()

  const interrupted = ensureAnalysisJob(interruptedEvent.id)
  assert(recoverAnalysisJobsAtStartup() === 1, "startup recovery must mark one pending job")
  const recovered = getAnalysisJobById(interrupted.id)
  assert(recovered?.status === "failed" && recovered.error_code === "interrupted", "interrupted job recovery mismatch")

  console.log("analysis job contract ok")
} finally {
  await drainBackgroundTasks(5_000)
  await stopApiServer(server)
  removeCompletionFailureTrigger()
  cleanupContractRows()
}

interface AnalysisJobDbRow {
  id: string
  status: string
  attempt_count: number
  error_code: string
}

async function verifyFailedJobApi(portNumber: number, jobId: string): Promise<void> {
  const health = await getJson<{
    analysis_jobs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
  }>(`http://127.0.0.1:${portNumber}/health`)
  assert(typeof health.analysis_jobs?.failed === "number" && health.analysis_jobs.failed >= 1, "health failed job count missing")

  const response = await fetch(`http://127.0.0.1:${portNumber}/api/analysis-jobs?status=failed&limit=999&offset=-1`)
  assert(response.ok, `failed job list request failed: ${response.status}`)
  const body = await response.json() as {
    items?: Array<Record<string, unknown>>
    limit?: number
    offset?: number
  }
  assert(body.limit === 100 && body.offset === 0, "analysis job pagination normalization mismatch")
  const item = body.items?.find((row) => row.id === jobId)
  assert(item?.status === "failed" && item.errorCode === "analysis_error", "failed job list item mismatch")
  assert(!("sourceText" in item) && !JSON.stringify(item).includes(contractTag), "job API must not expose source content")

  const invalidStatus = await fetch(`http://127.0.0.1:${portNumber}/api/analysis-jobs?status=unknown`)
  assert(invalidStatus.status === 400, `invalid job status expected 400, got ${invalidStatus.status}`)
}

function seedNewerProfile(): void {
  applyMemoryPatch({
    profile_updates: [{ key: "last_mock_message", value: `newer-${contractTag}`, confidence: 1 }],
    topic_updates: [],
    timeline_events: [],
  }, { sourceEventId: newerEvent.id })
}

async function postRetry(portNumber: number, jobId: string): Promise<{
  job?: { status?: string; attemptCount?: number }
  retryEventId: string
}> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/analysis-jobs/${jobId}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  if (response.status !== 202) throw new Error(`analysis retry failed: ${response.status} ${await response.text()}`)
  return await response.json() as {
    job?: { status?: string; attemptCount?: number }
    retryEventId: string
  }
}

async function waitForJobStatus(id: string, status: string): Promise<AnalysisJobDbRow> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const row = queryOne<AnalysisJobDbRow>("SELECT * FROM analysis_jobs WHERE id = ?", [id])
    if (row?.status === status) return row
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`analysis job did not reach ${status}`)
}

function verifyRetryAuditEvent(eventId: string, jobId: string): void {
  const event = queryOne<{ type: string; payload: string; metadata: string }>(
    "SELECT type, payload, metadata FROM events WHERE id = ?",
    [eventId],
  )
  assert(event?.type === "analysis_retry_requested", "retry audit Event type mismatch")
  const payload = JSON.parse(event.payload) as { analysis_job_id?: string; source_event_id?: string }
  assert(payload.analysis_job_id === jobId && payload.source_event_id === sourceEvent.id, "retry audit Event payload mismatch")
  const metadata = JSON.parse(event.metadata) as { purpose?: string; visibility?: string }
  assert(metadata.purpose === "analysis_recovery" && metadata.visibility === "user", "retry audit Event metadata mismatch")
}

function verifyMemoryAppliedOnce(): void {
  const topic = queryOne<{ message_count: number }>("SELECT message_count FROM topics WHERE name = ?", [contractTag])
  assert(topic?.message_count === 1, "retried Analysis must apply Topic exactly once")
  const timeline = query<{ id: string }>("SELECT id FROM timeline_events WHERE source_event_id = ?", [sourceEvent.id])
  assert(timeline.length === 1, "retried Analysis must append Timeline exactly once")
}

function verifyNoMemoryApplied(): void {
  const topic = queryOne<{ id: string }>("SELECT id FROM topics WHERE name = ?", [contractTag])
  assert(!topic, "failed atomic completion must roll back Topic")
  const timeline = query<{ id: string }>("SELECT id FROM timeline_events WHERE source_event_id = ?", [sourceEvent.id])
  assert(timeline.length === 0, "failed atomic completion must roll back Timeline")
}

function verifyNewerProfilePreserved(): void {
  const profile = queryOne<{ value: string; source_event_id: string | null }>(
    "SELECT value, source_event_id FROM profile WHERE key = 'last_mock_message'",
  )
  assert(profile?.value === JSON.stringify(`newer-${contractTag}`), "old retry must not overwrite newer Profile value")
  assert(profile.source_event_id === newerEvent.id, "old retry must preserve newer Profile provenance")
}

function verifyGovernedCorrectionOverridesFutureSource(): void {
  const corrected = correctMemoryProfile({
    key: "last_mock_message",
    value: `corrected-${contractTag}`,
    reason: "analysis job contract governed override",
  })
  correctionEventId = corrected.event.id
  assert(corrected.profile.value === JSON.stringify(`corrected-${contractTag}`), "governed correction must bypass stale guard")
  assert(corrected.profile.source_event_id === correctionEventId, "governed correction provenance mismatch")
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("analysis job contract server did not become healthy")
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

function cleanupContractRows(): void {
  run("DELETE FROM timeline_events WHERE source_event_id = ?", [sourceEvent.id])
  run("DELETE FROM profile WHERE key = 'last_mock_message' AND value LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM topics WHERE name = ?", [contractTag])
  run("DELETE FROM analysis_jobs WHERE source_event_id IN (?, ?)", [sourceEvent.id, interruptedEvent.id])
  for (const retryEventId of retryEventIds) run("DELETE FROM events WHERE id = ?", [retryEventId])
  if (correctionEventId) run("DELETE FROM events WHERE id = ?", [correctionEventId])
  run("DELETE FROM events WHERE id IN (?, ?, ?)", [sourceEvent.id, newerEvent.id, interruptedEvent.id])
}

function installCompletionFailureTrigger(jobId: string): void {
  if (!/^[0-9a-f-]{36}$/.test(jobId)) throw new Error("unexpected analysis job id")
  run(
    `CREATE TEMP TRIGGER contract_fail_analysis_completion
     BEFORE UPDATE OF status ON analysis_jobs
     WHEN NEW.id = '${jobId}' AND NEW.status = 'succeeded'
     BEGIN
       SELECT RAISE(ABORT, 'forced analysis completion failure');
     END`,
  )
}

function removeCompletionFailureTrigger(): void {
  run("DROP TRIGGER IF EXISTS contract_fail_analysis_completion")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
