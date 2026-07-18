process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""
process.env.OBSIDIAN_VAULT_PATH = ""

const { initializeDb } = await import("../infra/db/pool.js")
const {
  getRuntimeHealthSnapshot,
  setTelegramRuntimeStatus,
  summarizeRuntimeHealth,
} = await import("./runtime-health.js")
type RuntimeHealthComponents = import("./runtime-health.js").RuntimeHealthComponents

initializeDb()

const healthyComponents = components()
const healthy = summarizeRuntimeHealth(healthyComponents)
assert(healthy.status === "ok", "healthy runtime status must be ok")
assert(healthy.ready, "healthy runtime must be ready")

const optionalFailure = summarizeRuntimeHealth(components({
  telegram: { status: "failed" },
  obsidian: { status: "unavailable" },
  analysis: {
    status: "degraded",
    jobs: { pending: 0, running: 0, succeeded: 2, failed: 1 },
  },
}))
assert(optionalFailure.status === "degraded", "optional component failure must degrade runtime")
assert(optionalFailure.ready, "optional component failure must not block readiness")

const databaseFailure = summarizeRuntimeHealth(components({ database: { status: "failed" } }))
assert(databaseFailure.status === "not_ready", "database failure must make runtime not ready")
assert(!databaseFailure.ready, "database failure must block readiness")

const llmFailure = summarizeRuntimeHealth(components({
  llm: { status: "misconfigured", provider: "unsupported", mode: "unknown" },
}))
assert(llmFailure.status === "not_ready", "LLM misconfiguration must make runtime not ready")
assert(!llmFailure.ready, "LLM misconfiguration must block readiness")

setTelegramRuntimeStatus("starting")
const runtimeSnapshot = getRuntimeHealthSnapshot()
assert(runtimeSnapshot.ready, "mock runtime snapshot must be ready")
assert(runtimeSnapshot.components.database.status === "ok", "runtime database component must be ok")
assert(runtimeSnapshot.components.llm.provider === "mock", "runtime LLM provider must be mock")
assert(runtimeSnapshot.components.llm.mode === "mock", "runtime LLM mode must be mock")
assert(runtimeSnapshot.components.telegram.status === "starting", "Telegram runtime status must be tracked")
assert(runtimeSnapshot.components.obsidian.status === "disabled", "empty Obsidian config must be disabled")
assert(typeof runtimeSnapshot.components.analysis.jobs.failed === "number", "analysis failed count must be numeric")
assert(typeof runtimeSnapshot.components.background_tasks.pending === "number", "background task count must be numeric")
assert(!JSON.stringify(runtimeSnapshot).includes(process.cwd()), "runtime snapshot must not expose repository paths")

setTelegramRuntimeStatus("disabled")
console.log("runtime health contract ok")

function components(overrides: Partial<RuntimeHealthComponents> = {}): RuntimeHealthComponents {
  return {
    database: { status: "ok" },
    llm: { status: "ok", provider: "mock", mode: "mock" },
    telegram: { status: "disabled" },
    obsidian: { status: "disabled" },
    analysis: {
      status: "ok",
      jobs: { pending: 0, running: 0, succeeded: 0, failed: 0 },
    },
    background_tasks: { status: "ok", pending: 0 },
    ...overrides,
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
