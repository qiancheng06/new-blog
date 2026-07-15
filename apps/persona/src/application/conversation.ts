import { countEventsToday, getRecentEvents, insertEvent } from "../domain/event/store.js"
import { createCompanionReplyEvent, type Event } from "../domain/event/types.js"
import type { EventRow } from "../domain/event/store.js"
import { processMessage } from "../ai-runtime/operators/process-message.js"

export const CONVERSATION_FALLBACK_REPLY = "嗯，我在的。"

export interface ConversationResult {
  event: EventRow
  companionReply?: string
  replyEvent?: EventRow
}

export interface ConversationOptions {
  shouldReply?: boolean
}

export async function handleConversationEvent(
  event: Event,
  options: ConversationOptions = {},
): Promise<ConversationResult> {
  const saved = insertEvent(event)

  if (options.shouldReply === false) {
    return { event: saved }
  }

  const result = await processMessage(saved)
  const replyEvent = insertEvent(createCompanionReplyEvent({
    text: result.companionReply,
    in_reply_to: saved.id,
  }, parseMetadata(saved.metadata)))
  return {
    event: saved,
    companionReply: result.companionReply,
    replyEvent,
  }
}

export function countConversationEventsToday(): number {
  return countEventsToday()
}

export function getRecentConversationEvents(limit = 20): EventRow[] {
  return getRecentEvents(limit)
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
