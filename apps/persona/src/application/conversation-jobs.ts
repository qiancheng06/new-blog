import type { ProcessMessageOptions } from "../ai-runtime/operators/process-message.js"
import { processMessage } from "../ai-runtime/operators/process-message.js"
import {
  beginConversationJobAttempt,
  ensureConversationJob,
  getConversationJobById,
  getConversationJobStats,
  listConversationJobs,
  markConversationJobFailed,
  markConversationJobSucceeded,
  recoverInterruptedConversationJobs,
  requestConversationJobRetry,
  type ConversationJobErrorCode,
  type ConversationJobListOptions,
  type ConversationJobRow,
  type ConversationJobStatus,
} from "../domain/conversation-job/store.js"
import { getEventById, insertEvent, type EventRow } from "../domain/event/store.js"
import {
  createCompanionReplyEvent,
  createConversationRetryRequestedEvent,
  type ConversationRetryRequestedPayload,
} from "../domain/event/types.js"
import { withTransaction } from "../infra/db/pool.js"
import { enqueueMemoryAnalysis } from "./background-tasks.js"

export interface ConversationJob {
  id: string
  sourceEventId: string
  status: ConversationJobStatus
  attemptCount: number
  errorCode: Exclude<ConversationJobErrorCode, ""> | null
  replyEventId: string | null
  retryEventId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}

export interface ConversationExecutionResult {
  job: ConversationJob
  replyEvent: EventRow
  companionReply: string
}

export interface ConversationRetryResult extends ConversationExecutionResult {
  retryEventId: string
}

export class ConversationJobValidationError extends Error {}
export class ConversationJobNotFoundError extends Error {}
export class ConversationJobConflictError extends Error {}
export class ConversationExecutionError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly sourceEventId: string,
  ) {
    super("conversation processing failed")
  }
}

const activeExecutions = new Map<string, Promise<ConversationExecutionResult>>()

export function ensureConversationJobForEvent(sourceEventId: string): ConversationJob {
  return toConversationJob(ensureConversationJob(sourceEventId))
}

export function executeConversationJob(
  sourceEvent: EventRow,
  dependencies: ProcessMessageOptions = {},
): Promise<ConversationExecutionResult> {
  const current = ensureConversationJob(sourceEvent.id)
  if (current.status === "succeeded") return Promise.resolve(readSucceededResult(current, sourceEvent))

  const active = activeExecutions.get(current.id)
  if (active) return active
  if (current.status === "running") {
    throw new ConversationJobConflictError("conversation job is already running")
  }
  if (current.status !== "pending") {
    throw new ConversationJobConflictError("conversation job is not ready")
  }

  const attempt = beginConversationJobAttempt(current.id)
  if (!attempt) throw new ConversationJobConflictError("conversation job is not ready")

  let companionGenerated = false
  const task = (async () => {
    try {
      const processed = await processMessage(sourceEvent, dependencies)
      companionGenerated = true
      return withTransaction(() => {
        const replyEvent = insertEvent(createCompanionReplyEvent({
          text: processed.companionReply,
          in_reply_to: sourceEvent.id,
        }, parseMetadata(sourceEvent.metadata)))
        const succeeded = markConversationJobSucceeded(attempt.id, attempt.attempt_count, replyEvent.id)
        if (!succeeded) throw new ConversationJobStateError()
        if (!dependencies.callAnalysis && dependencies.backgroundAnalysis !== false) {
          enqueueMemoryAnalysis({
            sourceEventId: sourceEvent.id,
            historyEventIds: processed.historyEventIds,
            memoryEnabled: dependencies.memoryEnabled !== false,
          })
        }
        return {
          job: toConversationJob(getConversationJobById(attempt.id)!),
          replyEvent,
          companionReply: processed.companionReply,
        }
      })
    } catch (err) {
      const errorCode: Exclude<ConversationJobErrorCode, ""> = err instanceof ConversationJobStateError
        ? "state_error"
        : companionGenerated
          ? "reply_error"
          : "companion_error"
      try {
        markConversationJobFailed(attempt.id, attempt.attempt_count, errorCode)
      } catch {
        // The readiness/status path reports database failure separately.
      }
      throw new ConversationExecutionError(attempt.id, sourceEvent.id)
    }
  })().finally(() => {
    if (activeExecutions.get(current.id) === task) activeExecutions.delete(current.id)
  })

  activeExecutions.set(current.id, task)
  return task
}

export function retryConversationJob(
  idValue: string,
  reason: ConversationRetryRequestedPayload["reason"] = "manual",
  dependencies: ProcessMessageOptions = {},
): Promise<ConversationRetryResult> {
  const id = idValue.trim()
  if (!id) throw new ConversationJobValidationError("conversation job id is required")
  const job = getConversationJobById(id)
  if (!job) throw new ConversationJobNotFoundError("conversation job not found")
  if (job.status !== "failed") throw new ConversationJobConflictError("conversation job is not retryable")
  const sourceEvent = getEventById(job.source_event_id)
  if (!sourceEvent) throw new ConversationJobNotFoundError("conversation source event not found")

  const retryEvent = withTransaction(() => {
    const event = insertEvent(createConversationRetryRequestedEvent({
      conversation_job_id: job.id,
      source_event_id: sourceEvent.id,
      reason,
    }))
    const pending = requestConversationJobRetry(job.id, event.id)
    if (!pending) throw new ConversationJobConflictError("conversation job is not retryable")
    return event
  })

  return executeConversationJob(sourceEvent, dependencies).then((result) => ({
    ...result,
    retryEventId: retryEvent.id,
  }))
}

export function getConversationJobs(options: ConversationJobListOptions = {}): ConversationJob[] {
  return listConversationJobs(options).map(toConversationJob)
}

export function getConversationJobsStatus() {
  return getConversationJobStats()
}

export function parseConversationJobStatus(value: string | undefined): ConversationJobStatus | undefined {
  if (value === undefined) return undefined
  if (value === "pending" || value === "running" || value === "succeeded" || value === "failed") return value
  throw new ConversationJobValidationError("conversation job status is invalid")
}

export function recoverConversationJobsAtStartup(): number {
  return recoverInterruptedConversationJobs()
}

function readSucceededResult(job: ConversationJobRow, sourceEvent: EventRow): ConversationExecutionResult {
  const replyEvent = job.reply_event_id ? getEventById(job.reply_event_id) : null
  if (!replyEvent) throw new ConversationJobConflictError("conversation reply event is unavailable")
  const payload = parseMetadata(replyEvent.payload)
  const companionReply = typeof payload.text === "string" ? payload.text : ""
  if (!companionReply) throw new ConversationJobConflictError("conversation reply event is invalid")
  return {
    job: toConversationJob(job),
    replyEvent,
    companionReply,
  }
}

function toConversationJob(row: ConversationJobRow): ConversationJob {
  return {
    id: row.id,
    sourceEventId: row.source_event_id,
    status: row.status,
    attemptCount: row.attempt_count,
    errorCode: row.error_code || null,
    replyEventId: row.reply_event_id,
    retryEventId: row.retry_event_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

class ConversationJobStateError extends Error {}
