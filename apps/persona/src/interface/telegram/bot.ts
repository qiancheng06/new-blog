import { Bot, Context } from "grammy"
import { config } from "../../infra/config/index.js"
import {
  CONVERSATION_FALLBACK_REPLY,
  countConversationEventsToday,
  handleConversationEvent,
} from "../../application/conversation.js"
import { buildTelegramEvent } from "./events.js"
import { isTelegramChatAllowed } from "./access.js"
import { setTelegramRuntimeStatus } from "../../application/runtime-health.js"

export const bot = new Bot(config.telegramToken)

const knownChats = new Set<number>()
let pollingPromise: Promise<void> | null = null
let errorHandlerInstalled = false

bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id
  if (typeof chatId !== "number") return
  if (!isTelegramChatAllowed(chatId, config.telegramAllowedChatIds)) {
    console.warn("[telegram access] ignored unauthorized chat")
    return
  }
  await next()
})

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
      if (result.duplicate) {
        console.log(`  -> duplicate ignored id:${result.event.id.slice(0, 8)}`)
        return
      }
      console.log(`  -> event:${event.type} id:${result.event.id.slice(0, 8)}`)
    } catch (err) {
      console.error("  -> command error:", err instanceof Error ? err.message : err)
      await ctx.reply(CONVERSATION_FALLBACK_REPLY, { reply_to_message_id: msgId })
    }
    return
  }

  try {
    const result = await handleConversationEvent(event)
    if (result.duplicate) {
      console.log(`  -> duplicate ignored id:${result.event.id.slice(0, 8)}`)
      return
    }
    console.log(`  -> event:${event.type} id:${result.event.id.slice(0, 8)}`)
    console.log(`  -> companion: ${result.companionReply?.slice(0, 60)}...`)
    await ctx.reply(result.companionReply ?? CONVERSATION_FALLBACK_REPLY, { reply_to_message_id: msgId })
  } catch (err) {
    console.error("  -> error:", err instanceof Error ? err.message : err)
    await ctx.reply(CONVERSATION_FALLBACK_REPLY, { reply_to_message_id: msgId })
  }
})

export async function startBot(): Promise<void> {
  if (pollingPromise) return pollingPromise

  setTelegramRuntimeStatus("starting")

  if (!errorHandlerInstalled) {
    bot.catch((err) => {
      console.error("[telegram bot error]", err.error instanceof Error ? err.error.message : err.error)
    })
    errorHandlerInstalled = true
  }

  const started = bot.start()
  setTelegramRuntimeStatus("running")
  const tracked = started.then(
    () => { setTelegramRuntimeStatus("stopped") },
    (err) => {
      setTelegramRuntimeStatus("failed")
      throw err
    },
  ).finally(() => {
    if (pollingPromise === tracked) pollingPromise = null
  })
  pollingPromise = tracked
  console.log("telegram bot started")
  return tracked
}

export async function stopBot(): Promise<void> {
  const activePolling = pollingPromise
  if (bot.isRunning()) {
    await bot.stop()
  }
  await activePolling?.catch(() => undefined)
  if (!config.telegramToken) setTelegramRuntimeStatus("disabled")
  else if (bot.isRunning()) setTelegramRuntimeStatus("running")
  else setTelegramRuntimeStatus("stopped")
}
