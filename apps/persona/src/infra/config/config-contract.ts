import {
  assertRuntimeConfig,
  loadRuntimeConfig,
  validateRuntimeConfig,
} from "./index.js"

const mockConfig = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3100",
  TELEGRAM_TOKEN: "",
  OPENAI_API_KEY: "",
})

assert(mockConfig.llmProvider === "mock", "mock provider should be preserved")
assert(mockConfig.apiPort === 3100, "API_PORT should parse as a number")
assert(validateRuntimeConfig(mockConfig).length === 0, "mock config should pass without real keys")
assertRuntimeConfig(mockConfig, { requireLlm: false, requireTelegram: false })

const defaultConfig = loadRuntimeConfig({})
assert(defaultConfig.llmProvider === "deepseek", "missing LLM_PROVIDER should default to deepseek")
assert(defaultConfig.apiPort === 3001, "missing API_PORT should default to 3001")

const badProvider = loadRuntimeConfig({ LLM_PROVIDER: "unknown", API_PORT: "3001" })
assert(
  validateRuntimeConfig(badProvider).some((error) => error.includes("LLM_PROVIDER")),
  "unknown provider should fail validation",
)

const badPort = loadRuntimeConfig({ LLM_PROVIDER: "mock", API_PORT: "abc" })
assert(
  validateRuntimeConfig(badPort).some((error) => error.includes("API_PORT")),
  "invalid API_PORT should fail validation",
)

const missingDeepseekKey = loadRuntimeConfig({
  LLM_PROVIDER: "deepseek",
  API_PORT: "3001",
  OPENAI_API_KEY: "sk-your_key_here",
})
assert(
  validateRuntimeConfig(missingDeepseekKey, { requireLlm: true }).some((error) => error.includes("OPENAI_API_KEY")),
  "real DeepSeek mode should reject empty or placeholder API key",
)

const missingTelegramToken = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3001",
  TELEGRAM_TOKEN: "your_bot_token_here",
})
assert(
  validateRuntimeConfig(missingTelegramToken, { requireTelegram: true }).some((error) => error.includes("TELEGRAM_TOKEN")),
  "Telegram startup should reject empty or placeholder token",
)

console.log("infra config contract ok")

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
