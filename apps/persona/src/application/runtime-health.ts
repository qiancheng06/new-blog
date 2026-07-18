import { lstatSync, realpathSync } from "fs"
import { isAbsolute, relative, sep } from "path"
import { getAnalysisJobsStatus } from "./analysis-jobs.js"
import { getPendingBackgroundTaskCount } from "./background-tasks.js"
import {
  config,
  isSupportedProvider,
  validateRuntimeConfig,
  type RuntimeConfig,
} from "../infra/config/index.js"
import { queryOne } from "../infra/db/pool.js"

export type TelegramRuntimeStatus = "disabled" | "starting" | "running" | "failed" | "stopped"

export interface RuntimeHealthComponents {
  database: { status: "ok" | "failed" }
  llm: {
    status: "ok" | "misconfigured"
    provider: "mock" | "deepseek" | "unsupported"
    mode: "mock" | "real" | "unknown"
  }
  telegram: { status: TelegramRuntimeStatus }
  obsidian: { status: "disabled" | "ok" | "unavailable" }
  analysis: {
    status: "ok" | "degraded"
    jobs: { pending: number; running: number; succeeded: number; failed: number }
  }
  background_tasks: {
    status: "ok" | "busy"
    pending: number
  }
}

export interface RuntimeHealthSnapshot {
  status: "ok" | "degraded" | "not_ready"
  ready: boolean
  components: RuntimeHealthComponents
}

let telegramRuntimeStatus: TelegramRuntimeStatus = config.telegramToken ? "stopped" : "disabled"

export function setTelegramRuntimeStatus(status: TelegramRuntimeStatus): void {
  telegramRuntimeStatus = status
}

export function getRuntimeHealthSnapshot(): RuntimeHealthSnapshot {
  const jobs = getSafeAnalysisStatus()
  const pendingBackgroundTasks = getPendingBackgroundTaskCount()
  return summarizeRuntimeHealth({
    database: getDatabaseStatus(),
    llm: getLlmStatus(config),
    telegram: { status: telegramRuntimeStatus },
    obsidian: getObsidianStatus(config),
    analysis: {
      status: jobs.failed > 0 ? "degraded" : "ok",
      jobs,
    },
    background_tasks: {
      status: pendingBackgroundTasks > 0 ? "busy" : "ok",
      pending: pendingBackgroundTasks,
    },
  })
}

export function summarizeRuntimeHealth(components: RuntimeHealthComponents): RuntimeHealthSnapshot {
  const ready = components.database.status === "ok" && components.llm.status === "ok"
  if (!ready) return { status: "not_ready", ready, components }

  const degraded = (
    components.telegram.status === "failed" ||
    components.telegram.status === "stopped" ||
    components.obsidian.status === "unavailable" ||
    components.analysis.status === "degraded"
  )
  return { status: degraded ? "degraded" : "ok", ready, components }
}

function getDatabaseStatus(): RuntimeHealthComponents["database"] {
  try {
    const row = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('events', 'profile', 'topics', 'timeline_events', 'daily_notes', 'analysis_jobs')`,
    )
    return { status: Number(row?.count) === 6 ? "ok" : "failed" }
  } catch {
    return { status: "failed" }
  }
}

function getLlmStatus(runtimeConfig: RuntimeConfig): RuntimeHealthComponents["llm"] {
  const provider = isSupportedProvider(runtimeConfig.llmProvider) ? runtimeConfig.llmProvider : "unsupported"
  const mode = provider === "mock" ? "mock" : provider === "deepseek" ? "real" : "unknown"
  const errors = validateRuntimeConfig(runtimeConfig, { requireLlm: provider === "deepseek" })
  const misconfigured = errors.some((error) => (
    error.startsWith("LLM_PROVIDER") || error.startsWith("OPENAI_API_KEY")
  ))
  return {
    status: misconfigured ? "misconfigured" : "ok",
    provider,
    mode,
  }
}

function getObsidianStatus(runtimeConfig: RuntimeConfig): RuntimeHealthComponents["obsidian"] {
  if (!runtimeConfig.obsidianVaultPath) return { status: "disabled" }

  try {
    const vaultRoot = realpathSync(runtimeConfig.obsidianVaultPath)
    if (!lstatSync(vaultRoot).isDirectory()) return { status: "unavailable" }
    const projectRoot = realpathSync(process.cwd())
    const fromProject = relative(projectRoot, vaultRoot)
    const insideProject = fromProject === "" || (
      fromProject !== ".." &&
      !fromProject.startsWith(`..${sep}`) &&
      !isAbsolute(fromProject)
    )
    return { status: insideProject ? "unavailable" : "ok" }
  } catch {
    return { status: "unavailable" }
  }
}

function getSafeAnalysisStatus(): RuntimeHealthComponents["analysis"]["jobs"] {
  try {
    return getAnalysisJobsStatus()
  } catch {
    return { pending: 0, running: 0, succeeded: 0, failed: 0 }
  }
}
