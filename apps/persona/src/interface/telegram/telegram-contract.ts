import { buildTelegramEvent, parseTelegramCommand } from "./events.js"

const evaluationRunId = "eval-telegram-contract"

verifyCommandParsing()
verifyCommandEventBuild()
verifyMessageEventBuild()

console.log("telegram contract ok")

function verifyCommandParsing(): void {
  assert(parseTelegramCommand("/n keep this")?.type === "note", "/n should parse as note")
  assert(parseTelegramCommand("/t check Workspace")?.type === "todo", "/t should parse as todo")
  assert(parseTelegramCommand("/i possible direction")?.type === "idea", "/i should parse as idea")
  assert(parseTelegramCommand("/j daily note")?.type === "journal", "/j should parse as journal")
  assert(parseTelegramCommand("/note long form")?.type === "note", "/note should parse as note")
  assert(parseTelegramCommand("/n") === null, "empty command content should not parse")
  assert(parseTelegramCommand(" /n   trimmed content ")?.content === "trimmed content", "command content should be trimmed")
  assert(parseTelegramCommand("/unknown content") === null, "unknown command should not parse")
}

function verifyCommandEventBuild(): void {
  const result = buildTelegramEvent({
    chatId: 1001,
    userId: 2002,
    text: "/t tomorrow check backend",
    messageId: 3003,
    replyTo: 2999,
    evaluationRunId,
  })

  assert(result.shouldReply === false, "command events must not request Companion replies")
  assert(result.event.source === "telegram", "command event source mismatch")
  assert(result.event.type === "todo", "command event type mismatch")
  assert(result.event.payload.chat_id === 1001, "chat id mismatch")
  assert(result.event.payload.user_id === 2002, "user id mismatch")
  assert(result.event.payload.message_id === 3003, "message id mismatch")
  assert(result.event.payload.reply_to === 2999, "reply id mismatch")
  assert(result.event.payload.text === "tomorrow check backend", "command payload should strip command prefix")
  assert(result.event.metadata.purpose === "real_mode_evaluation", "evaluation metadata purpose mismatch")
  assert(result.event.metadata.run_id === evaluationRunId, "evaluation metadata run_id mismatch")
}

function verifyMessageEventBuild(): void {
  const result = buildTelegramEvent({
    chatId: 1001,
    userId: 2002,
    text: "normal companion message",
    messageId: 3004,
    evaluationRunId: "   ",
  })

  assert(result.shouldReply === true, "normal messages must request Companion replies")
  assert(result.event.source === "telegram", "message event source mismatch")
  assert(result.event.type === "message", "message event type mismatch")
  assert(result.event.payload.text === "normal companion message", "message payload text mismatch")
  assert(Object.keys(result.event.metadata).length === 0, "blank evaluation id should not add metadata")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
