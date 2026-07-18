import { buildTelegramEvent, parseTelegramCommand } from "./events.js"
import { isTelegramChatAllowed } from "./access.js"

const evaluationRunId = "eval-telegram-contract"

verifyCommandParsing()
verifyCommandEventBuild()
verifyProjectCommandEventBuild()
verifyMessageEventBuild()
verifyStableEventIdentity()
verifyChatAllowlist()

console.log("telegram contract ok")

function verifyCommandParsing(): void {
  assert(parseTelegramCommand("/n keep this")?.type === "note", "/n should parse as note")
  assert(parseTelegramCommand("/t check Workspace")?.type === "todo", "/t should parse as todo")
  assert(parseTelegramCommand("/p Persona OS")?.type === "project", "/p should parse as project")
  assert(parseTelegramCommand("/project Persona OS")?.content === "Persona OS", "/project content mismatch")
  const datedTodo = parseTelegramCommand("/todo check Workspace @2099-04-01")
  assert(datedTodo?.content === "check Workspace", "Todo due suffix must be removed from content")
  assert(datedTodo?.dueDate === "2099-04-01", "Todo due suffix must be parsed")
  assert(
    parseTelegramCommand("/todo keep invalid date @2099-02-30")?.content === "keep invalid date @2099-02-30",
    "invalid Todo due suffix must remain part of content",
  )
  assert(parseTelegramCommand("/i possible direction")?.type === "idea", "/i should parse as idea")
  assert(parseTelegramCommand("/j daily note")?.type === "journal", "/j should parse as journal")
  assert(parseTelegramCommand("/note long form")?.type === "note", "/note should parse as note")
  assert(parseTelegramCommand("/n@persona_bot group note")?.type === "note", "targeted group command should parse")
  assert(parseTelegramCommand("/n") === null, "empty command content should not parse")
  assert(parseTelegramCommand(" /n   trimmed content ")?.content === "trimmed content", "command content should be trimmed")
  assert(parseTelegramCommand("/unknown content") === null, "unknown command should not parse")
}

function verifyCommandEventBuild(): void {
  const result = buildTelegramEvent({
    chatId: 1001,
    userId: 2002,
    text: "/t tomorrow check backend @2099-04-01",
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
  assert(result.event.payload.due_date === "2099-04-01", "command payload should preserve Todo due date")
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

function verifyProjectCommandEventBuild(): void {
  const result = buildTelegramEvent({
    chatId: 1001,
    userId: 2002,
    text: "/project Persona OS MVP",
    messageId: 3007,
  })

  assert(result.shouldReply === false, "Project commands must not request Companion replies")
  assert(result.event.type === "project", "Project command Event type mismatch")
  assert(result.event.payload.text === "Persona OS MVP", "Project command payload mismatch")
}

function verifyStableEventIdentity(): void {
  const first = buildTelegramEvent({ chatId: -1001, userId: 2002, text: "first", messageId: 3005 })
  const duplicate = buildTelegramEvent({ chatId: -1001, userId: 2002, text: "first", messageId: 3005 })
  const otherChat = buildTelegramEvent({ chatId: -1002, userId: 2002, text: "first", messageId: 3005 })
  const otherMessage = buildTelegramEvent({ chatId: -1001, userId: 2002, text: "first", messageId: 3006 })

  assert(first.event.id === duplicate.event.id, "same Telegram message must produce a stable Event id")
  assert(first.event.id !== otherChat.event.id, "Telegram Event id must include chat id")
  assert(first.event.id !== otherMessage.event.id, "Telegram Event id must include message id")
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first.event.id ?? ""), "Telegram Event id must be UUID v5")
}

function verifyChatAllowlist(): void {
  const allowed = [12345, -98765]
  assert(isTelegramChatAllowed(12345, allowed), "trusted direct chat should be allowed")
  assert(isTelegramChatAllowed(-98765, allowed), "trusted group chat should be allowed")
  assert(!isTelegramChatAllowed(54321, allowed), "unknown chat should be rejected")
  assert(!isTelegramChatAllowed(12345, []), "empty allowlist should reject every chat")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
