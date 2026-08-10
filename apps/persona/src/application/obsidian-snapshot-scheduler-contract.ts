import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const contractDate = createContractDate(Date.now())
const failedDate = shiftDate(contractDate, 1)
const recoveryDate = shiftDate(contractDate, -1)
const vaultPath = mkdtempSync(join(tmpdir(), "persona-snapshot-scheduler-"))

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""
process.env.PERSONA_TIME_ZONE = "UTC"
process.env.OBSIDIAN_VAULT_PATH = vaultPath
process.env.PERSONA_OBSIDIAN_SNAPSHOT_DIR = "persona/snapshots"
process.env.PERSONA_OBSIDIAN_SNAPSHOT_ENABLED = "false"

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const {
  beginPersonaSnapshotRun,
  ensurePersonaSnapshotRun,
  getPersonaSnapshotRun,
} = await import("../domain/persona-snapshot-run/store.js")
const { PersonaSnapshotArchiveUnavailableError } = await import("./obsidian-snapshot.js")
const {
  getLatestScheduledDate,
  getPersonaSnapshotSchedulerSnapshot,
  startPersonaSnapshotScheduler,
} = await import("./obsidian-snapshot-scheduler.js")

initializeDb()

try {
  assert(
    getLatestScheduledDate(new Date("2026-07-18T16:10:00.000Z"), "00:15", "Asia/Shanghai") === "2026-07-18",
    "before-schedule startup must target the previous local schedule date",
  )
  assert(
    getLatestScheduledDate(new Date("2026-07-18T16:20:00.000Z"), "00:15", "Asia/Shanghai") === "2026-07-19",
    "after-schedule startup must target the current local schedule date",
  )

  const fixedNow = new Date(`${contractDate}T12:00:00.000Z`)
  const scheduler = startPersonaSnapshotScheduler({
    enabled: true,
    timeZone: "UTC",
    localTime: "00:15",
    now: () => fixedNow,
  })
  await Promise.all([scheduler.runNow(), scheduler.runNow()])

  const succeeded = getPersonaSnapshotRun(contractDate)
  assert(succeeded?.status === "succeeded", "scheduled Snapshot run must succeed")
  assert(succeeded.attempt_count === 1, "same-date concurrent calls must share one attempt")
  assert(typeof succeeded.snapshot_event_id === "string", "successful run must retain its audit Event")
  assert(snapshotEventType(succeeded.snapshot_event_id) === "persona_snapshot_exported", "run audit Event mismatch")
  const successSnapshot = getPersonaSnapshotSchedulerSnapshot()
  assert(successSnapshot.status === "idle", "successful scheduler run must return to idle")
  assert(successSnapshot.lastCompletedDate === contractDate, "successful scheduler date mismatch")
  assert(typeof successSnapshot.nextRunAt === "string", "successful scheduler must expose next run time")

  await scheduler.runNow()
  assert(
    getPersonaSnapshotRun(contractDate)?.attempt_count === 1,
    "completed schedule date must remain idempotent",
  )
  scheduler.stop()
  assert(getPersonaSnapshotSchedulerSnapshot().status === "stopped", "scheduler stop state mismatch")

  const failingNow = new Date(`${failedDate}T12:00:00.000Z`)
  const failingScheduler = startPersonaSnapshotScheduler({
    enabled: true,
    timeZone: "UTC",
    localTime: "00:15",
    now: () => failingNow,
    retryBaseMs: 60_000,
    archiveSnapshot: () => {
      throw new PersonaSnapshotArchiveUnavailableError("contract archive unavailable")
    },
  })
  await failingScheduler.runNow()
  const failed = getPersonaSnapshotRun(failedDate)
  assert(failed?.status === "failed", "archive failure must persist a failed run")
  assert(failed.error_code === "archive_unavailable", "archive failure classification mismatch")
  assert(failed.attempt_count === 1, "first failed attempt count mismatch")
  const failedSnapshot = getPersonaSnapshotSchedulerSnapshot()
  assert(failedSnapshot.status === "failed", "archive failure must mark scheduler failed")
  assert(failedSnapshot.targetDate === failedDate, "retry must retain its target date")
  assert(failedSnapshot.failureCount === 1, "first scheduler failure count mismatch")
  assert(typeof failedSnapshot.nextRunAt === "string", "failed scheduler must schedule a retry")
  failingScheduler.stop()
  run("DELETE FROM persona_snapshot_runs WHERE date = ?", [failedDate])

  ensurePersonaSnapshotRun(recoveryDate)
  const interrupted = beginPersonaSnapshotRun(recoveryDate)
  assert(interrupted?.status === "running", "recovery fixture must start as running")
  const recoveryScheduler = startPersonaSnapshotScheduler({
    enabled: true,
    timeZone: "UTC",
    localTime: "00:15",
    now: () => fixedNow,
  })
  await recoveryScheduler.runNow()
  const recovered = getPersonaSnapshotRun(recoveryDate)
  assert(recovered?.status === "succeeded", "interrupted Snapshot run must recover")
  assert(recovered.attempt_count === 2, "recovered Snapshot run must use a new attempt")
  assert(typeof recovered.snapshot_event_id === "string", "recovered run must retain its audit Event")
  recoveryScheduler.stop()

  console.log("obsidian snapshot scheduler contract ok")
} finally {
  cleanup()
  rmSync(vaultPath, { recursive: true, force: true })
}

function snapshotEventType(eventId: string): string | null {
  return queryOne<{ type: string }>("SELECT type FROM events WHERE id = ?", [eventId])?.type ?? null
}

function cleanup(): void {
  const eventIds = [contractDate, failedDate, recoveryDate]
    .map((date) => getPersonaSnapshotRun(date)?.snapshot_event_id)
    .filter((value): value is string => typeof value === "string")
  run("DELETE FROM persona_snapshot_runs WHERE date IN (?, ?, ?)", [contractDate, failedDate, recoveryDate])
  for (const eventId of eventIds) run("DELETE FROM events WHERE id = ?", [eventId])
}

function createContractDate(seed: number): string {
  const year = 2080 + seed % 10
  const month = seed % 12 + 1
  const day = seed % 20 + 1
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
