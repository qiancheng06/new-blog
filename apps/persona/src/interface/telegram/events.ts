import { createTelegramEvent, type Event, type TelegramEventType, type TelegramPayload } from "../../domain/event/types.js"
import { isTodoDueDate } from "../../domain/todo/validation.js"

export const COMMAND_PREFIXES: Record<string, TelegramEventType> = {
  "/n": "note",
  "/t": "todo",
  "/p": "project",
  "/i": "idea",
  "/j": "journal",
  "/note": "note",
  "/todo": "todo",
  "/project": "project",
  "/idea": "idea",
  "/journal": "journal",
}

export interface TelegramMessageInput {
  chatId: number
  userId: number
  text: string
  messageId: number
  replyTo?: number
  evaluationRunId?: string
}

export interface TelegramCommandParseResult {
  type: TelegramEventType
  content: string
  dueDate?: string
}

export interface TelegramEventBuildResult {
  event: Event
  shouldReply: boolean
}

export function parseTelegramCommand(text: string): TelegramCommandParseResult | null {
  const [command, ...restParts] = text.trim().split(/\s+/)
  const rest = restParts.join(" ").trim()
  const commandName = command.toLowerCase().split("@", 1)[0]
  const type = COMMAND_PREFIXES[commandName]
  if (!type || !rest) return null
  if (type === "todo") {
    const todo = parseTodoContent(rest)
    return { type, content: todo.content, ...(todo.dueDate ? { dueDate: todo.dueDate } : {}) }
  }
  return { type, content: rest }
}

export function buildTelegramEvent(input: TelegramMessageInput): TelegramEventBuildResult {
  const cmd = parseTelegramCommand(input.text)
  const payload: TelegramPayload = {
    chat_id: input.chatId,
    user_id: input.userId,
    text: cmd ? cmd.content : input.text,
    message_id: input.messageId,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(cmd?.dueDate ? { due_date: cmd.dueDate } : {}),
  }

  const event = createTelegramEvent(payload, cmd ? cmd.type : "message")
  const evaluationRunId = input.evaluationRunId?.trim()
  if (evaluationRunId) {
    event.metadata = { purpose: "real_mode_evaluation", run_id: evaluationRunId }
  }

  return {
    event,
    shouldReply: !cmd,
  }
}

function parseTodoContent(content: string): { content: string; dueDate?: string } {
  const match = /^(.*?)\s+@(\d{4}-\d{2}-\d{2})$/.exec(content)
  if (!match || !match[1].trim() || !isTodoDueDate(match[2])) return { content }
  return { content: match[1].trim(), dueDate: match[2] }
}
