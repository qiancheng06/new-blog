import { query, queryOne, run } from "../../infra/db/pool.js"

export type PersonaSnapshotRunStatus = "pending" | "running" | "succeeded" | "failed"
export type PersonaSnapshotRunErrorCode =
  | ""
  | "archive_error"
  | "archive_unavailable"
  | "archive_conflict"
  | "state_error"
  | "interrupted"

export interface PersonaSnapshotRunRow {
  date: string
  status: PersonaSnapshotRunStatus
  attempt_count: number
  error_code: PersonaSnapshotRunErrorCode
  snapshot_event_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export interface PersonaSnapshotRunStats {
  pending: number
  running: number
  succeeded: number
  failed: number
}

export function ensurePersonaSnapshotRun(date: string): PersonaSnapshotRunRow {
  run(
    `INSERT INTO persona_snapshot_runs (date)
     VALUES (?)
     ON CONFLICT(date) DO NOTHING`,
    [date],
  )
  return getPersonaSnapshotRun(date)!
}

export function getPersonaSnapshotRun(date: string): PersonaSnapshotRunRow | null {
  return queryOne<PersonaSnapshotRunRow>("SELECT * FROM persona_snapshot_runs WHERE date = ?", [date])
}

export function getNextIncompletePersonaSnapshotRun(): PersonaSnapshotRunRow | null {
  return queryOne<PersonaSnapshotRunRow>(
    `SELECT * FROM persona_snapshot_runs
     WHERE status IN ('pending', 'failed')
     ORDER BY date ASC
     LIMIT 1`,
  )
}

export function beginPersonaSnapshotRun(date: string): PersonaSnapshotRunRow | null {
  const result = run(
    `UPDATE persona_snapshot_runs
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error_code = '',
         snapshot_event_id = NULL,
         started_at = datetime('now'),
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE date = ? AND status IN ('pending', 'failed')`,
    [date],
  )
  return result.changes > 0 ? getPersonaSnapshotRun(date) : null
}

export function markPersonaSnapshotRunSucceeded(
  date: string,
  attemptCount: number,
  snapshotEventId: string,
): boolean {
  const result = run(
    `UPDATE persona_snapshot_runs
     SET status = 'succeeded',
         error_code = '',
         snapshot_event_id = ?,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE date = ? AND status = 'running' AND attempt_count = ?`,
    [snapshotEventId, date, attemptCount],
  )
  return result.changes > 0
}

export function markPersonaSnapshotRunFailed(
  date: string,
  attemptCount: number,
  errorCode: Exclude<PersonaSnapshotRunErrorCode, "">,
): boolean {
  const result = run(
    `UPDATE persona_snapshot_runs
     SET status = 'failed',
         error_code = ?,
         snapshot_event_id = NULL,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE date = ? AND status = 'running' AND attempt_count = ?`,
    [errorCode, date, attemptCount],
  )
  return result.changes > 0
}

export function recoverInterruptedPersonaSnapshotRuns(): number {
  const result = run(
    `UPDATE persona_snapshot_runs
     SET status = 'failed',
         error_code = 'interrupted',
         snapshot_event_id = NULL,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE status = 'running'`,
  )
  return result.changes
}

export function getPersonaSnapshotRunStats(): PersonaSnapshotRunStats {
  const stats: PersonaSnapshotRunStats = { pending: 0, running: 0, succeeded: 0, failed: 0 }
  for (const row of query<{ status: PersonaSnapshotRunStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM persona_snapshot_runs GROUP BY status",
  )) {
    stats[row.status] = Number(row.count)
  }
  return stats
}
