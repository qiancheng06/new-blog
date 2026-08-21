import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"

export type AnalysisJobStatus = "pending" | "running" | "succeeded" | "failed"
export type AnalysisJobErrorCode = "" | "analysis_error" | "memory_error" | "interrupted"

export interface AnalysisJobRow {
  id: string
  source_event_id: string
  status: AnalysisJobStatus
  attempt_count: number
  error_code: AnalysisJobErrorCode
  retry_event_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export interface AnalysisJobListOptions {
  status?: AnalysisJobStatus
  limit?: number
  offset?: number
}

export interface AnalysisJobStats {
  pending: number
  running: number
  succeeded: number
  failed: number
}

export function ensureAnalysisJob(sourceEventId: string): AnalysisJobRow {
  const id = randomUUID()
  run(
    `INSERT INTO analysis_jobs (id, source_event_id)
     VALUES (?, ?)
     ON CONFLICT(source_event_id) DO NOTHING`,
    [id, sourceEventId],
  )
  return getAnalysisJobBySourceEventId(sourceEventId)!
}

export function getAnalysisJobById(id: string): AnalysisJobRow | null {
  return queryOne<AnalysisJobRow>("SELECT * FROM analysis_jobs WHERE id = ?", [id])
}

export function getAnalysisJobBySourceEventId(sourceEventId: string): AnalysisJobRow | null {
  return queryOne<AnalysisJobRow>("SELECT * FROM analysis_jobs WHERE source_event_id = ?", [sourceEventId])
}

export function listAnalysisJobs(options: AnalysisJobListOptions = {}): AnalysisJobRow[] {
  const where = options.status ? "WHERE status = ?" : ""
  const params: unknown[] = options.status ? [options.status] : []
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))
  return query<AnalysisJobRow>(
    `SELECT * FROM analysis_jobs
     ${where}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    params,
  )
}

export function getAnalysisJobStats(): AnalysisJobStats {
  const stats: AnalysisJobStats = { pending: 0, running: 0, succeeded: 0, failed: 0 }
  for (const row of query<{ status: AnalysisJobStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM analysis_jobs GROUP BY status",
  )) {
    stats[row.status] = Number(row.count)
  }
  return stats
}

export function beginAnalysisJobAttempt(id: string): AnalysisJobRow | null {
  const result = run(
    `UPDATE analysis_jobs
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error_code = '',
         started_at = datetime('now'),
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    [id],
  )
  return result.changes === 1 ? getAnalysisJobById(id) : null
}

export function markAnalysisJobSucceeded(id: string, attemptCount: number): AnalysisJobRow | null {
  const result = run(
    `UPDATE analysis_jobs
     SET status = 'succeeded',
         error_code = '',
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ? AND status = 'running' AND attempt_count = ?`,
    [id, attemptCount],
  )
  return result.changes === 1 ? getAnalysisJobById(id) : null
}

export function markAnalysisJobFailed(
  id: string,
  attemptCount: number,
  errorCode: Exclude<AnalysisJobErrorCode, "">,
): AnalysisJobRow | null {
  const result = run(
    `UPDATE analysis_jobs
     SET status = 'failed',
         error_code = ?,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ? AND status = 'running' AND attempt_count = ?`,
    [errorCode, id, attemptCount],
  )
  return result.changes === 1 ? getAnalysisJobById(id) : null
}

export function requestAnalysisJobRetry(id: string, retryEventId: string): AnalysisJobRow | null {
  const result = run(
    `UPDATE analysis_jobs
     SET status = 'pending',
         error_code = '',
         retry_event_id = ?,
         started_at = NULL,
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'failed'`,
    [retryEventId, id],
  )
  return result.changes === 1 ? getAnalysisJobById(id) : null
}

export function recoverInterruptedAnalysisJobs(): number {
  const result = run(
    `UPDATE analysis_jobs
     SET status = 'failed',
         error_code = 'interrupted',
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE status IN ('pending', 'running')`,
  )
  return result.changes
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
