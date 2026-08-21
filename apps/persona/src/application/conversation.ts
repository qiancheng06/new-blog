import type {
  ProcessMessageDependencies,
  ProcessMessageOptions,
} from "../ai-runtime/operators/process-message.js"
import { callAnalysis } from "../infra/llm/deepseek.js"
import { countEventsToday, getRecentEvents, insertEventOnce, type EventRow } from "../domain/event/store.js"
import type { Event } from "../domain/event/types.js"
import type { ProjectRecord } from "../domain/project/store.js"
import type { TodoRow } from "../domain/todo/store.js"
import { isCaptureSource, isCaptureType } from "../domain/capture/validation.js"
import { withTransaction } from "../infra/db/pool.js"
import {
  ensureAnalysisJobForEvent,
  executeAnalysisJobForStoredEvent,
  getAnalysisJobForEvent,
  type AnalysisJob,
} from "./analysis-jobs.js"
import {
  ensureConversationJobForEvent,
  executeConversationJob,
  retryConversationJob,
  type ConversationJob,
} from "./conversation-jobs.js"
import { isBackgroundTaskWorkerRunning } from "./background-tasks.js"
import { captureProjectEvent } from "./projects.js"
import { captureTodoEvent } from "./todos.js"

export const CONVERSATION_FALLBACK_REPLY = "嗯，我在的。"

export interface ConversationResult {
  event: EventRow
  duplicate: boolean
  companionReply?: string
  replyEvent?: EventRow
  job?: ConversationJob
  todo?: TodoRow
  project?: ProjectRecord
  analysisJob?: AnalysisJob
}

export interface ConversationOptions {
  shouldReply?: boolean
  resumeDuplicate?: boolean
  ai?: ProcessMessageOptions
  dependencies?: ProcessMessageDependencies
}

export async function handleConversationEvent(
  event: Event,
  options: ConversationOptions = {},
): Promise<ConversationResult> {
  const shouldReply = options.shouldReply !== false
  const processOptions: ProcessMessageOptions = {
    ...options.ai,
    ...options.dependencies,
  }
  if (
    shouldReply &&
    processOptions.backgroundAnalysis !== false &&
    !processOptions.callAnalysis &&
    !isBackgroundTaskWorkerRunning()
  ) {
    processOptions.callAnalysis = callAnalysis
  }
  const input = withTransaction(() => {
    const inserted = insertEventOnce(event)
    const todo = captureTodoEvent(inserted.event)
    const project = captureProjectEvent(inserted.event)
    const isSilentCapture = (
      !shouldReply &&
      isCaptureType(inserted.event.type) &&
      isCaptureSource(inserted.event.source)
    )
    const analysisJob = isSilentCapture
      ? inserted.inserted
        ? ensureAnalysisJobForEvent(inserted.event.id)
        : getAnalysisJobForEvent(inserted.event.id) ?? undefined
      : undefined
    const shouldEnsureJob = shouldReply && (inserted.inserted || options.resumeDuplicate === true)
    const job = shouldEnsureJob ? ensureConversationJobForEvent(inserted.event.id) : undefined
    return { ...inserted, job, todo, project, analysisJob }
  })
  const saved = input.event

  if (!shouldReply) {
    const analysisJob = input.inserted && input.analysisJob
      ? executeAnalysisJobForStoredEvent(saved, { callAnalysis: processOptions.callAnalysis })
      : input.analysisJob
    return {
      event: saved,
      duplicate: !input.inserted,
      todo: input.todo ?? undefined,
      project: input.project ?? undefined,
      analysisJob,
    }
  }

  if (!input.inserted && options.resumeDuplicate !== true) {
    return {
      event: saved,
      duplicate: true,
      job: input.job,
      todo: input.todo ?? undefined,
      project: input.project ?? undefined,
    }
  }

  const execution = !input.inserted && input.job?.status === "failed"
    ? await retryConversationJob(input.job.id, "idempotent_replay", processOptions)
    : await executeConversationJob(saved, processOptions)
  return {
    event: saved,
    duplicate: !input.inserted,
    companionReply: execution.companionReply,
    replyEvent: execution.replyEvent,
    job: execution.job,
    todo: input.todo ?? undefined,
    project: input.project ?? undefined,
  }
}

export function countConversationEventsToday(): number {
  return countEventsToday()
}

export function getRecentConversationEvents(limit = 20): EventRow[] {
  return getRecentEvents(limit)
}
