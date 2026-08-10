import { query, queryOne } from "../../infra/db/pool.js"
import type { ConversationJobErrorCode, ConversationJobStatus } from "./store.js"

export type ConversationHistorySource = "telegram" | "web"

interface ConversationHistoryRow {
  id: string
  source_event_id: string
  reply_event_id: string | null
  status: ConversationJobStatus
  error_code: ConversationJobErrorCode
  created_at: string
  updated_at: string
  input_source: ConversationHistorySource
  input_payload: string
  input_metadata: string
  input_timestamp: string
  reply_payload: string | null
  reply_metadata: string | null
  reply_timestamp: string | null
}

export interface ConversationHistoryRecord {
  id: string
  sourceEventId: string
  replyEventId: string | null
  source: ConversationHistorySource
  status: ConversationJobStatus
  errorCode: Exclude<ConversationJobErrorCode, ""> | null
  userText: string | null
  assistantText: string | null
  timestamp: string
  replyTimestamp: string | null
  createdAt: string
  updatedAt: string
}

export interface ConversationHistoryListOptions {
  source?: ConversationHistorySource
  status?: ConversationJobStatus
  query?: string
  since?: string
  before?: string
  limit?: number
  offset?: number
}

const HISTORY_SELECT = `
  SELECT
    job.id,
    job.source_event_id,
    job.reply_event_id,
    job.status,
    job.error_code,
    job.created_at,
    job.updated_at,
    input.source AS input_source,
    input.payload AS input_payload,
    input.metadata AS input_metadata,
    input.timestamp AS input_timestamp,
    reply.payload AS reply_payload,
    reply.metadata AS reply_metadata,
    reply.timestamp AS reply_timestamp
  FROM conversation_jobs job
  JOIN events input ON input.id = job.source_event_id
  LEFT JOIN events reply
    ON reply.id = job.reply_event_id
   AND reply.source = 'system'
   AND reply.type = 'companion_reply'
`

export function getConversationHistoryRecordById(id: string): ConversationHistoryRecord | null {
  return toConversationHistoryRecord(queryOne<ConversationHistoryRow>(
    `${HISTORY_SELECT}
     WHERE job.id = ?
       AND input.source IN ('telegram', 'web')
       AND input.type = 'message'`,
    [id],
  ))
}

export function listConversationHistoryRecords(
  options: ConversationHistoryListOptions = {},
): ConversationHistoryRecord[] {
  const where = ["input.source IN ('telegram', 'web')", "input.type = 'message'"]
  const params: unknown[] = []
  if (options.source) {
    where.push("input.source = ?")
    params.push(options.source)
  }
  if (options.status) {
    where.push("job.status = ?")
    params.push(options.status)
  }
  if (options.query) {
    where.push(`instr(lower(${searchableConversationText()}), lower(?)) > 0`)
    params.push(options.query)
  }
  if (options.since) {
    where.push("input.timestamp >= ?")
    params.push(options.since)
  }
  if (options.before) {
    where.push("input.timestamp < ?")
    params.push(options.before)
  }
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))

  return query<ConversationHistoryRow>(
    `${HISTORY_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY input.timestamp DESC, job.created_at DESC, job.id DESC
     LIMIT ? OFFSET ?`,
    params,
  ).map((row) => toConversationHistoryRecord(row) as ConversationHistoryRecord)
}

function searchableConversationText(): string {
  return `${visibleTextSql("input.payload", "input.metadata")} || ' ' ||
    ${visibleTextSql("reply.payload", "reply.metadata")}`
}

function visibleTextSql(payload: string, metadata: string): string {
  return `CASE
    WHEN ${payload} IS NULL OR ${metadata} IS NULL THEN ''
    WHEN NOT json_valid(${metadata}) THEN ''
    WHEN json_type(${metadata}, '$.visibility') IS NOT NULL
      AND NOT (
        json_type(${metadata}, '$.visibility') = 'text'
        AND json_extract(${metadata}, '$.visibility') = 'user'
      ) THEN ''
    WHEN json_valid(${payload}) AND json_type(${payload}, '$.text') = 'text'
      THEN json_extract(${payload}, '$.text')
    ELSE '' END`
}

function toConversationHistoryRecord(row: ConversationHistoryRow | null): ConversationHistoryRecord | null {
  if (!row) return null
  return {
    id: row.id,
    sourceEventId: row.source_event_id,
    replyEventId: row.reply_event_id,
    source: row.input_source,
    status: row.status,
    errorCode: row.error_code || null,
    userText: readVisibleText(row.input_payload, row.input_metadata),
    assistantText: readVisibleText(row.reply_payload, row.reply_metadata),
    timestamp: row.input_timestamp,
    replyTimestamp: row.reply_timestamp,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function readVisibleText(payloadValue: string | null, metadataValue: string | null): string | null {
  if (payloadValue === null || metadataValue === null) return null
  const payload = parseObject(payloadValue)
  const metadata = parseObject(metadataValue)
  if (!payload || !isUserReadable(metadata) || typeof payload.text !== "string") return null
  return payload.text.trim().slice(0, 16_000)
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
