import {
  getConversationHistoryRecordById,
  listConversationHistoryRecords,
  type ConversationHistoryRecord,
  type ConversationHistorySource,
} from "../domain/conversation-job/history.js"
import type { ConversationJobStatus } from "../domain/conversation-job/store.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MAX_QUERY_LENGTH = 500

export interface ConversationHistoryPage {
  items: ConversationHistoryRecord[]
  limit: number
  offset: number
}

export class ConversationHistoryValidationError extends Error {}
export class ConversationHistoryNotFoundError extends Error {}

export function getConversationHistory(options: {
  source?: ConversationHistorySource
  status?: ConversationJobStatus
  query?: string
  since?: string
  before?: string
  limit?: number
  offset?: number
} = {}): ConversationHistoryPage {
  const limit = clampLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  const query = normalizeQuery(options.query)
  const since = normalizeTimestamp(options.since, "since")
  const before = normalizeTimestamp(options.before, "before")
  if (since && before && since >= before) {
    throw new ConversationHistoryValidationError("conversation time range is invalid")
  }
  return {
    items: listConversationHistoryRecords({
      source: options.source,
      status: options.status,
      query,
      since,
      before,
      limit,
      offset,
    }),
    limit,
    offset,
  }
}

export function getConversationHistoryItem(idValue: string): ConversationHistoryRecord {
  const id = idValue.trim()
  if (!id) throw new ConversationHistoryValidationError("conversation id is required")
  const conversation = getConversationHistoryRecordById(id)
  if (!conversation) throw new ConversationHistoryNotFoundError("conversation not found")
  return conversation
}

export function parseConversationHistorySource(
  value: string | undefined,
): ConversationHistorySource | undefined {
  if (value === undefined || value === "all") return undefined
  if (value !== "telegram" && value !== "web") {
    throw new ConversationHistoryValidationError("conversation source is invalid")
  }
  return value
}

export function parseConversationHistoryStatus(value: string | undefined): ConversationJobStatus | undefined {
  if (value === undefined || value === "all") return undefined
  if (value !== "pending" && value !== "running" && value !== "succeeded" && value !== "failed") {
    throw new ConversationHistoryValidationError("conversation status is invalid")
  }
  return value
}

function normalizeQuery(value: string | undefined): string | undefined {
  const query = value?.trim()
  if (!query) return undefined
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ConversationHistoryValidationError("conversation query is too long")
  }
  return query
}

function normalizeTimestamp(value: string | undefined, field: "since" | "before"): string | undefined {
  const timestamp = value?.trim()
  if (!timestamp) return undefined
  const milliseconds = Date.parse(timestamp)
  if (!Number.isFinite(milliseconds)) {
    throw new ConversationHistoryValidationError(`${field} timestamp is invalid`)
  }
  return new Date(milliseconds).toISOString()
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
