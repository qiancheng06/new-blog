import {
  beginPersonaSnapshotRun,
  ensurePersonaSnapshotRun,
  getNextIncompletePersonaSnapshotRun,
  getPersonaSnapshotRunStats,
  markPersonaSnapshotRunFailed,
  markPersonaSnapshotRunSucceeded,
  recoverInterruptedPersonaSnapshotRuns,
  type PersonaSnapshotRunErrorCode,
  type PersonaSnapshotRunRow,
  type PersonaSnapshotRunStats,
} from "../domain/persona-snapshot-run/store.js"
import { config } from "../infra/config/index.js"
import { trackBackgroundTask } from "./background-tasks.js"
import { getCurrentDailySummaryDate } from "./daily-summary.js"
import { getNextDailySummaryRunAt } from "./daily-summary-scheduler.js"
import {
  PersonaSnapshotArchiveConflictError,
  PersonaSnapshotArchiveUnavailableError,
  archivePersonaSnapshot,
  type PersonaSnapshotArchiveResult,
} from "./obsidian-snapshot.js"

const DEFAULT_RETRY_BASE_MS = 15 * 60 * 1_000
const MAX_RETRY_MS = 6 * 60 * 60 * 1_000

export type PersonaSnapshotSchedulerStatus = "disabled" | "idle" | "running" | "failed" | "stopped"

export interface PersonaSnapshotSchedulerSnapshot {
  status: PersonaSnapshotSchedulerStatus
  targetDate: string | null
  lastCompletedDate: string | null
  nextRunAt: string | null
  failureCount: number
  runs: PersonaSnapshotRunStats
}

export interface PersonaSnapshotSchedulerOptions {
  enabled?: boolean
  timeZone?: string
  localTime?: string
  now?: () => Date
  retryBaseMs?: number
  archiveSnapshot?: () => PersonaSnapshotArchiveResult | Promise<PersonaSnapshotArchiveResult>
}

export interface PersonaSnapshotScheduler {
  stop: () => void
  runNow: () => Promise<void>
}

let schedulerSnapshot: PersonaSnapshotSchedulerSnapshot = emptySnapshot("disabled")
let activeScheduler: PersonaSnapshotScheduler | null = null

export function getPersonaSnapshotSchedulerSnapshot(): PersonaSnapshotSchedulerSnapshot {
  return {
    ...schedulerSnapshot,
    runs: getSafeRunStats(),
  }
}

export function startPersonaSnapshotScheduler(
  options: PersonaSnapshotSchedulerOptions = {},
): PersonaSnapshotScheduler {
  if (activeScheduler) throw new Error("Persona Snapshot scheduler is already running")

  const enabled = options.enabled ?? config.obsidianSnapshotEnabled ?? false
  if (!enabled) {
    schedulerSnapshot = emptySnapshot("disabled")
    return { stop: () => undefined, runNow: async () => undefined }
  }

  const timeZone = options.timeZone ?? config.timeZone
  const localTime = options.localTime ?? config.obsidianSnapshotTime
  const now = options.now ?? (() => new Date())
  const retryBaseMs = Math.max(1, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS)
  const archiveSnapshot = options.archiveSnapshot ?? archivePersonaSnapshot
  const recoveredRuns = recoverInterruptedPersonaSnapshotRuns()
  if (recoveredRuns > 0) {
    console.warn(`[persona snapshot recovery] marked ${recoveredRuns} interrupted run(s) as failed`)
  }

  let timer: NodeJS.Timeout | null = null
  let running: Promise<void> | null = null
  let stopped = false

  const clearTimer = (): void => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  const schedule = (at: Date, targetDate: string): void => {
    if (stopped) return
    clearTimer()
    schedulerSnapshot.nextRunAt = at.toISOString()
    const delay = Math.max(0, at.getTime() - now().getTime())
    timer = setTimeout(() => {
      timer = null
      void execute(targetDate)
    }, delay)
  }

  const scheduleDaily = (): void => {
    const at = getNextDailySummaryRunAt(now(), localTime, timeZone)
    schedule(at, getCurrentDailySummaryDate(at, timeZone))
  }

  const scheduleRetry = (targetDate: string): void => {
    const exponent = Math.max(0, schedulerSnapshot.failureCount - 1)
    const retryMs = Math.min(MAX_RETRY_MS, retryBaseMs * 2 ** exponent)
    schedule(new Date(now().getTime() + retryMs), targetDate)
  }

  const execute = (requestedDate: string): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (running) return running

    clearTimer()
    schedulerSnapshot = {
      ...schedulerSnapshot,
      status: "running",
      targetDate: requestedDate,
      nextRunAt: null,
    }

    const task = (async () => {
      let attempt: PersonaSnapshotRunRow | null = null
      let targetDate = requestedDate
      try {
        ensurePersonaSnapshotRun(requestedDate)
        const pending = getNextIncompletePersonaSnapshotRun()
        if (!pending) {
          schedulerSnapshot = {
            ...schedulerSnapshot,
            status: stopped ? "stopped" : "idle",
            targetDate: null,
            failureCount: 0,
          }
          if (!stopped) scheduleDaily()
          return
        }

        targetDate = pending.date
        attempt = beginPersonaSnapshotRun(targetDate)
        if (!attempt) throw new PersonaSnapshotRunStateError()
        schedulerSnapshot.targetDate = targetDate

        const archived = await archiveSnapshot()
        if (!markPersonaSnapshotRunSucceeded(targetDate, attempt.attempt_count, archived.snapshotEventId)) {
          throw new PersonaSnapshotRunStateError()
        }
        schedulerSnapshot = {
          status: stopped ? "stopped" : "idle",
          targetDate: null,
          lastCompletedDate: targetDate,
          nextRunAt: null,
          failureCount: 0,
          runs: schedulerSnapshot.runs,
        }
        if (!stopped) {
          const nextPending = getNextIncompletePersonaSnapshotRun()
          if (nextPending) schedule(new Date(now().getTime() + 1_000), nextPending.date)
          else scheduleDaily()
        }
      } catch (err) {
        if (attempt) {
          markPersonaSnapshotRunFailed(
            targetDate,
            attempt.attempt_count,
            classifyRunError(err),
          )
        }
        schedulerSnapshot = {
          ...schedulerSnapshot,
          status: stopped ? "stopped" : "failed",
          targetDate,
          nextRunAt: null,
          failureCount: schedulerSnapshot.failureCount + 1,
        }
        if (!stopped) {
          console.error("[persona snapshot scheduler] automatic run failed")
          scheduleRetry(targetDate)
        }
      }
    })().finally(() => {
      if (running === task) running = null
    })

    running = task
    trackBackgroundTask(task, `persona-snapshot:${requestedDate}`)
    return task
  }

  const controller: PersonaSnapshotScheduler = {
    stop: () => {
      if (stopped) return
      stopped = true
      clearTimer()
      schedulerSnapshot = {
        ...schedulerSnapshot,
        status: "stopped",
        nextRunAt: null,
      }
      if (activeScheduler === controller) activeScheduler = null
    },
    runNow: () => execute(getLatestScheduledDate(now(), localTime, timeZone)),
  }

  activeScheduler = controller
  schedulerSnapshot = emptySnapshot("idle")
  void execute(getLatestScheduledDate(now(), localTime, timeZone))
  return controller
}

export function getLatestScheduledDate(now: Date, localTime: string, timeZone: string): string {
  const nextRunAt = getNextDailySummaryRunAt(now, localTime, timeZone)
  const nextDate = getCurrentDailySummaryDate(nextRunAt, timeZone)
  return shiftDate(nextDate, -1)
}

function classifyRunError(err: unknown): Exclude<PersonaSnapshotRunErrorCode, ""> {
  if (err instanceof PersonaSnapshotRunStateError) return "state_error"
  if (err instanceof PersonaSnapshotArchiveConflictError) return "archive_conflict"
  if (err instanceof PersonaSnapshotArchiveUnavailableError) return "archive_unavailable"
  return "archive_error"
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

function emptySnapshot(status: PersonaSnapshotSchedulerStatus): PersonaSnapshotSchedulerSnapshot {
  return {
    status,
    targetDate: null,
    lastCompletedDate: null,
    nextRunAt: null,
    failureCount: 0,
    runs: emptyRunStats(),
  }
}

function getSafeRunStats(): PersonaSnapshotRunStats {
  try {
    return getPersonaSnapshotRunStats()
  } catch {
    return emptyRunStats()
  }
}

function emptyRunStats(): PersonaSnapshotRunStats {
  return { pending: 0, running: 0, succeeded: 0, failed: 0 }
}

class PersonaSnapshotRunStateError extends Error {}
