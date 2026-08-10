import {
  getEventFeedRecordById,
  listEventFeedRecords,
  type EventFeedRecord,
} from "../domain/event/feed.js"
import { EventSource, type EventSource as EventSourceValue } from "../domain/event/types.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MAX_QUERY_LENGTH = 500
const EVENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

export interface EventFeedPage {
  items: EventFeedRecord[]
  events: EventFeedRecord[]
  limit: number
  offset: number
}

export class EventFeedValidationError extends Error {}
export class EventFeedNotFoundError extends Error {}

export function getEventFeed(options: {
  source?: EventSourceValue
  type?: string
  query?: string
  since?: string
  before?: string
  limit?: number
  offset?: number
} = {}): EventFeedPage {
  const limit = clampLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  const type = normalizeEventType(options.type)
  const query = normalizeQuery(options.query)
  const since = normalizeTimestamp(options.since, "since")
  const before = normalizeTimestamp(options.before, "before")
  if (since && before && since >= before) {
    throw new EventFeedValidationError("event time range is invalid")
  }
  const items = listEventFeedRecords({
    source: options.source,
    type,
    query,
    since,
    before,
    limit,
    offset,
  })
  return { items, events: items, limit, offset }
}

export function getEventFeedItem(idValue: string): EventFeedRecord {
  const id = idValue.trim()
  if (!id) throw new EventFeedValidationError("event id is required")
  const event = getEventFeedRecordById(id)
  if (!event) throw new EventFeedNotFoundError("event not found")
  return event
}

export function parseEventFeedSource(value: string | undefined): EventSourceValue | undefined {
  if (value === undefined || value === "all") return undefined
  const parsed = EventSource.safeParse(value)
  if (!parsed.success) throw new EventFeedValidationError("event source is invalid")
  return parsed.data
}

function normalizeEventType(value: string | undefined): string | undefined {
  const type = value?.trim()
  if (!type || type === "all") return undefined
  if (!EVENT_TYPE_PATTERN.test(type)) throw new EventFeedValidationError("event type is invalid")
  return type
}

function normalizeQuery(value: string | undefined): string | undefined {
  const query = value?.trim()
  if (!query) return undefined
  if (query.length > MAX_QUERY_LENGTH) throw new EventFeedValidationError("event query is too long")
  return query
}

function normalizeTimestamp(value: string | undefined, field: "since" | "before"): string | undefined {
  const timestamp = value?.trim()
  if (!timestamp) return undefined
  const milliseconds = Date.parse(timestamp)
  if (!Number.isFinite(milliseconds)) throw new EventFeedValidationError(`${field} timestamp is invalid`)
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
