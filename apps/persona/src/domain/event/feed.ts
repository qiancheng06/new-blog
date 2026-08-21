import { query, queryOne } from "../../infra/db/pool.js"
import type { EventSource } from "./types.js"

interface EventFeedRow {
  id: string
  source: EventSource
  type: string
  payload: string
  metadata: string
  timestamp: string
  created_at: string
}

export interface EventFeedRecord {
  id: string
  source: EventSource
  type: string
  timestamp: string
  createdAt: string
  preview: string
  purpose: string | null
  visibility: string | null
}

export interface EventFeedListOptions {
  source?: EventSource
  type?: string
  query?: string
  since?: string
  before?: string
  limit?: number
  offset?: number
}

export function getEventFeedRecordById(id: string): EventFeedRecord | null {
  return toEventFeedRecord(queryOne<EventFeedRow>(
    `SELECT id, source, type, payload, metadata, timestamp, created_at
     FROM events
     WHERE id = ? AND source IN ('telegram', 'system', 'web')`,
    [id],
  ))
}

export function listEventFeedRecords(options: EventFeedListOptions = {}): EventFeedRecord[] {
  const where = ["source IN ('telegram', 'system', 'web')"]
  const params: unknown[] = []
  if (options.source) {
    where.push("source = ?")
    params.push(options.source)
  }
  if (options.type) {
    where.push("type = ?")
    params.push(options.type)
  }
  if (options.query) {
    where.push(`instr(lower(${searchablePayloadText()}), lower(?)) > 0`)
    params.push(options.query)
  }
  if (options.since) {
    where.push("timestamp >= ?")
    params.push(options.since)
  }
  if (options.before) {
    where.push("timestamp < ?")
    params.push(options.before)
  }
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))

  return query<EventFeedRow>(
    `SELECT id, source, type, payload, metadata, timestamp, created_at
     FROM events
     WHERE ${where.join(" AND ")}
     ORDER BY timestamp DESC, created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    params,
  ).map((row) => toEventFeedRecord(row) as EventFeedRecord)
}

function searchablePayloadText(): string {
  return `CASE
    WHEN NOT json_valid(metadata) THEN ''
    WHEN json_type(metadata, '$.visibility') IS NOT NULL
      AND NOT (
        json_type(metadata, '$.visibility') = 'text'
        AND json_extract(metadata, '$.visibility') = 'user'
      ) THEN ''
    WHEN json_valid(payload) THEN
    COALESCE(CAST(json_extract(payload, '$.text') AS TEXT), '') || ' ' ||
    COALESCE(CAST(json_extract(payload, '$.summary') AS TEXT), '') || ' ' ||
    COALESCE(CAST(json_extract(payload, '$.reason') AS TEXT), '')
  ELSE '' END`
}

function toEventFeedRecord(row: EventFeedRow | null): EventFeedRecord | null {
  if (!row) return null
  const payload = parseObject(row.payload) ?? {}
  const metadata = parseObject(row.metadata)
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    timestamp: row.timestamp,
    createdAt: row.created_at,
    preview: isUserReadable(metadata) ? buildPreview(payload) : "",
    purpose: readBoundedLabel(metadata?.purpose),
    visibility: readBoundedLabel(metadata?.visibility),
  }
}

function buildPreview(payload: Record<string, unknown>): string {
  for (const key of ["text", "summary", "reason"] as const) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim().replace(/\s+/g, " ").slice(0, 160)
    }
  }
  return ""
}

function readBoundedLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 64)
    : null
}

function isUserReadable(metadata: Record<string, unknown> | null): boolean {
  if (!metadata) return false
  if (!("visibility" in metadata)) return true
  return metadata.visibility === "user"
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
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
