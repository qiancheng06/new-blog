import { initializeDb } from "../infra/db/pool.js"
import { startApiServer, stopApiServer, type ApiServerOptions } from "../interface/api/server.js"
import { assertRuntimeConfig, config } from "../infra/config/index.js"
import type { Server } from "http"

export interface PersonaRuntimeOptions {
  api?: ApiServerOptions
  telegram?: boolean
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
  const apiServer = startApiServer(options.api)

  if (shouldStartTelegram && config.telegramToken) {
    import("../interface/telegram/bot.js").then(({ startBot }) => {
      return startBot()
    }).catch((err) => {
      console.error("[telegram startup error]", err instanceof Error ? err.message : err)
    })
  } else {
    console.log("TELEGRAM_TOKEN not set, skipping telegram bot")
  }

  return {
    apiServer,
    stop: () => stopApiServer(apiServer),
  }
}

if (process.env.PERSONA_MAIN_AUTOSTART !== "0") {
  startPersonaRuntime()
}
