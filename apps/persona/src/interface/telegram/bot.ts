import { Bot, Context } from "grammy"
import { config } from "../../infra/config/index.js"
import { createTelegramEvent, TelegramPayload, TelegramEventType } from "../../domain/event/types.js"
import {
  CONVERSATION_FALLBACK_REPLY,
  countConversationEventsToday,
  handleConversationEvent,
} from "../../application/conversation.js"

export const bot = new Bot(config.telegramToken)

const knownChats = new Set<number>()

const COMMAND_PREFIXES: Record<string, TelegramEventType> = {
  "/n": "note",
  "/t": "todo",
  "/i": "idea",
  "/j": "journal",
  "/note": "note",
  "/todo": "todo",
  "/idea": "idea",
  "/journal": "journal",
}

function parseCommand(text: string): { type: TelegramEventType; content: string } | null {
  for (const [prefix, type] of Object.entries(COMMAND_PREFIXES)) {
    const [command, ...restParts] = text.trim().split(/\s+/)
    const rest = restParts.join(" ").trim()
    if (command === prefix && rest) return { type, content: rest }
  }
  return null
}

bot.command("start", (ctx: Context) => {
  if (ctx.chat) knownChats.add(ctx.chat.id)
  ctx.reply(`Persona OS 已上线\nChat ID: ${ctx.chat?.id}`)
})

bot.command("stats", (ctx: Context) => {
  const today = countConversationEventsToday()
  ctx.reply(`今日事件：${today} 条`)
})

bot.on("message:text", async (ctx: Context) => {
  if (!ctx.message || !ctx.from || !ctx.chat) return

  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const text = ctx.message.text ?? ""
  const msgId = ctx.message.message_id

  knownChats.add(chatId)
  console.log(`[chat:${chatId}] [user:${userId}] ${text}`)

  const cmd = parseCommand(text)

  const payload: TelegramPayload = {
    chat_id: chatId,
    user_id: userId,
    text: cmd ? cmd.content : text,
    message_id: msgId,
  }

  const eventType = cmd ? cmd.type : "message"
  const event = createTelegramEvent(payload, eventType)

  if (cmd) {
    const result = await handleConversationEvent(event, { shouldReply: false })
    console.log(`  -> event:${eventType} id:${result.event.id.slice(0, 8)}`)
    return
  }

  try {
    const result = await handleConversationEvent(event)
    console.log(`  -> event:${eventType} id:${result.event.id.slice(0, 8)}`)
    console.log(`  -> companion: ${result.companionReply?.slice(0, 60)}...`)
    await ctx.reply(result.companionReply ?? CONVERSATION_FALLBACK_REPLY, { reply_to_message_id: msgId })
  } catch (err) {
    console.error("  -> error:", err instanceof Error ? err.message : err)
    await ctx.reply(CONVERSATION_FALLBACK_REPLY, { reply_to_message_id: msgId })
  }
})

export async function startBot(): Promise<void> {
  bot.catch((err) => {
    console.error("[telegram bot error]", err.error instanceof Error ? err.error.message : err.error)
  })
  await bot.start()
  console.log("telegram bot started")
}
