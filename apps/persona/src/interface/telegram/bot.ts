import { Bot, Context } from "grammy"
import { config } from "../../infra/config/index.js"
import {
  CONVERSATION_FALLBACK_REPLY,
  countConversationEventsToday,
  handleConversationEvent,
} from "../../application/conversation.js"
import { buildTelegramEvent } from "./events.js"

export const bot = new Bot(config.telegramToken)

const knownChats = new Set<number>()

bot.command("start", (ctx: Context) => {
  if (ctx.chat) knownChats.add(ctx.chat.id)
  ctx.reply(`Persona OS is online.\nChat ID: ${ctx.chat?.id}`)
})

bot.command("stats", (ctx: Context) => {
  const today = countConversationEventsToday()
  ctx.reply(`Events today: ${today}`)
})

bot.on("message:text", async (ctx: Context) => {
  if (!ctx.message || !ctx.from || !ctx.chat) return

  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const text = ctx.message.text ?? ""
  const msgId = ctx.message.message_id

  knownChats.add(chatId)
  console.log(`[chat:${chatId}] [user:${userId}] ${text}`)

  const { event, shouldReply } = buildTelegramEvent({
    chatId,
    userId,
    text,
    messageId: msgId,
    replyTo: ctx.message.reply_to_message?.message_id,
    evaluationRunId: process.env.PERSONA_EVALUATION_RUN_ID,
  })

  if (!shouldReply) {
    try {
      const result = await handleConversationEvent(event, { shouldReply: false })
      console.log(`  -> event:${event.type} id:${result.event.id.slice(0, 8)}`)
    } catch (err) {
      console.error("  -> command error:", err instanceof Error ? err.message : err)
      await ctx.reply(CONVERSATION_FALLBACK_REPLY, { reply_to_message_id: msgId })
    }
    return
  }

  try {
    const result = await handleConversationEvent(event)
    console.log(`  -> event:${event.type} id:${result.event.id.slice(0, 8)}`)
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
