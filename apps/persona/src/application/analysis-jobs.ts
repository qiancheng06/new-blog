import type { AnalysisResult } from "../infra/llm/deepseek.js"
import { callAnalysis } from "../infra/llm/deepseek.js"
import {
  beginAnalysisJobAttempt,
  ensureAnalysisJob,
  getAnalysisJobById,
  getAnalysisJobStats,
  listAnalysisJobs,
  markAnalysisJobFailed,
  markAnalysisJobSucceeded,
  recoverInterruptedAnalysisJobs,
  requestAnalysisJobRetry,
  type AnalysisJobListOptions,
  type AnalysisJobRow,
  type AnalysisJobStatus,
} from "../domain/analysis-job/store.js"
import { getEventById, getRecentEvents, insertEvent, type EventRow } from "../domain/event/store.js"
import { createAnalysisRetryRequestedEvent } from "../domain/event/types.js"
import { applyMemoryPatch } from "../domain/memory/store.js"
import { withTransaction } from "../infra/db/pool.js"
import { buildPrompts } from "../ai-runtime/prompts/prompt-builder.js"
import { trackBackgroundTask } from "./background-tasks.js"
import { reserveOrderedMemoryCommit, type OrderedMemoryCommitReservation } from "./ordered-memory-commit.js"

export interface AnalysisJob {
  id: string
  sourceEventId: string
  status: AnalysisJobStatus
  attemptCount: number
  errorCode: string | null
  retryEventId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}

export interface AnalysisRetryResult {
  job: AnalysisJob
  retryEventId: string
}

export class AnalysisJobValidationError extends Error {}
export class AnalysisJobNotFoundError extends Error {}
export class AnalysisJobConflictError extends Error {}

export function scheduleAnalysisForEvent(options: {
  sourceEventId: string
  reservation: OrderedMemoryCommitReservation
  analyze: () => Promise<AnalysisResult>
}): AnalysisJob {
  const job = ensureAnalysisJob(options.sourceEventId)
  if (job.status !== "pending") {
    options.reservation.cancel()
    return toAnalysisJob(job)
  }
  return scheduleAnalysisAttempt(job, options.reservation, options.analyze)
}

export function getAnalysisJobs(options: AnalysisJobListOptions = {}): AnalysisJob[] {
  return listAnalysisJobs(options).map(toAnalysisJob)
}

export function getAnalysisJobsStatus() {
  return getAnalysisJobStats()
}

export function parseAnalysisJobStatus(value: string | undefined): AnalysisJobStatus | undefined {
  if (value === undefined) return undefined
  if (value === "pending" || value === "running" || value === "succeeded" || value === "failed") return value
  throw new AnalysisJobValidationError("analysis job status is invalid")
}

export function retryAnalysisJob(idValue: string): AnalysisRetryResult {
  const id = idValue.trim()
  if (!id) throw new AnalysisJobValidationError("analysis job id is required")
  const job = getAnalysisJobById(id)
  if (!job) throw new AnalysisJobNotFoundError("analysis job not found")
  if (job.status !== "failed") throw new AnalysisJobConflictError("analysis job is not retryable")

  const sourceEvent = getEventById(job.source_event_id)
  if (!sourceEvent) throw new AnalysisJobNotFoundError("analysis source event not found")
  const retryEvent = withTransaction(() => {
    const event = insertEvent(createAnalysisRetryRequestedEvent({
      analysis_job_id: job.id,
      source_event_id: sourceEvent.id,
    }))
    const pending = requestAnalysisJobRetry(job.id, event.id)
    if (!pending) throw new AnalysisJobConflictError("analysis job is not retryable")
    return event
  })

  const prompts = buildRetryPrompts(sourceEvent)
  const reservation = reserveOrderedMemoryCommit()
  const running = scheduleAnalysisAttempt(
    getAnalysisJobById(job.id)!,
    reservation,
    () => callAnalysis(prompts.analysisSystemPrompt, prompts.userText, prompts.historyText),
  )
  return { job: running, retryEventId: retryEvent.id }
}

export function recoverAnalysisJobsAtStartup(): number {
  return recoverInterruptedAnalysisJobs()
}

function scheduleAnalysisAttempt(
  job: AnalysisJobRow,
  reservation: OrderedMemoryCommitReservation,
  analyze: () => Promise<AnalysisResult>,
): AnalysisJob {
  const running = beginAnalysisJobAttempt(job.id)
  if (!running) {
    reservation.cancel()
    throw new AnalysisJobConflictError("analysis job is not pending")
  }

  let analysisFailed = false
  const task = reservation.run(
    async () => {
      try {
        return await analyze()
      } catch (err) {
        analysisFailed = true
        markAnalysisJobFailed(running.id, running.attempt_count, "analysis_error")
        throw err
      }
    },
    (result) => completeAnalysisJob(running, result),
  ).catch(() => {
    const errorCode = analysisFailed ? "analysis_error" : "memory_error"
    if (!analysisFailed) markAnalysisJobFailed(running.id, running.attempt_count, errorCode)
    throw new Error(`analysis job failed (${errorCode})`)
  })

  trackBackgroundTask(task, `analysis-job:${running.id}`)
  return toAnalysisJob(running)
}

function completeAnalysisJob(job: AnalysisJobRow, result: AnalysisResult): void {
  withTransaction(() => {
    const current = getAnalysisJobById(job.id)
    if (!current || current.status !== "running" || current.attempt_count !== job.attempt_count) {
      throw new AnalysisJobConflictError("analysis job attempt is stale")
    }
    logAnalysisResult(result)
    const written = applyMemoryPatch(result.memory_patch, { sourceEventId: job.source_event_id })
    const succeeded = markAnalysisJobSucceeded(job.id, job.attempt_count)
    if (!succeeded) throw new AnalysisJobConflictError("analysis job completion was not persisted")
    if (written.topics.length > 0 || written.profile.length > 0 || written.timelineEvents.length > 0) {
      console.log(
        `  [memory written] topics=${written.topics.length} profile=${written.profile.length} timeline=${written.timelineEvents.length}`,
      )
    }
  })
}

function buildRetryPrompts(event: EventRow): {
  analysisSystemPrompt: string
  historyText: string
  userText: string
} {
  const payload = JSON.parse(event.payload) as Record<string, unknown>
  const userText = typeof payload.text === "string" ? payload.text : ""
  const recentEvents = getRecentEvents(21).filter((item) => item.id !== event.id)
  const prompts = buildPrompts({ recentEvents })
  return {
    analysisSystemPrompt: prompts.analysisSystemPrompt,
    historyText: prompts.historyText,
    userText,
  }
}

function logAnalysisResult(result: AnalysisResult): void {
  console.log(
    "  [analysis completed] " +
    `core_points=${result.research.core_points.length} ` +
    `profile_updates=${result.memory_patch.profile_updates.length} ` +
    `topic_updates=${result.memory_patch.topic_updates.length} ` +
    `timeline_events=${result.memory_patch.timeline_events.length}`,
  )
}

function toAnalysisJob(row: AnalysisJobRow): AnalysisJob {
  return {
    id: row.id,
    sourceEventId: row.source_event_id,
    status: row.status,
    attemptCount: row.attempt_count,
    errorCode: row.error_code || null,
    retryEventId: row.retry_event_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  }
}
