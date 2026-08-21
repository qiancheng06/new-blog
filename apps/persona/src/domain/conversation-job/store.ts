import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"

export type ConversationJobStatus = "pending" | "running" | "succeeded" | "failed"
export type ConversationJobErrorCode = "" | "companion_error" | "reply_error" | "state_error" | "interrupted"

export interface ConversationJobRow {
  id: string
  source_event_id: string
  status: ConversationJobStatus
  attempt_count: number
  error_code: ConversationJobErrorCode
  reply_event_id: string | null
  retry_event_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export interface ConversationJobListOptions {
  status?: ConversationJobStatus
  limit?: number
  offset?: number
}

export interface ConversationJobStats {
  pending: number
  running: number
  succeeded: number
  failed: number
}

export function ensureConversationJob(sourceEventId: string): ConversationJobRow {
  const existing = getConversationJobBySourceEventId(sourceEventId)
  if (existing) return existing

  const reply = queryOne<{ id: string }>(
    `SELECT id FROM events
     WHERE source = 'system'
       AND type = 'companion_reply'
       AND json_extract(payload, '$.in_reply_to') = ?
     ORDER BY created_at ASC
     LIMIT 1`,
    [sourceEventId],
  )
  const id = randomUUID()
  run(
    `INSERT INTO conversation_jobs (
       id, source_event_id, status, reply_event_id, finished_at
     ) VALUES (?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE NULL END)
     ON CONFLICT(source_event_id) DO NOTHING`,
    [id, sourceEventId, reply ? "succeeded" : "pending", reply?.id ?? null, reply?.id ?? null],
  )
  return getConversationJobBySourceEventId(sourceEventId)!
}

export function getConversationJobById(id: string): ConversationJobRow | null {
  return queryOne<ConversationJobRow>("SELECT * FROM conversation_jobs WHERE id = ?", [id])
}

export function getConversationJobBySourceEventId(sourceEventId: string): ConversationJobRow | null {
  return queryOne<ConversationJobRow>("SELECT * FROM conversation_jobs WHERE source_event_id = ?", [sourceEventId])
}

export function listConversationJobs(options: ConversationJobListOptions = {}): ConversationJobRow[] {
  const where = options.status ? "WHERE status = ?" : ""
  const params: unknown[] = options.status ? [options.status] : []
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))
  return query<ConversationJobRow>(
    `SELECT * FROM conversation_jobs
     ${where}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    params,
  )
}

export function beginConversationJobAttempt(id: string): ConversationJobRow | null {
  const result = run(
    `UPDATE conversation_jobs
     SET status = 'running',
         attempt_count = attempt_count + 1,
         error_code = '',
         started_at = datetime('now'),
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    [id],
  )
  return result.changes > 0 ? getConversationJobById(id) : null
}

export function markConversationJobSucceeded(
  id: string,
  attemptCount: number,
  replyEventId: string,
): boolean {
  const result = run(
    `UPDATE conversation_jobs
     SET status = 'succeeded',
         error_code = '',
         reply_event_id = ?,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ? AND status = 'running' AND attempt_count = ?`,
    [replyEventId, id, attemptCount],
  )
  return result.changes > 0
}

export function markConversationJobFailed(
  id: string,
  attemptCount: number,
  errorCode: Exclude<ConversationJobErrorCode, "">,
): boolean {
  const result = run(
    `UPDATE conversation_jobs
     SET status = 'failed',
         error_code = ?,
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ? AND status = 'running' AND attempt_count = ?`,
    [errorCode, id, attemptCount],
  )
  return result.changes > 0
}

export function requestConversationJobRetry(id: string, retryEventId: string): ConversationJobRow | null {
  const result = run(
    `UPDATE conversation_jobs
     SET status = 'pending',
         error_code = '',
         retry_event_id = ?,
         finished_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'failed'`,
    [retryEventId, id],
  )
  return result.changes > 0 ? getConversationJobById(id) : null
}

export function recoverInterruptedConversationJobs(): number {
  const result = run(
    `UPDATE conversation_jobs
     SET status = 'failed',
         error_code = 'interrupted',
         finished_at = datetime('now'),
         updated_at = datetime('now')
     WHERE status IN ('pending', 'running')`,
  )
  return result.changes
}

export function getConversationJobStats(): ConversationJobStats {
  const stats: ConversationJobStats = { pending: 0, running: 0, succeeded: 0, failed: 0 }
  for (const row of query<{ status: ConversationJobStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM conversation_jobs GROUP BY status",
  )) {
    stats[row.status] = Number(row.count)
  }
  return stats
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
