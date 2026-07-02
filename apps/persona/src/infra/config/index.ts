import "dotenv/config"

function optional(key: string): string {
  return process.env[key] || ""
}

export const config = {
  telegramToken: optional("TELEGRAM_TOKEN"),
  openaiApiKey: optional("OPENAI_API_KEY"),
  llmProvider: optional("LLM_PROVIDER") || "deepseek",
  apiPort: Number(process.env.API_PORT) || 3001,
  obsidianVaultPath: optional("OBSIDIAN_VAULT_PATH"),
}
