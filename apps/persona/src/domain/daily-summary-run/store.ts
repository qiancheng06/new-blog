import { query, queryOne, run } from "../../infra/db/pool.js"

export type DailySummaryRunStatus = "pending" | "running" | "succeeded" | "failed"
export type DailySummaryRunErrorCode = "" | "generation_error" | "archive_error" | "state_error" | "interrupted"

export interface DailySummaryRunRow {
  date: string
  status: DailySummaryRunStatus
  attempt_count: number
  error_code: DailySummaryRunErrorCode
  archive_requested: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export interface DailySummaryRunStats {
  pending: number
  running: number
  succeeded: number
  failed: number
}

export function ensureDailySummaryRun(date: string, archiveRequested: boolean): DailySummaryRunRow {
  run(
    `INSERT INTO daily_summary_runs (date, archive_requested)
     VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET
       archive_requested = excluded.archive_requested,
       updated_at = datetime('now')`,
    [date, archiveRequested ? 1 : 0],
  )

  run(
    `UPDATE daily_summary_runs
     SET status = 'pending',
         error_code = '',
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE date = ?
       AND status = 'succeeded'
       AND (
         NOT EXISTS (
           SELECT 1 FROM daily_notes
           WHERE daily_notes.date = daily_summary_runs.date
             AND daily_notes.finalized_at IS NOT NULL
         )
         OR (
           archive_requested = 1
           AND NOT EXISTS (
             SELECT 1 FROM daily_notes
             WHERE daily_notes.date = daily_summary_runs.date
               AND daily_notes.archive_event_id IS NOT NULL
           )
         )
       )`,
    [date],
  )
  return getDailySummaryRun(date)!
}

export function getDailySummaryRun(date: string): DailySummaryRunRow | null {
  return queryOne<DailySummaryRunRow>("SELECT * FROM daily_summary_runs WHERE date = ?", [date])
}

export function configureIncompleteDailySummaryRuns(archiveRequested: boolean): void {
  run(
    `UPDATE daily_summary_runs
     SET archive_requested = ?,
         updated_at = datetime('now')
     WHERE status IN ('pending', 'failed')`,
    [archiveRequested ? 1 : 0],
  )
}

export function getNextIncompleteDailySummaryRun(): DailySummaryRunRow | null {
  return queryOne<DailySummaryRunRow>(
    `SELECT * FROM daily_summary_runs
     WHERE status IN ('pending', 'failed')
     ORDER BY date ASC
     LIMIT 1`,
  )
}

export function beginDailySummaryRun(date: string): DailySummaryRunRow | null {
  const result = run(
    `UPDATE daily_summary_runs
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error_code = '',
         started_at = datetime('now'),
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE date = ? AND status IN ('pending', 'failed')`,
    [date],
  )
  return result.changes > 0 ? getDailySummaryRun(date) : null
}

export function markDailySummaryRunSucceeded(date: string, attemptCount: number): boolean {
  const result = run(
    `UPDATE daily_summary_runs
     SET status = 'succeeded',
         error_code = '',
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE date = ? AND status = 'running' AND attempt_count = ?`,
    [date, attemptCount],
  )
  return result.changes > 0
}

export function markDailySummaryRunFailed(
  date: string,
  attemptCount: number,
  errorCode: Exclude<DailySummaryRunErrorCode, "">,
): boolean {
  const result = run(
    `UPDATE daily_summary_runs
     SET status = 'failed',
         error_code = ?,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE date = ? AND status = 'running' AND attempt_count = ?`,
    [errorCode, date, attemptCount],
  )
  return result.changes > 0
}

export function recoverInterruptedDailySummaryRuns(): number {
  const result = run(
    `UPDATE daily_summary_runs
     SET status = 'failed',
         error_code = 'interrupted',
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE status = 'running'`,
  )
  return result.changes
}

export function getDailySummaryRunStats(): DailySummaryRunStats {
  const stats: DailySummaryRunStats = { pending: 0, running: 0, succeeded: 0, failed: 0 }
  for (const row of query<{ status: DailySummaryRunStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM daily_summary_runs GROUP BY status",
  )) {
    stats[row.status] = Number(row.count)
  }
  return stats
}
