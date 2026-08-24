import { randomUUID } from "crypto"
import { config } from "../infra/config/index.js"
import { query, queryOne, run, withTransaction } from "../infra/db/pool.js"

export type CalendarTone = "green" | "blue" | "amber" | "red" | "gray"

export interface CalendarTagDto {
  id: string
  label: string
  tone: CalendarTone
  sortOrder: number
  version: number
  createdAt: string
  updatedAt: string
}

export type CalendarSchedule =
  | { kind: "allDay"; startDate: string; endDate: string }
  | { kind: "timed"; startsAt: string; endsAt: string; timeZone: string }

export interface CalendarEventDto {
  id: string
  title: string
  notes: string
  tagId: string
  completed: boolean
  schedule: CalendarSchedule
  seriesId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

interface CalendarTagRow {
  id: string
  label: string
  tone: CalendarTone
  sort_order: number
  version: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface CalendarEventRow {
  id: string
  title: string
  notes: string
  tag_id: string
  all_day: number
  start_at: string | null
  end_at: string | null
  start_date: string | null
  end_date: string | null
  time_zone: string | null
  series_id: string | null
  occurrence_date: string | null
  completed: number
  version: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CalendarEventInput {
  title: string
  notes?: string
  tagId: string
  completed?: boolean
  schedule: CalendarSchedule
}

export interface CalendarEventPatch {
  version: number
  title?: string
  notes?: string
  tagId?: string
  completed?: boolean
  schedule?: CalendarSchedule
}

type ValidatedCalendarEventInput = Required<Omit<CalendarEventInput, "schedule">> & { schedule: CalendarSchedule }
export type CalendarDeleteScope = "single" | "future" | "series"

export function getCalendar(options: { from: string; to: string }): {
  events: CalendarEventDto[]
  tags: CalendarTagDto[]
  timeZone: string
} {
  const { from, to } = validateRange(options.from, options.to)
  const events = query<CalendarEventRow>(
    `SELECT * FROM calendar_events
     WHERE deleted_at IS NULL AND (
       (all_day = 1 AND start_date <= ? AND end_date > ?)
       OR
       (all_day = 0 AND datetime(start_at) < datetime(?, '+1 day') AND datetime(end_at) > datetime(?))
     )
     ORDER BY COALESCE(start_date, start_at), title`,
    [to, from, to, from],
  ).map(toEventDto)

  return { events, tags: listCalendarTags(), timeZone: config.timeZone }
}

export function listCalendarTags(): CalendarTagDto[] {
  return query<CalendarTagRow>(
    "SELECT * FROM calendar_tags WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
  ).map(toTagDto)
}

export function createCalendarEvent(input: CalendarEventInput): CalendarEventDto {
  const value = validateEventInput(input)
  return withTransaction(() => {
    ensureActiveTag(value.tagId)
    return insertCalendarEvent(value, null)
  })
}

export function createCalendarEvents(inputs: CalendarEventInput[]): CalendarEventDto[] {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 104) {
    throw new CalendarValidationError("events must contain 1 to 104 items")
  }
  const values = inputs.map(validateEventInput)
  const seriesId = randomUUID()
  return withTransaction(() => {
    for (const value of values) ensureActiveTag(value.tagId)
    return values.map((value) => insertCalendarEvent(value, seriesId))
  })
}

function insertCalendarEvent(value: ValidatedCalendarEventInput, seriesId: string | null): CalendarEventDto {
  const id = randomUUID()
  const schedule = scheduleColumns(value.schedule)
  const occurrenceDate = occurrenceDateForSchedule(value.schedule)
  run(
    `INSERT INTO calendar_events
       (id, title, notes, tag_id, all_day, start_at, end_at, start_date, end_date, time_zone,
        series_id, occurrence_date, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      value.title,
      value.notes,
      value.tagId,
      schedule.allDay,
      schedule.startAt,
      schedule.endAt,
      schedule.startDate,
      schedule.endDate,
      schedule.timeZone,
      seriesId,
      occurrenceDate,
      value.completed ? 1 : 0,
    ],
  )
  return toEventDto(queryOne<CalendarEventRow>("SELECT * FROM calendar_events WHERE id = ?", [id])!)
}

export function updateCalendarEvent(id: string, patch: CalendarEventPatch): CalendarEventDto {
  const existing = getActiveEventRow(id)
  const version = validateVersion(patch.version)
  const current = toEventDto(existing)
  const value = validateEventInput({
    title: patch.title ?? current.title,
    notes: patch.notes ?? current.notes,
    tagId: patch.tagId ?? current.tagId,
    completed: patch.completed ?? current.completed,
    schedule: patch.schedule ?? current.schedule,
  })
  ensureActiveTag(value.tagId)
  const schedule = scheduleColumns(value.schedule)
  const result = run(
    `UPDATE calendar_events
     SET title = ?, notes = ?, tag_id = ?, all_day = ?, start_at = ?, end_at = ?,
         start_date = ?, end_date = ?, time_zone = ?, occurrence_date = ?, completed = ?,
         version = version + 1, updated_at = datetime('now')
     WHERE id = ? AND version = ? AND deleted_at IS NULL`,
    [
      value.title,
      value.notes,
      value.tagId,
      schedule.allDay,
      schedule.startAt,
      schedule.endAt,
      schedule.startDate,
      schedule.endDate,
      schedule.timeZone,
      occurrenceDateForSchedule(value.schedule),
      value.completed ? 1 : 0,
      id,
      version,
    ],
  )
  if (result.changes !== 1) throw new CalendarVersionConflictError("calendar event was changed on another device")
  return toEventDto(getActiveEventRow(id))
}

export function deleteCalendarEvent(
  id: string,
  versionInput: number,
  scopeInput: CalendarDeleteScope = "single",
): { id: string; version: number; deleted: true; deletedIds: string[]; deletedCount: number } {
  const version = validateVersion(versionInput)
  const scope = validateDeleteScope(scopeInput)
  return withTransaction(() => {
    const existing = getActiveEventRow(id)
    if (existing.version !== version) throw new CalendarVersionConflictError("calendar event was changed on another device")

    if (scope === "single" || !existing.series_id) {
      const result = run(
        `UPDATE calendar_events
         SET deleted_at = datetime('now'), updated_at = datetime('now'), version = version + 1
         WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        [id, version],
      )
      if (result.changes !== 1) throw new CalendarVersionConflictError("calendar event was changed on another device")
      return { id, version: version + 1, deleted: true as const, deletedIds: [id], deletedCount: 1 }
    }

    const rows = scope === "future"
      ? query<{ id: string }>(
          "SELECT id FROM calendar_events WHERE series_id = ? AND occurrence_date >= ? AND deleted_at IS NULL",
          [existing.series_id, existing.occurrence_date],
        )
      : query<{ id: string }>(
          "SELECT id FROM calendar_events WHERE series_id = ? AND deleted_at IS NULL",
          [existing.series_id],
        )
    const deletedIds = rows.map((row) => row.id)
    const result = scope === "future"
      ? run(
          `UPDATE calendar_events
           SET deleted_at = datetime('now'), updated_at = datetime('now'), version = version + 1
           WHERE series_id = ? AND occurrence_date >= ? AND deleted_at IS NULL`,
          [existing.series_id, existing.occurrence_date],
        )
      : run(
          `UPDATE calendar_events
           SET deleted_at = datetime('now'), updated_at = datetime('now'), version = version + 1
           WHERE series_id = ? AND deleted_at IS NULL`,
          [existing.series_id],
        )
    return { id, version: version + 1, deleted: true as const, deletedIds, deletedCount: result.changes }
  })
}

export function createCalendarTag(input: {
  label: string
  tone: CalendarTone
  sortOrder?: number
}): CalendarTagDto {
  const label = validateLabel(input.label)
  const tone = validateTone(input.tone)
  ensureUniqueTagLabel(label)
  const sortOrder = input.sortOrder === undefined
    ? (queryOne<{ value: number }>("SELECT COALESCE(MAX(sort_order), 0) + 10 AS value FROM calendar_tags WHERE deleted_at IS NULL")?.value ?? 10)
    : validateSortOrder(input.sortOrder)
  const id = randomUUID()
  run(
    "INSERT INTO calendar_tags (id, label, tone, sort_order) VALUES (?, ?, ?, ?)",
    [id, label, tone, sortOrder],
  )
  return toTagDto(queryOne<CalendarTagRow>("SELECT * FROM calendar_tags WHERE id = ?", [id])!)
}

export function updateCalendarTag(id: string, input: {
  version: number
  label?: string
  tone?: CalendarTone
  sortOrder?: number
}): CalendarTagDto {
  const existing = getActiveTagRow(id)
  const version = validateVersion(input.version)
  const label = input.label === undefined ? existing.label : validateLabel(input.label)
  const tone = input.tone === undefined ? existing.tone : validateTone(input.tone)
  const sortOrder = input.sortOrder === undefined ? existing.sort_order : validateSortOrder(input.sortOrder)
  ensureUniqueTagLabel(label, id)
  const result = run(
    `UPDATE calendar_tags
     SET label = ?, tone = ?, sort_order = ?, version = version + 1, updated_at = datetime('now')
     WHERE id = ? AND version = ? AND deleted_at IS NULL`,
    [label, tone, sortOrder, id, version],
  )
  if (result.changes !== 1) throw new CalendarVersionConflictError("calendar tag was changed on another device")
  return toTagDto(getActiveTagRow(id))
}

export function deleteCalendarTag(input: {
  id: string
  version: number
  fallbackTagId: string
}): { id: string; version: number; deleted: true; fallbackTagId: string; movedEventCount: number } {
  const version = validateVersion(input.version)
  const fallbackTagId = typeof input.fallbackTagId === "string" ? input.fallbackTagId.trim() : ""
  if (!fallbackTagId) throw new CalendarValidationError("fallbackTagId is required")
  if (input.id === fallbackTagId) throw new CalendarValidationError("fallback tag must be different")

  return withTransaction(() => {
    getActiveTagRow(input.id)
    getActiveTagRow(fallbackTagId)
    const activeCount = queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM calendar_tags WHERE deleted_at IS NULL",
    )?.count ?? 0
    if (activeCount <= 1) throw new CalendarConflictError("the final calendar tag cannot be deleted")

    const moved = run(
      `UPDATE calendar_events
       SET tag_id = ?, version = version + 1, updated_at = datetime('now')
       WHERE tag_id = ? AND deleted_at IS NULL`,
      [fallbackTagId, input.id],
    )
    const deleted = run(
      `UPDATE calendar_tags
       SET deleted_at = datetime('now'), updated_at = datetime('now'), version = version + 1
       WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      [input.id, version],
    )
    if (deleted.changes !== 1) throw new CalendarVersionConflictError("calendar tag was changed on another device")
    return {
      id: input.id,
      version: version + 1,
      deleted: true as const,
      fallbackTagId,
      movedEventCount: moved.changes,
    }
  })
}

export class CalendarValidationError extends Error {}
export class CalendarNotFoundError extends Error {}
export class CalendarConflictError extends Error {}
export class CalendarVersionConflictError extends CalendarConflictError {}

function validateEventInput(input: CalendarEventInput): ValidatedCalendarEventInput {
  const title = typeof input.title === "string" ? input.title.trim() : ""
  if (!title || title.length > 80) throw new CalendarValidationError("title must contain 1 to 80 characters")
  const notes = input.notes?.trim() ?? ""
  if (notes.length > 500) throw new CalendarValidationError("notes must be at most 500 characters")
  const tagId = typeof input.tagId === "string" ? input.tagId.trim() : ""
  if (!tagId) throw new CalendarValidationError("tagId is required")
  if (input.completed !== undefined && typeof input.completed !== "boolean") {
    throw new CalendarValidationError("completed must be a boolean")
  }
  return { title, notes, tagId, completed: input.completed ?? false, schedule: validateSchedule(input.schedule) }
}

function validateSchedule(schedule: CalendarSchedule): CalendarSchedule {
  if (!schedule || typeof schedule !== "object") throw new CalendarValidationError("schedule is required")
  if (schedule.kind === "allDay") {
    const startDate = validateDate(schedule.startDate, "schedule.startDate")
    const endDate = validateDate(schedule.endDate, "schedule.endDate")
    if (endDate <= startDate) throw new CalendarValidationError("all-day endDate must be after startDate")
    return { kind: "allDay", startDate, endDate }
  }
  if (schedule.kind === "timed") {
    const startsAt = validateTimestamp(schedule.startsAt, "schedule.startsAt")
    const endsAt = validateTimestamp(schedule.endsAt, "schedule.endsAt")
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new CalendarValidationError("endsAt must be after startsAt")
    const timeZone = schedule.timeZone?.trim()
    if (!timeZone || !isValidTimeZone(timeZone)) throw new CalendarValidationError("timeZone must be a valid IANA time zone")
    return { kind: "timed", startsAt, endsAt, timeZone }
  }
  throw new CalendarValidationError("schedule.kind must be allDay or timed")
}

function validateRange(fromInput: string, toInput: string): { from: string; to: string } {
  const from = validateDate(fromInput, "from")
  const to = validateDate(toInput, "to")
  if (to < from) throw new CalendarValidationError("to must not be before from")
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
  if (days > 400) throw new CalendarValidationError("calendar range must be at most 400 days")
  return { from, to }
}

function validateDate(value: string, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CalendarValidationError(`${name} must use YYYY-MM-DD`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CalendarValidationError(`${name} must be a real calendar date`)
  }
  return value
}

function validateTimestamp(value: string, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new CalendarValidationError(`${name} must be an RFC3339 timestamp with an offset`)
  }
  if (Number.isNaN(Date.parse(value))) throw new CalendarValidationError(`${name} must be a real timestamp`)
  return value
}

function validateLabel(value: string): string {
  const label = typeof value === "string" ? value.trim() : ""
  if (!label || label.length > 16) throw new CalendarValidationError("label must contain 1 to 16 characters")
  return label
}

function validateTone(value: CalendarTone): CalendarTone {
  if (!(["green", "blue", "amber", "red", "gray"] as string[]).includes(value)) {
    throw new CalendarValidationError("tone is invalid")
  }
  return value
}

function validateSortOrder(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new CalendarValidationError("sortOrder must be an integer between 0 and 1000000")
  }
  return value
}

function validateVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new CalendarValidationError("version must be a positive integer")
  return value
}

function validateDeleteScope(value: CalendarDeleteScope): CalendarDeleteScope {
  if (!(value === "single" || value === "future" || value === "series")) {
    throw new CalendarValidationError("scope must be single, future, or series")
  }
  return value
}

function ensureActiveTag(id: string): void {
  if (!queryOne("SELECT id FROM calendar_tags WHERE id = ? AND deleted_at IS NULL", [id])) {
    throw new CalendarValidationError("tagId does not reference an active tag")
  }
}

function ensureUniqueTagLabel(label: string, excludedId?: string): void {
  const existing = excludedId
    ? queryOne("SELECT id FROM calendar_tags WHERE label = ? AND id != ? AND deleted_at IS NULL", [label, excludedId])
    : queryOne("SELECT id FROM calendar_tags WHERE label = ? AND deleted_at IS NULL", [label])
  if (existing) throw new CalendarConflictError("calendar tag label already exists")
}

function getActiveEventRow(id: string): CalendarEventRow {
  const row = queryOne<CalendarEventRow>("SELECT * FROM calendar_events WHERE id = ? AND deleted_at IS NULL", [id])
  if (!row) throw new CalendarNotFoundError("calendar event not found")
  return row
}

function getActiveTagRow(id: string): CalendarTagRow {
  const row = queryOne<CalendarTagRow>("SELECT * FROM calendar_tags WHERE id = ? AND deleted_at IS NULL", [id])
  if (!row) throw new CalendarNotFoundError("calendar tag not found")
  return row
}

function scheduleColumns(schedule: CalendarSchedule): {
  allDay: number
  startAt: string | null
  endAt: string | null
  startDate: string | null
  endDate: string | null
  timeZone: string | null
} {
  return schedule.kind === "allDay"
    ? { allDay: 1, startAt: null, endAt: null, startDate: schedule.startDate, endDate: schedule.endDate, timeZone: null }
    : { allDay: 0, startAt: schedule.startsAt, endAt: schedule.endsAt, startDate: null, endDate: null, timeZone: schedule.timeZone }
}

function occurrenceDateForSchedule(schedule: CalendarSchedule): string {
  if (schedule.kind === "allDay") return schedule.startDate
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(schedule.startsAt))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function toEventDto(row: CalendarEventRow): CalendarEventDto {
  const schedule: CalendarSchedule = row.all_day === 1
    ? { kind: "allDay", startDate: row.start_date!, endDate: row.end_date! }
    : { kind: "timed", startsAt: row.start_at!, endsAt: row.end_at!, timeZone: row.time_zone! }
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    tagId: row.tag_id,
    completed: row.completed === 1,
    schedule,
    seriesId: row.series_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toTagDto(row: CalendarTagRow): CalendarTagDto {
  return {
    id: row.id,
    label: row.label,
    tone: row.tone,
    sortOrder: row.sort_order,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}
