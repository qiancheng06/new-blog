import "dotenv/config"

export type LlmProvider = "deepseek" | "mock"

export interface RuntimeConfig {
  telegramToken: string
  telegramAllowedChatIds: number[]
  openaiApiKey: string
  llmProvider: string
  apiPort: number
  apiHost: string
  allowedOrigins: string[]
  timeZone: string
  obsidianVaultPath: string
  dailyNoteDirectory: string
}

export interface RuntimeConfigValidationOptions {
  requireLlm?: boolean
  requireTelegram?: boolean
}

function optional(key: string): string {
  return process.env[key]?.trim() || ""
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    telegramToken: env.TELEGRAM_TOKEN?.trim() || "",
    telegramAllowedChatIds: parseNumberList(env.TELEGRAM_ALLOWED_CHAT_IDS),
    openaiApiKey: env.OPENAI_API_KEY?.trim() || "",
    llmProvider: env.LLM_PROVIDER?.trim() || "deepseek",
    apiPort: Number(env.API_PORT || 3001),
    apiHost: env.API_HOST?.trim() || "127.0.0.1",
    allowedOrigins: parseTextList(env.PERSONA_ALLOWED_ORIGINS, [
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ]),
    timeZone: env.PERSONA_TIME_ZONE?.trim() || "Asia/Shanghai",
    obsidianVaultPath: env.OBSIDIAN_VAULT_PATH?.trim() || "",
    dailyNoteDirectory: env.PERSONA_DAILY_NOTE_DIR?.trim() || "persona/daily-notes",
  }
}

export function validateRuntimeConfig(
  runtimeConfig: RuntimeConfig,
  options: RuntimeConfigValidationOptions = {},
): string[] {
  const errors: string[] = []

  if (!isSupportedProvider(runtimeConfig.llmProvider)) {
    errors.push(`LLM_PROVIDER must be one of: deepseek, mock. Current: ${runtimeConfig.llmProvider || "(empty)"}`)
  }

  if (!Number.isInteger(runtimeConfig.apiPort) || runtimeConfig.apiPort < 1 || runtimeConfig.apiPort > 65535) {
    errors.push(`API_PORT must be an integer between 1 and 65535. Current: ${String(runtimeConfig.apiPort)}`)
  }

  if (!/^[A-Za-z0-9.:[\]-]+$/.test(runtimeConfig.apiHost)) {
    errors.push(`API_HOST must be a hostname or IP address. Current: ${runtimeConfig.apiHost || "(empty)"}`)
  }

  const invalidOrigin = runtimeConfig.allowedOrigins.find((origin) => !isHttpOrigin(origin))
  if (invalidOrigin) {
    errors.push(`PERSONA_ALLOWED_ORIGINS contains an invalid HTTP(S) origin: ${invalidOrigin}`)
  }

  if (!isValidTimeZone(runtimeConfig.timeZone)) {
    errors.push(`PERSONA_TIME_ZONE must be a valid IANA time zone. Current: ${runtimeConfig.timeZone || "(empty)"}`)
  }

  if (!isSafeRelativeDirectory(runtimeConfig.dailyNoteDirectory)) {
    errors.push("PERSONA_DAILY_NOTE_DIR must be a relative directory without '.' or '..' segments.")
  }

  if (options.requireLlm && runtimeConfig.llmProvider !== "mock" && isPlaceholderOrEmpty(runtimeConfig.openaiApiKey)) {
    errors.push("OPENAI_API_KEY is required for real DeepSeek mode. Use LLM_PROVIDER=mock for no-network local demos.")
  }

  if (options.requireTelegram && isPlaceholderOrEmpty(runtimeConfig.telegramToken)) {
    errors.push("TELEGRAM_TOKEN is required when Telegram startup is enabled.")
  }

  if (runtimeConfig.telegramAllowedChatIds.some((id) => !Number.isSafeInteger(id) || id === 0)) {
    errors.push("TELEGRAM_ALLOWED_CHAT_IDS must contain non-zero safe integers separated by commas.")
  }

  if (options.requireTelegram && runtimeConfig.telegramAllowedChatIds.length === 0) {
    errors.push("TELEGRAM_ALLOWED_CHAT_IDS must contain at least one trusted chat when Telegram startup is enabled.")
  }

  return errors
}

export function assertRuntimeConfig(
  runtimeConfig: RuntimeConfig,
  options: RuntimeConfigValidationOptions = {},
): void {
  const errors = validateRuntimeConfig(runtimeConfig, options)
  if (errors.length > 0) {
    throw new Error(`Invalid Persona runtime configuration:\n- ${errors.join("\n- ")}`)
  }
}

export function isSupportedProvider(provider: string): provider is LlmProvider {
  return provider === "deepseek" || provider === "mock"
}

function isPlaceholderOrEmpty(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    !normalized ||
    normalized === "your_bot_token_here" ||
    normalized === "sk-your_key_here" ||
    normalized === "sk-your_deepseek_key_here" ||
    normalized === "your_key_here"
  )
}

function parseNumberList(value: string | undefined): number[] {
  return parseTextList(value).map((item) => Number(item))
}

function parseTextList(value: string | undefined, fallback: string[] = []): string[] {
  if (value === undefined || value.trim() === "") return [...fallback]
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
}

function isHttpOrigin(value: string): boolean {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === value
  } catch {
    return false
  }
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function isSafeRelativeDirectory(value: string): boolean {
  if (!value || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\")) return false
  const segments = value.split(/[\\/]+/)
  return segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

export const config = loadRuntimeConfig()
