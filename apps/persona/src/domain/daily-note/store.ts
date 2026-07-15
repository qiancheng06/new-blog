import { query, queryOne, run } from "../../infra/db/pool.js"

export interface DailyNoteRow {
  id: string
  date: string
  summary: string
  highlights: string
  topic_distribution: string
  source_event_id: string | null
  created_at: string
  updated_at: string
}

export interface DailyNoteWrite {
  id: string
  date: string
  summary: string
  highlights: string[]
  topicDistribution: Record<string, number>
  sourceEventId: string
}

export interface DailyNoteListOptions {
  limit?: number
  offset?: number
}

export function getDailyNoteByDate(date: string): DailyNoteRow | null {
  return queryOne<DailyNoteRow>("SELECT * FROM daily_notes WHERE date = ?", [date])
}

export function listDailyNotes(options: DailyNoteListOptions = {}): DailyNoteRow[] {
  return query<DailyNoteRow>(
    `SELECT * FROM daily_notes
     ORDER BY date DESC
     LIMIT ? OFFSET ?`,
    [normalizeLimit(options.limit ?? 30), normalizeOffset(options.offset ?? 0)]
  )
}

export function upsertDailyNote(note: DailyNoteWrite): DailyNoteRow {
  run(
    `INSERT INTO daily_notes (
       id, date, summary, highlights, topic_distribution, source_event_id, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       summary = excluded.summary,
       highlights = excluded.highlights,
       topic_distribution = excluded.topic_distribution,
       source_event_id = excluded.source_event_id,
       updated_at = datetime('now')`,
    [
      note.id,
      note.date,
      note.summary,
      JSON.stringify(note.highlights),
      JSON.stringify(note.topicDistribution),
      note.sourceEventId,
    ]
  )
  return getDailyNoteByDate(note.date)!
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
