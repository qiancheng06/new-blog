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

export function insertEvent(event: Event): EventRow {
  const id = event.id || randomUUID()
  run(
    `INSERT INTO events (id, source, type, payload, "timestamp", metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, event.source, event.type, JSON.stringify(event.payload), event.timestamp, JSON.stringify(event.metadata)]
  )
  return queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [id])!
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

export function countEventsToday(): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM events WHERE date(created_at) = date('now')`
  )
  return row ? Number(row.count) : 0
}
