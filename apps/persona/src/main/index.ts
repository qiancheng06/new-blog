import { initializeDb } from "../infra/db/pool.js"
import { startApiServer, stopApiServer, type ApiServerOptions } from "../interface/api/server.js"
import { assertRuntimeConfig, config } from "../infra/config/index.js"
import { drainBackgroundTasks } from "../application/background-tasks.js"
import { recoverAnalysisJobsAtStartup } from "../application/analysis-jobs.js"
import { recoverConversationJobsAtStartup } from "../application/conversation-jobs.js"
import { backfillTodoProjections } from "../application/todos.js"
import { setTelegramRuntimeStatus } from "../application/runtime-health.js"
import {
  startDailySummaryScheduler,
  type DailySummaryScheduler,
} from "../application/daily-summary-scheduler.js"
import type { Server } from "http"

type TelegramModule = typeof import("../interface/telegram/bot.js")

export interface PersonaRuntimeOptions {
  api?: ApiServerOptions
  telegram?: boolean
  dailySummary?: boolean
}

export interface PersonaRuntime {
  apiServer: Server
  stop: () => Promise<void>
}

export function startPersonaRuntime(options: PersonaRuntimeOptions = {}): PersonaRuntime {
  console.log("persona-os starting...")
  const shouldStartTelegram = options.telegram ?? Boolean(config.telegramToken)
  assertRuntimeConfig(config, {
    requireLlm: config.llmProvider !== "mock",
    requireTelegram: shouldStartTelegram,
  })

  initializeDb()
  const todoBackfill = backfillTodoProjections()
  if (todoBackfill.created > 0) {
    console.log(`[todo migration] restored ${todoBackfill.created} projection(s)`)
  }
  if (todoBackfill.skipped > 0) {
    console.warn(`[todo migration] skipped ${todoBackfill.skipped} invalid historical Event(s)`)
  }
  const recoveredConversationJobs = recoverConversationJobsAtStartup()
  if (recoveredConversationJobs > 0) {
    console.warn(`[conversation recovery] marked ${recoveredConversationJobs} interrupted job(s) as failed`)
  }
  const recoveredAnalysisJobs = recoverAnalysisJobsAtStartup()
  if (recoveredAnalysisJobs > 0) {
    console.warn(`[analysis recovery] marked ${recoveredAnalysisJobs} interrupted job(s) as failed`)
  }
  const apiServer = startApiServer(options.api)
  const dailySummaryScheduler = startDailySummaryScheduler({
    enabled: options.dailySummary ?? config.dailySummaryEnabled ?? false,
  })
  let telegramModulePromise: Promise<TelegramModule> | null = null

  if (shouldStartTelegram && config.telegramToken) {
    setTelegramRuntimeStatus("starting")
    telegramModulePromise = import("../interface/telegram/bot.js")
    void telegramModulePromise.then(({ startBot }) => {
      return startBot()
    }).catch((err) => {
      setTelegramRuntimeStatus("failed")
      console.error("[telegram startup error]", err instanceof Error ? err.message : err)
    })
  } else {
    setTelegramRuntimeStatus("disabled")
    console.log("TELEGRAM_TOKEN not set, skipping telegram bot")
  }

  let stopPromise: Promise<void> | null = null
  const stop = (): Promise<void> => {
    stopPromise ??= stopPersonaRuntime(apiServer, telegramModulePromise, dailySummaryScheduler)
    return stopPromise
  }

  return {
    apiServer,
    stop,
  }
}

if (process.env.PERSONA_MAIN_AUTOSTART !== "0") {
  const runtime = startPersonaRuntime()
  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`persona-os shutting down (${signal})...`)
    try {
      await runtime.stop()
    } catch (err) {
      console.error("[shutdown error]", err instanceof Error ? err.message : err)
      process.exitCode = 1
    }
  }

  process.once("SIGINT", () => { void shutdown("SIGINT") })
  process.once("SIGTERM", () => { void shutdown("SIGTERM") })
}

async function stopPersonaRuntime(
  apiServer: Server,
  telegramModulePromise: Promise<TelegramModule> | null,
  dailySummaryScheduler: DailySummaryScheduler,
): Promise<void> {
  dailySummaryScheduler.stop()
  const stopResults = await Promise.allSettled([
    stopApiServer(apiServer),
    telegramModulePromise
      ? telegramModulePromise.then(({ stopBot }) => stopBot())
      : Promise.resolve(),
  ])

  const drainResult = await drainBackgroundTasks()
  if (!drainResult.completed) {
    console.warn(`[shutdown warning] ${drainResult.pending} background task(s) still pending after timeout`)
  }

  const failure = stopResults.find((result): result is PromiseRejectedResult => result.status === "rejected")
  if (failure) throw failure.reason
}
