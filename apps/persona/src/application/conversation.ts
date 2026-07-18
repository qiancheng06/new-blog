import { countEventsToday, getRecentEvents, insertEventOnce } from "../domain/event/store.js"
import { type Event } from "../domain/event/types.js"
import type { EventRow } from "../domain/event/store.js"
import type { ProcessMessageDependencies } from "../ai-runtime/operators/process-message.js"
import {
  ensureConversationJobForEvent,
  executeConversationJob,
  retryConversationJob,
  type ConversationJob,
} from "./conversation-jobs.js"
import { withTransaction } from "../infra/db/pool.js"
import { captureTodoEvent } from "./todos.js"
import type { TodoRow } from "../domain/todo/store.js"

export const CONVERSATION_FALLBACK_REPLY = "嗯，我在的。"

export interface ConversationResult {
  event: EventRow
  duplicate: boolean
  companionReply?: string
  replyEvent?: EventRow
  job?: ConversationJob
  todo?: TodoRow
}

export interface ConversationOptions {
  shouldReply?: boolean
  resumeDuplicate?: boolean
  dependencies?: ProcessMessageDependencies
}

export async function handleConversationEvent(
  event: Event,
  options: ConversationOptions = {},
): Promise<ConversationResult> {
  const shouldReply = options.shouldReply !== false
  const input = withTransaction(() => {
    const inserted = insertEventOnce(event)
    const todo = captureTodoEvent(inserted.event)
    const shouldEnsureJob = shouldReply && (inserted.inserted || options.resumeDuplicate === true)
    const job = shouldEnsureJob ? ensureConversationJobForEvent(inserted.event.id) : undefined
    return { ...inserted, job, todo }
  })
  const saved = input.event

  if (!shouldReply) {
    return { event: saved, duplicate: !input.inserted, todo: input.todo ?? undefined }
  }

  if (!input.inserted && options.resumeDuplicate !== true) {
    return { event: saved, duplicate: true, job: input.job, todo: input.todo ?? undefined }
  }

  const execution = !input.inserted && input.job?.status === "failed"
    ? await retryConversationJob(input.job.id, "idempotent_replay", options.dependencies)
    : await executeConversationJob(saved, options.dependencies)
  return {
    event: saved,
    duplicate: !input.inserted,
    companionReply: execution.companionReply,
    replyEvent: execution.replyEvent,
    job: execution.job,
    todo: input.todo ?? undefined,
  }
}

export function countConversationEventsToday(): number {
  return countEventsToday()
}

export function getRecentConversationEvents(limit = 20): EventRow[] {
  return getRecentEvents(limit)
}
