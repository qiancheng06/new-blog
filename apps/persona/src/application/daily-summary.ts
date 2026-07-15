import { randomUUID } from "crypto"
import { DAILY_SUMMARY_PROMPT } from "../ai-runtime/prompts/daily-summary.js"
import { getEventsBetween, insertEvent, type EventRow } from "../domain/event/store.js"
import { createDailySummaryReadyEvent } from "../domain/event/types.js"
import {
  getDailyNoteByDate,
  listDailyNotes,
  upsertDailyNote,
  type DailyNoteListOptions,
  type DailyNoteRow,
} from "../domain/daily-note/store.js"
import { listMemoryTimelineEvents } from "../domain/memory/store.js"
import { config } from "../infra/config/index.js"
import { withTransaction } from "../infra/db/pool.js"
import { callDailySummary } from "../infra/llm/deepseek.js"

const DAILY_EVENT_LIMIT = 200
const SUMMARY_EVENT_TYPES = new Set(["message", "note", "todo", "idea", "journal", "companion_reply"])

export interface DailyNote {
  id: string
  date: string
  summary: string
  highlights: string[]
  topicDistribution: Record<string, number>
  sourceEventId: string | null
  createdAt: string
  updatedAt: string
}

export interface DailySummaryGenerationResult {
  note: DailyNote
  summaryEventId: string
  eventCount: number
}

export class DailySummaryValidationError extends Error {}

export class DailySummaryNotFoundError extends Error {}

export async function generateDailySummary(options: { date?: string } = {}): Promise<DailySummaryGenerationResult> {
  const date = resolveDailySummaryDate(options.date)
  const range = getUtcRangeForDate(date, config.timeZone)
  const dailyEvents = getEventsBetween(range.start, range.end, DAILY_EVENT_LIMIT)
    .filter(isSummarizableEvent)
    .map((event) => ({ event, text: readEventText(event) }))
    .filter((item) => item.text.length > 0)
  const timelineEvents = listMemoryTimelineEvents({ date, limit: 50 })
  const context = buildDailySummaryContext(dailyEvents, timelineEvents, config.timeZone)
  const summary = await callDailySummary(DAILY_SUMMARY_PROMPT, {
    date,
    eventCount: dailyEvents.length,
    context,
  })

  return withTransaction(() => {
    const noteId = getDailyNoteByDate(date)?.id ?? randomUUID()
    const summaryEvent = insertEvent(createDailySummaryReadyEvent({
      daily_note_id: noteId,
      date,
      event_count: dailyEvents.length,
    }))
    const note = upsertDailyNote({
      id: noteId,
      date,
      summary: summary.summary,
      highlights: summary.highlights,
      topicDistribution: summary.topic_distribution,
      sourceEventId: summaryEvent.id,
    })

    return {
      note: toDailyNote(note),
      summaryEventId: summaryEvent.id,
      eventCount: dailyEvents.length,
    }
  })
}

export function getDailySummary(date: string): DailyNote {
  const normalized = resolveDailySummaryDate(date)
  const note = getDailyNoteByDate(normalized)
  if (!note) throw new DailySummaryNotFoundError("daily summary not found")
  return toDailyNote(note)
}

export function getDailySummaries(options: DailyNoteListOptions = {}): DailyNote[] {
  return listDailyNotes(options).map(toDailyNote)
}

export function getCurrentDailySummaryDate(now = new Date(), timeZone = config.timeZone): string {
  const parts = readDateTimeParts(now, timeZone)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export function resolveDailySummaryDate(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return getCurrentDailySummaryDate()
  const date = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new DailySummaryValidationError("date must use YYYY-MM-DD")

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new DailySummaryValidationError("date must be a real calendar date")
  }
  return date
}

export function getUtcRangeForDate(date: string, timeZone: string): { start: string; end: string } {
  const normalized = resolveDailySummaryDate(date)
  const nextDate = addDays(normalized, 1)
  return {
    start: zonedMidnightToUtc(normalized, timeZone),
    end: zonedMidnightToUtc(nextDate, timeZone),
  }
}

function buildDailySummaryContext(
  events: Array<{ event: EventRow; text: string }>,
  timelineEvents: Array<{ type: string; summary: string }>,
  timeZone: string,
): string {
  const lines: string[] = []

  for (const { event, text } of events) {
    const role = event.type === "companion_reply" ? "Companion" : "User"
    const time = formatTime(event.timestamp, timeZone)
    lines.push(`[${time}] ${role} (${event.type}): ${text.slice(0, 2_000)}`)
  }

  for (const event of timelineEvents) {
    lines.push(`[Timeline ${event.type}] ${event.summary.slice(0, 2_000)}`)
  }

  return lines.length > 0 ? lines.join("\n") : "No summarizable activity was recorded."
}

function isSummarizableEvent(event: EventRow): boolean {
  return SUMMARY_EVENT_TYPES.has(event.type) && (
    event.source === "telegram" ||
    event.source === "web" ||
    event.type === "companion_reply"
  )
}

function readEventText(event: EventRow): string {
  try {
    const payload = JSON.parse(event.payload) as Record<string, unknown>
    return typeof payload.text === "string" ? payload.text.trim() : ""
  } catch {
    return ""
  }
}

function toDailyNote(row: DailyNoteRow): DailyNote {
  return {
    id: row.id,
    date: row.date,
    summary: row.summary,
    highlights: parseHighlights(row.highlights),
    topicDistribution: parseTopicDistribution(row.topic_distribution),
    sourceEventId: row.source_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseHighlights(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function parseTopicDistribution(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => (
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0
      )),
    )
  } catch {
    return {}
  }
}

function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + amount))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

function zonedMidnightToUtc(date: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number)
  const target = Date.UTC(year, month - 1, day, 0, 0, 0)
  let candidate = target

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = readDateTimeParts(new Date(candidate), timeZone)
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    )
    const correction = target - currentAsUtc
    candidate += correction
    if (correction === 0) break
  }

  return new Date(candidate).toISOString()
}

function readDateTimeParts(value: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  }
}

function formatTime(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp))
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}
