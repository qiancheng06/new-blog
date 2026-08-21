import { query, queryOne } from "../../infra/db/pool.js"
import type { AnalysisJobStatus } from "../analysis-job/store.js"
import type { CaptureSource, CaptureType } from "./validation.js"

interface CaptureRow {
  id: string
  source: CaptureSource
  type: CaptureType
  payload: string
  timestamp: string
  created_at: string
  analysis_job_id: string | null
  analysis_status: AnalysisJobStatus | null
  analysis_error_code: string | null
}

export interface CaptureRecord {
  id: string
  source: CaptureSource
  type: CaptureType
  text: string
  timestamp: string
  createdAt: string
  analysis: {
    jobId: string
    status: AnalysisJobStatus
    errorCode: string | null
  } | null
}

export interface CaptureListOptions {
  type?: CaptureType
  source?: CaptureSource
  query?: string
  limit?: number
  offset?: number
}

export interface CaptureStats {
  notes: number
  ideas: number
  journals: number
}

export function getCaptureById(id: string): CaptureRecord | null {
  return toCaptureRecord(queryOne<CaptureRow>(
    `${captureSelect()}
     WHERE e.id = ?
       AND e.type IN ('note', 'idea', 'journal')
       AND e.source IN ('telegram', 'web')`,
    [id],
  ))
}

export function listCaptures(options: CaptureListOptions = {}): CaptureRecord[] {
  const where = [
    "e.type IN ('note', 'idea', 'journal')",
    "e.source IN ('telegram', 'web')",
  ]
  const params: unknown[] = []
  if (options.type) {
    where.push("e.type = ?")
    params.push(options.type)
  }
  if (options.source) {
    where.push("e.source = ?")
    params.push(options.source)
  }
  if (options.query) {
    where.push(
      "instr(lower(CASE WHEN json_valid(e.payload) THEN json_extract(e.payload, '$.text') ELSE '' END), lower(?)) > 0",
    )
    params.push(options.query)
  }
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))

  return query<CaptureRow>(
    `${captureSelect()}
     WHERE ${where.join(" AND ")}
     ORDER BY e.timestamp DESC, e.created_at DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    params,
  ).map((row) => toCaptureRecord(row) as CaptureRecord)
}

export function getCaptureStats(): CaptureStats {
  const stats: CaptureStats = { notes: 0, ideas: 0, journals: 0 }
  for (const row of query<{ type: CaptureType; count: number }>(
    `SELECT type, COUNT(*) AS count
     FROM events
     WHERE type IN ('note', 'idea', 'journal')
       AND source IN ('telegram', 'web')
     GROUP BY type`,
  )) {
    if (row.type === "note") stats.notes = Number(row.count)
    if (row.type === "idea") stats.ideas = Number(row.count)
    if (row.type === "journal") stats.journals = Number(row.count)
  }
  return stats
}

function captureSelect(): string {
  return `SELECT e.id, e.source, e.type, e.payload, e.timestamp, e.created_at,
                 a.id AS analysis_job_id, a.status AS analysis_status,
                 NULLIF(a.error_code, '') AS analysis_error_code
          FROM events e
          LEFT JOIN analysis_jobs a ON a.source_event_id = e.id`
}

function toCaptureRecord(row: CaptureRow | null): CaptureRecord | null {
  if (!row) return null
  const payload = parsePayload(row.payload)
  const text = typeof payload.text === "string" ? payload.text : ""
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    text,
    timestamp: row.timestamp,
    createdAt: row.created_at,
    analysis: row.analysis_job_id && row.analysis_status
      ? {
        jobId: row.analysis_job_id,
        status: row.analysis_status,
        errorCode: row.analysis_error_code,
      }
      : null,
  }
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 20
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
