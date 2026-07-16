const contractTag = `codex-telegram-idempotency-${Date.now()}`
const chatId = -Number(`100${Date.now()}`.slice(-13))
const messageId = Number(String(Date.now()).slice(-8))

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const { drainBackgroundTasks } = await import("./background-tasks.js")
const { handleConversationEvent } = await import("./conversation.js")
const { buildTelegramEvent } = await import("../interface/telegram/events.js")
const { EventIdentityConflictError, insertEvent } = await import("../domain/event/store.js")

initializeDb()

try {
  const input = {
    chatId,
    userId: 2002,
    text: contractTag,
    messageId,
  }
  const firstEvent = buildTelegramEvent(input).event
  const duplicateEvent = buildTelegramEvent(input).event
  assert(firstEvent.id === duplicateEvent.id, "duplicate Telegram delivery must keep one Event identity")

  const first = await handleConversationEvent(firstEvent)
  assert(!first.duplicate, "first Telegram delivery must be accepted")
  assert(first.companionReply === `[mock companion] ${contractTag}`, "first delivery reply mismatch")
  assert(first.replyEvent?.id, "first delivery must append a Companion reply Event")

  const duplicate = await handleConversationEvent(duplicateEvent)
  assert(duplicate.duplicate, "second Telegram delivery must be identified as duplicate")
  assert(duplicate.event.id === first.event.id, "duplicate must return the original Event")
  assert(duplicate.companionReply === undefined, "duplicate must not call Companion again")
  assert(duplicate.replyEvent === undefined, "duplicate must not append another reply Event")

  const drain = await drainBackgroundTasks(5_000)
  assert(drain.completed, "first delivery background Memory patch must settle")
  verifySingleConversation(first.event.id, first.replyEvent.id)
  await verifyCommandIdempotency()
  await verifyLegacyEventIdentity()
  await verifyIdentityConflict()

  console.log("telegram idempotency contract ok")
} finally {
  cleanupContractRows()
}

function verifySingleConversation(eventId: string, replyEventId: string): void {
  const inputs = query<{ id: string }>("SELECT id FROM events WHERE id = ?", [eventId])
  assert(inputs.length === 1, "duplicate delivery must persist exactly one input Event")

  const replies = query<{ id: string }>(
    "SELECT id FROM events WHERE type = 'companion_reply' AND payload LIKE ?",
    [`%${eventId}%`],
  )
  assert(replies.length === 1 && replies[0].id === replyEventId, "duplicate delivery must persist one reply Event")

  const topic = queryOne<{ message_count: number }>("SELECT message_count FROM topics WHERE name = ?", [contractTag])
  assert(topic?.message_count === 1, "duplicate delivery must apply one Topic update")
  const timeline = query<{ id: string }>("SELECT id FROM timeline_events WHERE source_event_id = ?", [eventId])
  assert(timeline.length === 1, "duplicate delivery must append one Timeline row")
}

async function verifyCommandIdempotency(): Promise<void> {
  const command = {
    chatId,
    userId: 2002,
    text: `/n ${contractTag} note`,
    messageId: messageId + 1,
  }
  const first = await handleConversationEvent(buildTelegramEvent(command).event, { shouldReply: false })
  const duplicate = await handleConversationEvent(buildTelegramEvent(command).event, { shouldReply: false })
  assert(!first.duplicate && duplicate.duplicate, "Telegram command redelivery must be deduplicated")
  const rows = query<{ id: string }>("SELECT id FROM events WHERE id = ?", [first.event.id])
  assert(rows.length === 1, "duplicate Telegram command must persist one Event")
}

async function verifyLegacyEventIdentity(): Promise<void> {
  const input = {
    chatId,
    userId: 2002,
    text: `${contractTag} legacy`,
    messageId: messageId + 2,
  }
  const legacyEvent = buildTelegramEvent(input).event
  legacyEvent.id = randomUUID()
  const savedLegacyEvent = insertEvent(legacyEvent)
  const duplicate = await handleConversationEvent(buildTelegramEvent(input).event)
  assert(duplicate.duplicate, "legacy Telegram Event must be recognized by chat and message id")
  assert(duplicate.event.id === savedLegacyEvent.id, "legacy duplicate must return the original random Event id")
  assert(duplicate.replyEvent === undefined, "legacy duplicate must not create a reply Event")
}

async function verifyIdentityConflict(): Promise<void> {
  const conflicting = buildTelegramEvent({
    chatId,
    userId: 2002,
    text: `${contractTag} altered`,
    messageId,
  }).event
  let rejected = false
  try {
    await handleConversationEvent(conflicting)
  } catch (err) {
    rejected = err instanceof EventIdentityConflictError
  }
  assert(rejected, "same Telegram identity with different content must be rejected")
}

function cleanupContractRows(): void {
  const inputIds = query<{ id: string }>(
    "SELECT id FROM events WHERE source = 'telegram' AND payload LIKE ?",
    [`%${contractTag}%`],
  ).map((row) => row.id)
  for (const id of inputIds) {
    run("DELETE FROM timeline_events WHERE source_event_id = ?", [id])
    run("DELETE FROM events WHERE type = 'companion_reply' AND payload LIKE ?", [`%${id}%`])
  }
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${contractTag}%`])
  run("DELETE FROM topics WHERE name LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM events WHERE source = 'telegram' AND payload LIKE ?", [`%${contractTag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
import { randomUUID } from "crypto"
