import { initializeDb } from "../infra/db/pool.js"
import { startApiServer, stopApiServer, type ApiServerOptions } from "../interface/api/server.js"
import { config } from "../infra/config/index.js"
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
  initializeDb()
  const apiServer = startApiServer(options.api)
  const shouldStartTelegram = options.telegram ?? Boolean(config.telegramToken)

  if (shouldStartTelegram && config.telegramToken) {
    import("../interface/telegram/bot.js").then(({ startBot }) => {
      startBot()
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
