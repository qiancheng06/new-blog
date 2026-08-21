import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const contractTag = `codex-daily-scheduler-${Date.now()}`
const contractDate = createContractDate(Date.now())
const concurrentDate = shiftDate(contractDate, -1)
const recoveryDate = shiftDate(contractDate, -2)
const vaultPath = mkdtempSync(join(tmpdir(), "persona-daily-scheduler-"))

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""
process.env.PERSONA_TIME_ZONE = "UTC"
process.env.OBSIDIAN_VAULT_PATH = vaultPath
process.env.PERSONA_DAILY_NOTE_DIR = "persona/daily-notes"

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { generateDailySummary, getDailySummary } = await import("./daily-summary.js")
const {
  beginDailySummaryRun,
  ensureDailySummaryRun,
  getDailySummaryRun,
} = await import("../domain/daily-summary-run/store.js")
const {
  getDailySummarySchedulerSnapshot,
  getNextDailySummaryRunAt,
  runDailySummaryMaintenance,
  startDailySummaryScheduler,
} = await import("./daily-summary-scheduler.js")

initializeDb()
seedSourceEvent(contractDate, `${contractTag}-primary`)
seedSourceEvent(concurrentDate, `${contractTag}-concurrent`)
seedSourceEvent(recoveryDate, `${contractTag}-recovery`)

try {
  const generated = await runDailySummaryMaintenance(contractDate, { archive: false })
  assert(generated.status === "generated", "first automatic maintenance must generate")
  assert(typeof generated.note.finalizedAt === "string", "automatic generation must finalize the Daily Note")
  assert(summaryEventCount(contractDate) === 1, "first automatic maintenance must append one summary Event")

  const unchanged = await runDailySummaryMaintenance(contractDate, { archive: false })
  assert(unchanged.status === "unchanged", "completed Daily Note maintenance must be idempotent")
  assert(summaryEventCount(contractDate) === 1, "idempotent maintenance must not append another summary Event")

  const manual = await generateDailySummary({ date: contractDate })
  assert(manual.note.finalizedAt === null, "manual refresh must reopen automatic finalization")
  assert(summaryEventCount(contractDate) === 2, "manual refresh must retain its audit Event")

  const recovered = await runDailySummaryMaintenance(contractDate, { archive: false })
  assert(recovered.status === "generated", "maintenance must regenerate a manually reopened Daily Note")
  assert(typeof recovered.note.finalizedAt === "string", "recovered Daily Note must be finalized")
  assert(summaryEventCount(contractDate) === 3, "recovery must append one new summary Event")

  const archived = await runDailySummaryMaintenance(contractDate, { archive: true })
  assert(archived.status === "archived", "archive-only recovery must not regenerate the summary")
  assert(typeof archived.note.archiveEventId === "string", "archive recovery must record its audit Event")
  assert(summaryEventCount(contractDate) === 3, "archive-only recovery must preserve summary Event count")

  const archiveUnchanged = await runDailySummaryMaintenance(contractDate, { archive: true })
  assert(archiveUnchanged.status === "unchanged", "completed generation and archive must be idempotent")

  const concurrent = await Promise.all([
    generateDailySummary({ date: concurrentDate }),
    generateDailySummary({ date: concurrentDate }),
    generateDailySummary({ date: concurrentDate, finalize: true }),
  ])
  assert(summaryEventCount(concurrentDate) === 1, "concurrent generation must use one model/write attempt")
  assert(concurrent.every((item) => item.summaryEventId === concurrent[0].summaryEventId), "concurrent callers must share one result")
  assert(typeof getDailySummary(concurrentDate).finalizedAt === "string", "concurrent finalize request must be honored")

  const next = getNextDailySummaryRunAt(
    new Date("2026-07-18T16:00:00.000Z"),
    "00:05",
    "Asia/Shanghai",
  )
  assert(next.toISOString() === "2026-07-18T16:05:00.000Z", "next local schedule conversion mismatch")

  const fixedNow = new Date(`${shiftDate(contractDate, 1)}T12:00:00.000Z`)
  const scheduler = startDailySummaryScheduler({
    enabled: true,
    timeZone: "UTC",
    localTime: "23:59",
    archive: false,
    now: () => fixedNow,
  })
  await scheduler.runNow()
  const runningSnapshot = getDailySummarySchedulerSnapshot()
  assert(runningSnapshot.status === "idle", "successful scheduler run must return to idle")
  assert(runningSnapshot.lastCompletedDate === contractDate, "scheduler must close the previous local date")
  assert(typeof runningSnapshot.nextRunAt === "string", "scheduler must expose its next run time")
  scheduler.stop()
  assert(getDailySummarySchedulerSnapshot().status === "stopped", "scheduler stop state mismatch")

  rmSync(vaultPath, { recursive: true, force: true })
  const failingNow = new Date(`${shiftDate(concurrentDate, 1)}T12:00:00.000Z`)
  const failingScheduler = startDailySummaryScheduler({
    enabled: true,
    timeZone: "UTC",
    localTime: "23:59",
    archive: true,
    now: () => failingNow,
    retryBaseMs: 60_000,
  })
  await failingScheduler.runNow()
  const failedSnapshot = getDailySummarySchedulerSnapshot()
  assert(failedSnapshot.status === "failed", "archive failure must mark scheduler failed")
  assert(failedSnapshot.targetDate === concurrentDate, "retry must retain the failed target date")
  assert(failedSnapshot.failureCount === 1, "first scheduler failure count mismatch")
  assert(typeof failedSnapshot.nextRunAt === "string", "failed scheduler must schedule a retry")
  assert(failedSnapshot.runs.failed >= 1, "failed scheduler run must be persisted")
  failingScheduler.stop()

  ensureDailySummaryRun(recoveryDate, false)
  const interrupted = beginDailySummaryRun(recoveryDate)
  assert(interrupted?.status === "running", "recovery fixture must start as running")
  const recoveryNow = new Date(`${shiftDate(contractDate, 1)}T13:00:00.000Z`)
  const recoveryScheduler = startDailySummaryScheduler({
    enabled: true,
    timeZone: "UTC",
    localTime: "23:59",
    archive: false,
    now: () => recoveryNow,
  })
  await recoveryScheduler.runNow()
  const recoveredRun = getDailySummaryRun(recoveryDate)
  assert(recoveredRun?.status === "succeeded", "interrupted run must resume after scheduler restart")
  assert(recoveredRun.attempt_count === 2, "recovered run must use a new attempt")
  assert(typeof getDailySummary(recoveryDate).finalizedAt === "string", "recovered run must finalize its Daily Note")
  await recoveryScheduler.runNow()
  const reconfiguredArchiveRun = getDailySummaryRun(concurrentDate)
  assert(reconfiguredArchiveRun?.status === "succeeded", "disabling archive must release an old archive failure")
  assert(reconfiguredArchiveRun.archive_requested === 0, "incomplete run must adopt the current archive setting")
  recoveryScheduler.stop()

  console.log("daily summary scheduler contract ok")
} finally {
  cleanup()
  rmSync(vaultPath, { recursive: true, force: true })
}

function seedSourceEvent(date: string, text: string): void {
  insertEvent({
    source: "web",
    type: "message",
    payload: { text },
    timestamp: `${date}T12:00:00.000Z`,
    metadata: {},
  })
}

function summaryEventCount(date: string): number {
  return Number(queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM events WHERE type = 'summary_ready' AND json_extract(payload, '$.date') = ?",
    [date],
  )?.count ?? 0)
}

function cleanup(): void {
  run("DELETE FROM daily_summary_runs WHERE date IN (?, ?, ?)", [contractDate, concurrentDate, recoveryDate])
  run("DELETE FROM daily_notes WHERE date IN (?, ?, ?)", [contractDate, concurrentDate, recoveryDate])
  run("DELETE FROM events WHERE payload LIKE ? OR json_extract(payload, '$.date') IN (?, ?, ?)", [
    `%${contractTag}%`,
    contractDate,
    concurrentDate,
    recoveryDate,
  ])
}

function createContractDate(seed: number): string {
  const year = 2060 + seed % 10
  const month = 1 + Math.floor(seed / 10) % 12
  const day = 2 + Math.floor(seed / 120) % 26
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
