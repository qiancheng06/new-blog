import { config } from "../infra/config/index.js"
import {
  DailySummaryNotFoundError,
  archiveDailySummary,
  generateDailySummary,
  getCurrentDailySummaryDate,
  getDailySummary,
  getPreviousDailySummaryDate,
  type DailyNote,
} from "./daily-summary.js"
import { trackBackgroundTask } from "./background-tasks.js"
import {
  beginDailySummaryRun,
  configureIncompleteDailySummaryRuns,
  ensureDailySummaryRun,
  getDailySummaryRunStats,
  getNextIncompleteDailySummaryRun,
  markDailySummaryRunFailed,
  markDailySummaryRunSucceeded,
  recoverInterruptedDailySummaryRuns,
  type DailySummaryRunErrorCode,
  type DailySummaryRunRow,
  type DailySummaryRunStats,
} from "../domain/daily-summary-run/store.js"

const DEFAULT_RETRY_BASE_MS = 15 * 60 * 1_000
const MAX_RETRY_MS = 6 * 60 * 60 * 1_000

export type DailySummarySchedulerStatus = "disabled" | "idle" | "running" | "failed" | "stopped"

export interface DailySummarySchedulerSnapshot {
  status: DailySummarySchedulerStatus
  targetDate: string | null
  lastCompletedDate: string | null
  nextRunAt: string | null
  failureCount: number
  runs: DailySummaryRunStats
}

export interface DailySummaryMaintenanceResult {
  status: "generated" | "archived" | "generated_and_archived" | "unchanged"
  note: DailyNote
}

export interface DailySummarySchedulerOptions {
  enabled?: boolean
  timeZone?: string
  localTime?: string
  archive?: boolean
  now?: () => Date
  retryBaseMs?: number
}

export interface DailySummaryScheduler {
  stop: () => void
  runNow: () => Promise<void>
}

let schedulerSnapshot: DailySummarySchedulerSnapshot = {
  status: "disabled",
  targetDate: null,
  lastCompletedDate: null,
  nextRunAt: null,
  failureCount: 0,
  runs: emptyRunStats(),
}
let activeScheduler: DailySummaryScheduler | null = null

export function getDailySummarySchedulerSnapshot(): DailySummarySchedulerSnapshot {
  return {
    ...schedulerSnapshot,
    runs: getSafeRunStats(),
  }
}

export async function runDailySummaryMaintenance(
  date: string,
  options: { archive?: boolean } = {},
): Promise<DailySummaryMaintenanceResult> {
  let note = readDailySummary(date)
  let generated = false

  if (!note?.finalizedAt) {
    const result = await generateDailySummary({ date, finalize: true })
    note = result.note
    generated = true
  }

  let archived = false
  if (options.archive === true && !note.archiveEventId) {
    note = archiveDailySummary(date).note
    archived = true
  }

  return {
    status: generated && archived
      ? "generated_and_archived"
      : generated
        ? "generated"
        : archived
          ? "archived"
          : "unchanged",
    note,
  }
}

export function startDailySummaryScheduler(
  options: DailySummarySchedulerOptions = {},
): DailySummaryScheduler {
  if (activeScheduler) throw new Error("Daily Summary scheduler is already running")

  const enabled = options.enabled ?? config.dailySummaryEnabled ?? false
  if (!enabled) {
    schedulerSnapshot = emptySnapshot("disabled")
    return { stop: () => undefined, runNow: async () => undefined }
  }

  const timeZone = options.timeZone ?? config.timeZone
  const localTime = options.localTime ?? config.dailySummaryTime
  const shouldArchive = options.archive ?? Boolean(config.obsidianVaultPath)
  const now = options.now ?? (() => new Date())
  const retryBaseMs = Math.max(1, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS)
  const recoveredRuns = recoverInterruptedDailySummaryRuns()
  configureIncompleteDailySummaryRuns(shouldArchive)
  if (recoveredRuns > 0) {
    console.warn(`[daily summary recovery] marked ${recoveredRuns} interrupted run(s) as failed`)
  }
  let timer: NodeJS.Timeout | null = null
  let running: Promise<void> | null = null
  let stopped = false

  const clearTimer = (): void => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  const schedule = (at: Date, targetDate?: string): void => {
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
    schedule(getNextDailySummaryRunAt(now(), localTime, timeZone))
  }

  const scheduleRetry = (targetDate: string): void => {
    const exponent = Math.max(0, schedulerSnapshot.failureCount - 1)
    const retryMs = Math.min(MAX_RETRY_MS, retryBaseMs * 2 ** exponent)
    schedule(new Date(now().getTime() + retryMs), targetDate)
  }

  const execute = (retryTargetDate?: string): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (running) return running

    const requestedDate = retryTargetDate ?? getPreviousDailySummaryDate(now(), timeZone)
    clearTimer()
    schedulerSnapshot = {
      ...schedulerSnapshot,
      status: "running",
      targetDate: requestedDate,
      nextRunAt: null,
    }

    const task = (async () => {
      let attempt: DailySummaryRunRow | null = null
      let targetDate = requestedDate
      try {
        ensureDailySummaryRun(requestedDate, shouldArchive)
        const pending = getNextIncompleteDailySummaryRun()
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
        attempt = beginDailySummaryRun(targetDate)
        if (!attempt) throw new DailySummaryRunStateError()
        schedulerSnapshot.targetDate = targetDate

        await runDailySummaryMaintenance(targetDate, { archive: attempt.archive_requested === 1 })
        if (!markDailySummaryRunSucceeded(targetDate, attempt.attempt_count)) {
          throw new DailySummaryRunStateError()
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
          const nextPending = getNextIncompleteDailySummaryRun()
          if (nextPending) schedule(new Date(now().getTime() + 1_000), nextPending.date)
          else scheduleDaily()
        }
      } catch (err) {
        if (attempt) {
          markDailySummaryRunFailed(
            targetDate,
            attempt.attempt_count,
            classifyRunError(err, targetDate, attempt.archive_requested === 1),
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
          console.error("[daily summary scheduler] automatic run failed")
          scheduleRetry(targetDate)
        }
      }
    })().finally(() => {
      if (running === task) running = null
    })

    running = task
    trackBackgroundTask(task, `daily-summary:${requestedDate}`)
    return task
  }

  const controller: DailySummaryScheduler = {
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
    runNow: () => execute(),
  }

  activeScheduler = controller
  schedulerSnapshot = emptySnapshot("idle")
  void execute()
  return controller
}

export function getNextDailySummaryRunAt(now: Date, localTime: string, timeZone: string): Date {
  const [hour, minute] = parseLocalTime(localTime)
  const currentDate = getCurrentDailySummaryDate(now, timeZone)
  let candidate = zonedDateTimeToUtc(currentDate, hour, minute, timeZone)
  if (candidate.getTime() <= now.getTime()) {
    candidate = zonedDateTimeToUtc(shiftDate(currentDate, 1), hour, minute, timeZone)
  }
  return candidate
}

function readDailySummary(date: string): DailyNote | null {
  try {
    return getDailySummary(date)
  } catch (err) {
    if (err instanceof DailySummaryNotFoundError) return null
    throw err
  }
}

function parseLocalTime(value: string): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error("Daily Summary schedule time is invalid")
  }
  return [Number(match[1]), Number(match[2])]
}

function zonedDateTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute, 0)
  let candidate = target

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = readDateTimeParts(new Date(candidate), timeZone)
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    )
    const correction = target - currentAsUtc
    candidate += correction
    if (correction === 0) break
  }
  return new Date(candidate)
}

function readDateTimeParts(value: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  }
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

function emptySnapshot(status: DailySummarySchedulerStatus): DailySummarySchedulerSnapshot {
  return {
    status,
    targetDate: null,
    lastCompletedDate: null,
    nextRunAt: null,
    failureCount: 0,
    runs: emptyRunStats(),
  }
}

class DailySummaryRunStateError extends Error {}

function classifyRunError(
  err: unknown,
  date: string,
  archiveRequested: boolean,
): Exclude<DailySummaryRunErrorCode, ""> {
  if (err instanceof DailySummaryRunStateError) return "state_error"
  const note = readDailySummary(date)
  if (archiveRequested && note?.finalizedAt && !note.archiveEventId) return "archive_error"
  return "generation_error"
}

function getSafeRunStats(): DailySummaryRunStats {
  try {
    return getDailySummaryRunStats()
  } catch {
    return emptyRunStats()
  }
}

function emptyRunStats(): DailySummaryRunStats {
  return { pending: 0, running: 0, succeeded: 0, failed: 0 }
}
