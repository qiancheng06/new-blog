import { randomUUID } from "crypto"
import { hostname } from "os"
import { buildPrompts } from "../ai-runtime/prompts/prompt-builder.js"
import { getEventById, getEventsByIds } from "../domain/event/store.js"
import { applyMemoryPatchWithinTransaction, type MemoryPatchWriteResult } from "../domain/memory/index.js"
import { config } from "../infra/config/index.js"
import { callAnalysis } from "../infra/llm/deepseek.js"
import { query, queryOne, run, withImmediateTransaction, withTransaction } from "../infra/db/pool.js"

export type BackgroundJobStatus = "queued" | "running" | "succeeded" | "failed"

interface BackgroundJobRow {
  id: string
  type: "memory_analysis"
  source_event_id: string
  payload: string
  status: BackgroundJobStatus
  attempts: number
  max_attempts: number
  available_at: string
  locked_at: string | null
  lock_owner: string | null
  last_error: string | null
  idempotency_key: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface BackgroundJobSummary {
  id: string
  type: "memory_analysis"
  sourceEventId: string
  status: BackgroundJobStatus
  attempts: number
  maxAttempts: number
  availableAt: string
  lastError: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface BackgroundTaskStats {
  queued: number
  running: number
  failed: number
  succeeded: number
  inMemory: number
  pending: number
}

export interface BackgroundTaskDrainResult {
  completed: boolean
  pending: number
}

export interface EnqueueMemoryAnalysisOptions {
  sourceEventId: string
  historyEventIds: string[]
  memoryEnabled: boolean
}

interface MemoryAnalysisPayload {
  historyEventIds: string[]
  memoryEnabled: boolean
}

const WORKER_POLL_MS = 750
const WORKER_LEASE_MINUTES = 10
const RETRY_DELAYS_SECONDS = [10, 60, 300]
const workerId = `${hostname()}:${process.pid}:${randomUUID()}`
const pendingTasks = new Map<Promise<void>, string>()
let workerRunning = false
let workerTimer: ReturnType<typeof setTimeout> | null = null

export function enqueueMemoryAnalysis(options: EnqueueMemoryAnalysisOptions): BackgroundJobSummary {
  const sourceEventId = options.sourceEventId.trim()
  if (!sourceEventId) throw new Error("sourceEventId is required")
  const payload: MemoryAnalysisPayload = {
    historyEventIds: [...new Set(options.historyEventIds)].filter(Boolean).slice(0, 100),
    memoryEnabled: options.memoryEnabled,
  }
  const idempotencyKey = `memory-analysis:${sourceEventId}`
  const id = randomUUID()

  run(
    `INSERT OR IGNORE INTO background_jobs
       (id, type, source_event_id, payload, idempotency_key)
     VALUES (?, 'memory_analysis', ?, ?, ?)`,
    [id, sourceEventId, JSON.stringify(payload), idempotencyKey],
  )
  const row = queryOne<BackgroundJobRow>("SELECT * FROM background_jobs WHERE idempotency_key = ?", [idempotencyKey])
  if (!row) throw new Error("memory analysis job could not be enqueued")
  wakeBackgroundTaskWorker()
  return toSummary(row)
}

export function startBackgroundTaskWorker(): void {
  if (workerRunning) return
  workerRunning = true
  recoverExpiredJobs()
  scheduleWorker(0)
}

export function isBackgroundTaskWorkerRunning(): boolean {
  return workerRunning
}

export function stopBackgroundTaskWorker(): void {
  workerRunning = false
  if (workerTimer) clearTimeout(workerTimer)
  workerTimer = null
}

export function trackBackgroundTask(task: Promise<unknown>, label: string): void {
  const normalizedLabel = label.trim() || "background-task"
  let tracked: Promise<void>

  tracked = task
    .then(() => undefined)
    .catch((err) => {
      console.error(`[background task error] ${normalizedLabel}:`, err instanceof Error ? err.message : err)
    })
    .finally(() => {
      pendingTasks.delete(tracked)
    })

  pendingTasks.set(tracked, normalizedLabel)
}

export function getBackgroundTaskStats(): BackgroundTaskStats {
  const counts = query<{ status: BackgroundJobStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM background_jobs GROUP BY status",
  )
  const byStatus = new Map(counts.map((row) => [row.status, Number(row.count)]))
  const inMemory = [...pendingTasks.values()].filter((label) => !label.startsWith("background-job:")).length
  const queued = byStatus.get("queued") ?? 0
  const running = byStatus.get("running") ?? 0
  return {
    queued,
    running,
    failed: byStatus.get("failed") ?? 0,
    succeeded: byStatus.get("succeeded") ?? 0,
    inMemory,
    pending: queued + running + inMemory,
  }
}

export function getPendingBackgroundTaskCount(): number {
  return getBackgroundTaskStats().pending
}

export function listBackgroundJobs(options: {
  status?: BackgroundJobStatus
  limit?: number
} = {}): BackgroundJobSummary[] {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)))
  const rows = options.status
    ? query<BackgroundJobRow>(
      "SELECT * FROM background_jobs WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
      [options.status, limit],
    )
    : query<BackgroundJobRow>("SELECT * FROM background_jobs ORDER BY updated_at DESC LIMIT ?", [limit])
  return rows.map(toSummary)
}

export function retryBackgroundJob(id: string): BackgroundJobSummary {
  const normalizedId = id.trim()
  const existing = queryOne<BackgroundJobRow>("SELECT * FROM background_jobs WHERE id = ?", [normalizedId])
  if (!existing) throw new BackgroundJobNotFoundError("background job not found")
  if (existing.status !== "failed") throw new BackgroundJobConflictError("only failed jobs can be retried")

  run(
    `UPDATE background_jobs
     SET status = 'queued', attempts = 0, available_at = datetime('now'), locked_at = NULL,
         lock_owner = NULL, last_error = NULL, completed_at = NULL, updated_at = datetime('now')
     WHERE id = ? AND status = 'failed'`,
    [normalizedId],
  )
  const updated = queryOne<BackgroundJobRow>("SELECT * FROM background_jobs WHERE id = ?", [normalizedId])!
  wakeBackgroundTaskWorker()
  return toSummary(updated)
}

export async function drainBackgroundTasks(timeoutMs = 25_000): Promise<BackgroundTaskDrainResult> {
  const deadline = Date.now() + Math.max(0, timeoutMs)

  while (pendingTasks.size > 0) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return { completed: false, pending: pendingTasks.size }
    const completed = await settleWithin([...pendingTasks.keys()], remainingMs)
    if (!completed) return { completed: false, pending: pendingTasks.size }
  }

  return { completed: true, pending: 0 }
}

export class BackgroundJobNotFoundError extends Error {}
export class BackgroundJobConflictError extends Error {}

function wakeBackgroundTaskWorker(): void {
  if (!workerRunning) return
  scheduleWorker(0)
}

function scheduleWorker(delayMs: number): void {
  if (!workerRunning) return
  if (workerTimer) clearTimeout(workerTimer)
  workerTimer = setTimeout(runWorker, delayMs)
  workerTimer.unref()
}

function runWorker(): void {
  workerTimer = null
  if (!workerRunning) return
  const job = claimNextJob()
  if (!job) {
    scheduleWorker(WORKER_POLL_MS)
    return
  }

  const task = executeClaimedJob(job)
    .catch((err) => recordJobFailure(job, err))
    .finally(() => scheduleWorker(0))
  trackBackgroundTask(task, `background-job:${job.id}`)
}

function claimNextJob(): BackgroundJobRow | null {
  return withImmediateTransaction(() => {
    recoverExpiredJobs()
    const candidate = queryOne<BackgroundJobRow>(
      `SELECT * FROM background_jobs
       WHERE status = 'queued' AND datetime(available_at) <= datetime('now')
       ORDER BY created_at ASC LIMIT 1`,
    )
    if (!candidate) return null

    const result = run(
      `UPDATE background_jobs
       SET status = 'running', attempts = attempts + 1, locked_at = datetime('now'),
           lock_owner = ?, updated_at = datetime('now')
       WHERE id = ? AND status = 'queued'`,
      [workerId, candidate.id],
    )
    if (result.changes !== 1) return null
    return queryOne<BackgroundJobRow>("SELECT * FROM background_jobs WHERE id = ?", [candidate.id])
  })
}

function recoverExpiredJobs(): void {
  run(
    `UPDATE background_jobs
     SET status = 'queued', available_at = datetime('now'), locked_at = NULL, lock_owner = NULL,
         last_error = COALESCE(last_error, 'worker lease expired'), updated_at = datetime('now')
     WHERE status = 'running'
       AND datetime(locked_at) <= datetime('now', '-${WORKER_LEASE_MINUTES} minutes')`,
  )
}

async function executeClaimedJob(job: BackgroundJobRow): Promise<void> {
  if (job.type !== "memory_analysis") throw new Error(`unsupported background job type: ${job.type}`)
  const sourceEvent = getEventById(job.source_event_id)
  if (!sourceEvent) throw new Error("source event no longer exists")
  const payload = parseMemoryAnalysisPayload(job.payload)
  const recentEvents = getEventsByIds(payload.historyEventIds)
  const prompts = buildPrompts({
    recentEvents,
    ...(payload.memoryEnabled ? {} : { memoryText: "" }),
  })
  const sourcePayload = JSON.parse(sourceEvent.payload) as Record<string, unknown>
  const userText = typeof sourcePayload.text === "string" ? sourcePayload.text : ""
  const result = await callAnalysis(prompts.analysisSystemPrompt, userText, prompts.historyText, {
    endpoint: config.analysisEndpoint || undefined,
    apiKey: config.analysisApiKey || config.openaiApiKey || undefined,
    model: config.analysisModel || config.llmModel,
  })

  const written = completeJobWithMemoryPatch(job, result.memory_patch)
  logMemoryWrite(result, written)
}

function completeJobWithMemoryPatch(
  job: BackgroundJobRow,
  patch: Parameters<typeof applyMemoryPatchWithinTransaction>[0],
): MemoryPatchWriteResult {
  return withTransaction(() => {
    const written = applyMemoryPatchWithinTransaction(patch, { sourceEventId: job.source_event_id })
    const updated = run(
      `UPDATE background_jobs
       SET status = 'succeeded', completed_at = datetime('now'), locked_at = NULL,
           lock_owner = NULL, last_error = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'running' AND lock_owner = ?`,
      [job.id, workerId],
    )
    if (updated.changes !== 1) throw new Error("background job lease was lost before commit")
    return written
  })
}

function recordJobFailure(job: BackgroundJobRow, error: unknown): void {
  const message = sanitizeJobError(error)
  const shouldRetry = job.attempts < job.max_attempts
  if (shouldRetry) {
    const delaySeconds = RETRY_DELAYS_SECONDS[Math.min(job.attempts - 1, RETRY_DELAYS_SECONDS.length - 1)]
    run(
      `UPDATE background_jobs
       SET status = 'queued', available_at = datetime('now', ?), locked_at = NULL,
           lock_owner = NULL, last_error = ?, updated_at = datetime('now')
       WHERE id = ? AND status = 'running' AND lock_owner = ?`,
      [`+${delaySeconds} seconds`, message, job.id, workerId],
    )
  } else {
    run(
      `UPDATE background_jobs
       SET status = 'failed', locked_at = NULL, lock_owner = NULL, last_error = ?,
           completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status = 'running' AND lock_owner = ?`,
      [message, job.id, workerId],
    )
  }
  console.error(`[background job error] ${job.id}: ${message}`)
}

function parseMemoryAnalysisPayload(value: string): MemoryAnalysisPayload {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid memory analysis payload")
  const payload = parsed as Partial<MemoryAnalysisPayload>
  if (!Array.isArray(payload.historyEventIds) || !payload.historyEventIds.every((id) => typeof id === "string")) {
    throw new Error("invalid memory analysis history")
  }
  if (typeof payload.memoryEnabled !== "boolean") throw new Error("invalid memory analysis setting")
  return {
    historyEventIds: [...new Set(payload.historyEventIds)].slice(0, 100),
    memoryEnabled: payload.memoryEnabled,
  }
}

function toSummary(row: BackgroundJobRow): BackgroundJobSummary {
  return {
    id: row.id,
    type: row.type,
    sourceEventId: row.source_event_id,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function sanitizeJobError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error)
  for (const secret of [config.analysisApiKey, config.openaiApiKey]) {
    if (secret) message = message.replaceAll(secret, "[redacted]")
  }
  return message.slice(0, 1_000)
}

function logMemoryWrite(result: Awaited<ReturnType<typeof callAnalysis>>, written: MemoryPatchWriteResult): void {
  if (result.research.core_points.length > 0) console.log("  [analysis]", JSON.stringify(result.research))
  if (result.critic.confidence > 0) console.log("  [critic]", JSON.stringify(result.critic))
  if (result.memory_patch.profile_updates.length > 0 || result.memory_patch.topic_updates.length > 0) {
    console.log("  [memory]", JSON.stringify(result.memory_patch))
  }
  if (written.topics.length > 0 || written.profile.length > 0 || written.timelineEvents.length > 0) {
    console.log(
      `  [memory written] topics=${written.topics.length} profile=${written.profile.length} timeline=${written.timelineEvents.length}`,
    )
  }
}

function settleWithin(tasks: Promise<void>[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(false)
    }, timeoutMs)

    void Promise.all(tasks).then(() => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(true)
    })
  })
}
