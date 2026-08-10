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
assert(mockConfig.apiHost === "127.0.0.1", "API_HOST should default to loopback")
assert(mockConfig.allowedOrigins.includes("http://127.0.0.1:5173"), "Workspace origin should be allowed by default")
assert(mockConfig.timeZone === "Asia/Shanghai", "PERSONA_TIME_ZONE should default to Asia/Shanghai")
assert(mockConfig.dailyNoteDirectory === "persona/daily-notes", "Daily Note directory default mismatch")
assert(mockConfig.obsidianSnapshotDirectory === "persona/snapshots", "Obsidian Snapshot directory default mismatch")
assert(mockConfig.dailySummaryEnabled, "Daily Summary scheduler should be enabled by default")
assert(mockConfig.dailySummaryTime === "00:05", "Daily Summary schedule default mismatch")
assert(validateRuntimeConfig(mockConfig).length === 0, "mock config should pass without real keys")
assertRuntimeConfig(mockConfig, { requireLlm: false, requireTelegram: false })

const defaultConfig = loadRuntimeConfig({})
assert(defaultConfig.llmProvider === "deepseek", "missing LLM_PROVIDER should default to deepseek")
assert(defaultConfig.apiPort === 3001, "missing API_PORT should default to 3001")
assert(defaultConfig.telegramAllowedChatIds.length === 0, "Telegram allowlist should default to empty")

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
  OPENAI_API_KEY: "sk-your_deepseek_key_here",
})
assert(
  validateRuntimeConfig(missingDeepseekKey, { requireLlm: true }).some((error) => error.includes("OPENAI_API_KEY")),
  "real DeepSeek mode should reject empty or placeholder API key",
)

const legacyPlaceholderDeepseekKey = loadRuntimeConfig({
  LLM_PROVIDER: "deepseek",
  API_PORT: "3001",
  OPENAI_API_KEY: "sk-your_key_here",
})
assert(
  validateRuntimeConfig(legacyPlaceholderDeepseekKey, { requireLlm: true }).some((error) => error.includes("OPENAI_API_KEY")),
  "real DeepSeek mode should reject legacy placeholder API key",
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

const missingTelegramAllowlist = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3001",
  TELEGRAM_TOKEN: "123456:realistic-test-token",
})
assert(
  validateRuntimeConfig(missingTelegramAllowlist, { requireTelegram: true })
    .some((error) => error.includes("TELEGRAM_ALLOWED_CHAT_IDS")),
  "Telegram startup should reject an empty chat allowlist",
)

const telegramConfig = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3001",
  TELEGRAM_TOKEN: "123456:realistic-test-token",
  TELEGRAM_ALLOWED_CHAT_IDS: "12345, -98765,12345",
})
assert(telegramConfig.telegramAllowedChatIds.length === 2, "Telegram allowlist should parse and deduplicate IDs")
assert(
  validateRuntimeConfig(telegramConfig, { requireTelegram: true }).length === 0,
  "Telegram startup should accept a valid token and chat allowlist",
)

const invalidTelegramAllowlist = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3001",
  TELEGRAM_ALLOWED_CHAT_IDS: "not-a-chat-id",
})
assert(
  validateRuntimeConfig(invalidTelegramAllowlist).some((error) => error.includes("TELEGRAM_ALLOWED_CHAT_IDS")),
  "invalid Telegram chat IDs should fail validation",
)

const invalidOrigin = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3001",
  PERSONA_ALLOWED_ORIGINS: "https://trusted.example/path",
})
assert(
  validateRuntimeConfig(invalidOrigin).some((error) => error.includes("PERSONA_ALLOWED_ORIGINS")),
  "allowed origins should reject paths",
)

const invalidTimeZone = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  API_PORT: "3001",
  PERSONA_TIME_ZONE: "Mars/Olympus_Mons",
})
assert(
  validateRuntimeConfig(invalidTimeZone).some((error) => error.includes("PERSONA_TIME_ZONE")),
  "invalid IANA time zones should fail validation",
)

for (const invalidDirectory of ["../outside", "/absolute", "C:\\absolute", "persona/./daily-notes", "persona/bad:name"]) {
  const invalidDailyNoteDirectory = loadRuntimeConfig({
    LLM_PROVIDER: "mock",
    API_PORT: "3001",
    PERSONA_DAILY_NOTE_DIR: invalidDirectory,
  })
  assert(
    validateRuntimeConfig(invalidDailyNoteDirectory).some((error) => error.includes("PERSONA_DAILY_NOTE_DIR")),
    `invalid Daily Note directory should fail validation: ${invalidDirectory}`,
  )
}

for (const invalidDirectory of ["../outside", "/absolute", "C:\\absolute", "persona/./snapshots", "persona/bad:name"]) {
  const invalidSnapshotDirectory = loadRuntimeConfig({
    LLM_PROVIDER: "mock",
    API_PORT: "3001",
    PERSONA_OBSIDIAN_SNAPSHOT_DIR: invalidDirectory,
  })
  assert(
    validateRuntimeConfig(invalidSnapshotDirectory)
      .some((error) => error.includes("PERSONA_OBSIDIAN_SNAPSHOT_DIR")),
    `invalid Obsidian Snapshot directory should fail validation: ${invalidDirectory}`,
  )
}

const disabledDailySummary = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  PERSONA_DAILY_SUMMARY_ENABLED: "false",
  PERSONA_DAILY_SUMMARY_TIME: "23:45",
})
assert(!disabledDailySummary.dailySummaryEnabled, "Daily Summary scheduler should accept false")
assert(disabledDailySummary.dailySummaryTime === "23:45", "Daily Summary schedule should preserve valid time")

for (const invalidTime of ["24:00", "9:30", "12:60", "noon"]) {
  const invalidDailySummaryTime = loadRuntimeConfig({
    LLM_PROVIDER: "mock",
    PERSONA_DAILY_SUMMARY_TIME: invalidTime,
  })
  assert(
    validateRuntimeConfig(invalidDailySummaryTime).some((error) => error.includes("PERSONA_DAILY_SUMMARY_TIME")),
    `invalid Daily Summary time should fail validation: ${invalidTime}`,
  )
}

const invalidDailySummaryEnabled = loadRuntimeConfig({
  LLM_PROVIDER: "mock",
  PERSONA_DAILY_SUMMARY_ENABLED: "sometimes",
})
assert(
  validateRuntimeConfig(invalidDailySummaryEnabled).some((error) => error.includes("PERSONA_DAILY_SUMMARY_ENABLED")),
  "invalid Daily Summary enabled flag should fail validation",
)

console.log("infra config contract ok")

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
