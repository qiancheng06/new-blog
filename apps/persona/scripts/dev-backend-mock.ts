process.env.PERSONA_MAIN_AUTOSTART = "0"
process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""
process.env.API_PORT = process.env.API_PORT || "3001"

const { startPersonaRuntime } = await import("../src/main/index.js")

const runtime = startPersonaRuntime({
  api: { port: Number(process.env.API_PORT), hostname: "127.0.0.1" },
  telegram: false,
})

console.log(`mock backend ready on http://127.0.0.1:${process.env.API_PORT}`)

async function shutdown(): Promise<void> {
  await runtime.stop()
  process.exit(0)
}

process.on("SIGINT", () => {
  void shutdown()
})

process.on("SIGTERM", () => {
  void shutdown()
})
