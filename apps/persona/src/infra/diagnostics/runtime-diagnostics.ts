import { basename, join, relative, resolve } from "path"
import { existsSync, statSync } from "fs"
import { loadRuntimeConfig, validateRuntimeConfig } from "../config/index.js"

interface Check {
  name: string
  status: "ok" | "warn" | "fail"
  detail: string
}

const projectRoot = process.cwd()
const config = loadRuntimeConfig()
const checks: Check[] = []

checks.push(...configChecks())
checks.push(...pathChecks())
checks.push(...runtimeNotes())

printReport(checks)

if (checks.some((check) => check.status === "fail")) {
  process.exitCode = 1
}

function configChecks(): Check[] {
  const requireLlm = config.llmProvider === "deepseek"
  const requireTelegram = Boolean(config.telegramToken)
  const validationErrors = validateRuntimeConfig(config, { requireLlm, requireTelegram })
  const result: Check[] = []

  result.push({
    name: "LLM_PROVIDER",
    status: validationErrors.some((error) => error.includes("LLM_PROVIDER")) ? "fail" : "ok",
    detail: config.llmProvider,
  })

  result.push({
    name: "API_PORT",
    status: validationErrors.some((error) => error.includes("API_PORT")) ? "fail" : "ok",
    detail: String(config.apiPort),
  })

  result.push({
    name: "API_HOST",
    status: validationErrors.some((error) => error.includes("API_HOST"))
      ? "fail"
      : isLoopbackHost(config.apiHost) ? "ok" : "warn",
    detail: isLoopbackHost(config.apiHost)
      ? `${config.apiHost} (loopback only)`
      : `${config.apiHost} (LAN/VPN only; block this port from the public internet)`,
  })

  result.push({
    name: "PERSONA_ALLOWED_ORIGINS",
    status: validationErrors.some((error) => error.includes("PERSONA_ALLOWED_ORIGINS")) ? "fail" : "ok",
    detail: `${config.allowedOrigins.length} configured origin(s)`,
  })

  result.push({
    name: "OPENAI_API_KEY",
    status: validationErrors.some((error) => error.includes("OPENAI_API_KEY")) ? "fail" : "ok",
    detail: describeSecret(config.openaiApiKey, "DeepSeek bearer token"),
  })

  result.push({
    name: "PERSONA_ANALYSIS_MODEL",
    status: validationErrors.some((error) => error.includes("PERSONA_ANALYSIS_")) ? "fail" : "ok",
    detail: config.analysisEndpoint
      ? `${config.analysisModel} through dedicated endpoint`
      : `${config.analysisModel} through server fallback`,
  })

  result.push({
    name: "PERSONA_ANALYSIS_API_KEY",
    status: validationErrors.some((error) => error.includes("PERSONA_ANALYSIS_API_KEY")) ? "fail" : "ok",
    detail: config.analysisApiKey
      ? describeSecret(config.analysisApiKey, "analysis bearer token")
      : "empty; uses the server fallback key",
  })

  result.push({
    name: "TELEGRAM_TOKEN",
    status: validationErrors.some((error) => error.includes("TELEGRAM_TOKEN"))
      ? "fail"
      : config.telegramToken ? "ok" : "warn",
    detail: config.telegramToken ? describeSecret(config.telegramToken, "Telegram bot token") : "empty; Telegram will be skipped",
  })

  result.push({
    name: "TELEGRAM_ALLOWED_CHAT_IDS",
    status: validationErrors.some((error) => error.includes("TELEGRAM_ALLOWED_CHAT_IDS"))
      ? "fail"
      : config.telegramToken ? "ok" : "warn",
    detail: config.telegramToken
      ? `${config.telegramAllowedChatIds.length} trusted chat(s)`
      : "not required while Telegram is disabled",
  })

  result.push({
    name: "Daily Summary scheduler",
    status: validationErrors.some((error) => error.includes("PERSONA_DAILY_SUMMARY_")) ? "fail" : "ok",
    detail: config.dailySummaryEnabled
      ? `enabled at ${config.dailySummaryTime} (${config.timeZone})`
      : "disabled",
  })

  result.push({
    name: "Persona Snapshot scheduler",
    status: validationErrors.some((error) => (
      error.includes("PERSONA_OBSIDIAN_SNAPSHOT_") ||
      error.includes("OBSIDIAN_VAULT_PATH")
    )) ? "fail" : "ok",
    detail: config.obsidianSnapshotEnabled
      ? `enabled at ${config.obsidianSnapshotTime} (${config.timeZone})`
      : "disabled",
  })

  return result
}

function pathChecks(): Check[] {
  const envPath = join(projectRoot, ".env")
  const schemaPath = join(projectRoot, "apps", "persona", "src", "infra", "db", "schema.sql")
  const dataDir = resolve(projectRoot, process.env.PERSONA_DATA_DIR?.trim() || "data")
  const dbPath = join(dataDir, "persona-os.db")
  const vaultPath = config.obsidianVaultPath ? resolve(config.obsidianVaultPath) : ""

  return [
    {
      name: ".env",
      status: existsSync(envPath) ? "ok" : "warn",
      detail: existsSync(envPath) ? ".env exists" : ".env not found; copy .env.example before real-mode evaluation",
    },
    {
      name: "Database schema",
      status: existsSync(schemaPath) ? "ok" : "fail",
      detail: "apps/persona/src/infra/db/schema.sql",
    },
    {
      name: "SQLite database",
      status: existsSync(dbPath) ? "ok" : "warn",
      detail: existsSync(dbPath) ? `data/persona-os.db (${formatBytes(statSync(dbPath).size)})` : "data/persona-os.db does not exist yet",
    },
    {
      name: "Obsidian vault",
      status: vaultStatus(vaultPath),
      detail: describeVault(vaultPath),
    },
  ]
}

function runtimeNotes(): Check[] {
  return [
    {
      name: "Network calls",
      status: "ok",
      detail: "not performed by this diagnostic",
    },
    {
      name: "Long-running services",
      status: "ok",
      detail: "not started by this diagnostic",
    },
    {
      name: "Next manual checklist",
      status: "ok",
      detail: "docs/07-product/real-mode-evaluation.md",
    },
  ]
}

function describeSecret(value: string, label: string): string {
  if (!value) return `empty ${label}`
  return `${label} present (${value.length} chars, ${redact(value)})`
}

function redact(value: string): string {
  if (value.startsWith("sk-")) return "sk-...[redacted]"
  if (/^\d+:/.test(value)) return "telegram-token...[redacted]"
  return "[redacted]"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function printReport(items: Check[]): void {
  console.log("Persona runtime diagnostics")
  console.log("No network calls. No services started. Secrets are redacted.")
  console.log("")

  for (const item of items) {
    console.log(`[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`)
  }
}

function vaultStatus(vaultPath: string): Check["status"] {
  if (!vaultPath) return "warn"
  if (!existsSync(vaultPath)) return "warn"
  return isInsideProject(vaultPath) ? "warn" : "ok"
}

function describeVault(vaultPath: string): string {
  if (!vaultPath) return "OBSIDIAN_VAULT_PATH is empty"
  if (!existsSync(vaultPath)) return `configured path not found (leaf: ${basename(vaultPath) || "[unknown]"})`
  if (isInsideProject(vaultPath)) return `exists but appears inside repository (leaf: ${basename(vaultPath)})`
  return `exists outside repository (leaf: ${basename(vaultPath)})`
}

function isInsideProject(targetPath: string): boolean {
  const rel = relative(projectRoot, targetPath)
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !/^[A-Za-z]:/.test(rel))
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}
