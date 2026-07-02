import { countEventsToday, getRecentEvents, insertEvent } from "../domain/event/store.js"
import type { Event } from "../domain/event/types.js"
import type { EventRow } from "../domain/event/store.js"
import { processMessage } from "../ai-runtime/operators/process-message.js"

export const CONVERSATION_FALLBACK_REPLY = "嗯，我在的。"

export interface ConversationResult {
  event: EventRow
  companionReply?: string
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
  return {
    event: saved,
    companionReply: result.companionReply,
  }
}

export function countConversationEventsToday(): number {
  return countEventsToday()
}

export function getRecentConversationEvents(limit = 20): EventRow[] {
  return getRecentEvents(limit)
}
