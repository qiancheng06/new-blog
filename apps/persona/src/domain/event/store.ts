import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"
import type { Event } from "./types.js"

export interface EventRow {
  id: string
  source: string
  type: string
  payload: string
  timestamp: string
  metadata: string
  created_at: string
}

export interface EventInsertResult {
  event: EventRow
  inserted: boolean
}

export class EventIdentityConflictError extends Error {}

export function insertEvent(event: Event): EventRow {
  const id = event.id || randomUUID()
  run(
    `INSERT INTO events (id, source, type, payload, "timestamp", metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, event.source, event.type, JSON.stringify(event.payload), event.timestamp, JSON.stringify(event.metadata)]
  )
  return queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [id])!
}

export function insertEventOnce(event: Event): EventInsertResult {
  const id = event.id || randomUUID()
  const payload = JSON.stringify(event.payload)
  const metadata = JSON.stringify(event.metadata)
  const existingExternalEvent = findExistingExternalEvent(event)
  if (existingExternalEvent) {
    assertIdentityContent(existingExternalEvent, event.source, event.type, payload)
    return { event: existingExternalEvent, inserted: false }
  }
  const result = run(
    `INSERT INTO events (id, source, type, payload, "timestamp", metadata)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [id, event.source, event.type, payload, event.timestamp, metadata],
  )
  const saved = queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [id])
  if (!saved) throw new Error("event insert did not produce a stored row")
  if (result.changes === 0) assertIdentityContent(saved, event.source, event.type, payload)
  return { event: saved, inserted: result.changes === 1 }
}

export function getRecentEvents(limit = 50, offset = 0): EventRow[] {
  return query<EventRow>(
    `SELECT * FROM events ORDER BY "timestamp" DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  )
}

export function getEventsBySource(source: string, limit = 50): EventRow[] {
  return query<EventRow>(
    `SELECT * FROM events WHERE source = ? ORDER BY "timestamp" DESC LIMIT ?`,
    [source, limit]
  )
}

export function getEventsSince(since: string, limit = 100): EventRow[] {
  return query<EventRow>(
    `SELECT * FROM events WHERE "timestamp" >= ? ORDER BY "timestamp" ASC LIMIT ?`,
    [since, limit]
  )
}

export function getEventsBetween(start: string, end: string, limit = 200): EventRow[] {
  return query<EventRow>(
    `SELECT * FROM events
     WHERE "timestamp" >= ? AND "timestamp" < ?
     ORDER BY "timestamp" ASC
     LIMIT ?`,
    [start, end, limit]
  )
}

export function countEventsToday(): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM events WHERE date(created_at) = date('now')`
  )
  return row ? Number(row.count) : 0
}

function findExistingExternalEvent(event: Event): EventRow | null {
  if (event.source !== "telegram") return null
  const chatId = event.payload.chat_id
  const messageId = event.payload.message_id
  if (typeof chatId !== "number" || typeof messageId !== "number") return null
  return queryOne<EventRow>(
    `SELECT * FROM events
     WHERE source = 'telegram'
       AND json_extract(payload, '$.chat_id') = ?
       AND json_extract(payload, '$.message_id') = ?
     ORDER BY created_at ASC
     LIMIT 1`,
    [chatId, messageId],
  )
}

function assertIdentityContent(row: EventRow, source: string, type: string, payload: string): void {
  if (row.source !== source || row.type !== type || row.payload !== payload) {
    throw new EventIdentityConflictError(`event identity conflict: ${row.id}`)
  }
}
