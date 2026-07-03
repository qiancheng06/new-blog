import "dotenv/config"

export type LlmProvider = "deepseek" | "mock"

export interface RuntimeConfig {
  telegramToken: string
  openaiApiKey: string
  llmProvider: string
  apiPort: number
  obsidianVaultPath: string
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
    openaiApiKey: env.OPENAI_API_KEY?.trim() || "",
    llmProvider: env.LLM_PROVIDER?.trim() || "deepseek",
    apiPort: Number(env.API_PORT || 3001),
    obsidianVaultPath: env.OBSIDIAN_VAULT_PATH?.trim() || "",
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

  if (options.requireLlm && runtimeConfig.llmProvider !== "mock" && isPlaceholderOrEmpty(runtimeConfig.openaiApiKey)) {
    errors.push("OPENAI_API_KEY is required for real DeepSeek mode. Use LLM_PROVIDER=mock for no-network local demos.")
  }

  if (options.requireTelegram && isPlaceholderOrEmpty(runtimeConfig.telegramToken)) {
    errors.push("TELEGRAM_TOKEN is required when Telegram startup is enabled.")
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

export const config = loadRuntimeConfig()
