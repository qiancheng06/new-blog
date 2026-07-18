import { config } from "../infra/config/index.js"
import { query, withTransaction } from "../infra/db/pool.js"
import { insertEvent, type EventRow } from "../domain/event/store.js"
import { createTodoStateChangeEvent, createWebTodoEvent } from "../domain/event/types.js"
import {
  ensureTodoForEvent,
  getTodoById,
  getTodoStats,
  listTodos,
  updateTodoStatus,
  type TodoListOptions,
  type TodoRow,
  type TodoStats,
  type TodoStatus,
} from "../domain/todo/store.js"
import {
  normalizeTodoDueDate,
  normalizeTodoTitle,
  TodoValueError,
} from "../domain/todo/validation.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export interface TodoPage {
  items: TodoRow[]
  limit: number
  offset: number
}

export interface TodoCreateResult {
  event: EventRow
  todo: TodoRow
}

export interface TodoStateChangeResult {
  event: EventRow
  todo: TodoRow
}

export interface TodoBackfillResult {
  scanned: number
  created: number
  skipped: number
}

export class TodoValidationError extends Error {}
export class TodoNotFoundError extends Error {}
export class TodoConflictError extends Error {}

export function captureTodoEvent(event: EventRow): TodoRow | null {
  try {
    return ensureTodoForEvent(event)
  } catch (err) {
    if (err instanceof TodoValueError) throw new TodoValidationError(err.message)
    throw err
  }
}

export function backfillTodoProjections(eventIds?: string[]): TodoBackfillResult {
  if (eventIds?.length === 0) return { scanned: 0, created: 0, skipped: 0 }
  const idFilter = eventIds
    ? `AND e.id IN (${eventIds.map(() => "?").join(", ")})`
    : ""
  const candidates = query<EventRow>(
    `SELECT e.* FROM events e
     LEFT JOIN todos t ON t.source_event_id = e.id
     WHERE e.type = 'todo' AND t.id IS NULL ${idFilter}
     ORDER BY e.created_at ASC`,
    eventIds,
  )
  let created = 0
  let skipped = 0

  for (const event of candidates) {
    try {
      const todo = withTransaction(() => captureTodoEvent(event))
      if (todo) created += 1
    } catch (err) {
      if (!(err instanceof TodoValidationError)) throw err
      skipped += 1
    }
  }

  return { scanned: candidates.length, created, skipped }
}

export function createTodo(input: { title: unknown; dueDate?: unknown }): TodoCreateResult {
  const normalized = normalizeInput(input)
  return withTransaction(() => {
    const event = insertEvent(createWebTodoEvent({
      text: normalized.title,
      ...(normalized.dueDate ? { due_date: normalized.dueDate } : {}),
    }))
    const todo = ensureTodoForEvent(event)
    if (!todo) throw new Error("todo creation Event did not produce a projection")
    return { event, todo }
  })
}

export function getTodos(options: TodoListOptions = {}): TodoPage {
  const limit = clampLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  return {
    items: listTodos({
      ...options,
      dueBefore: normalizeOptionalDate(options.dueBefore),
      dueAfter: normalizeOptionalDate(options.dueAfter),
      limit,
      offset,
    }),
    limit,
    offset,
  }
}

export function getTodo(idValue: string): TodoRow {
  const id = idValue.trim()
  if (!id) throw new TodoValidationError("todo id is required")
  const todo = getTodoById(id)
  if (!todo) throw new TodoNotFoundError("todo not found")
  return todo
}

export function getTodosStatus(now = new Date()): TodoStats {
  return getTodoStats(getLocalDate(now, config.timeZone))
}

export function changeTodoStatus(input: {
  id: string
  status: unknown
  reason: unknown
}): TodoStateChangeResult {
  const id = input.id.trim()
  const reason = typeof input.reason === "string" ? input.reason.trim() : ""
  if (!id) throw new TodoValidationError("todo id is required")
  if (!isTodoStatus(input.status)) throw new TodoValidationError("todo status is invalid")
  if (!reason) throw new TodoValidationError("reason is required")
  const status = input.status

  return withTransaction(() => {
    const current = getTodoById(id)
    if (!current) throw new TodoNotFoundError("todo not found")
    assertTransition(current.status, status)
    const event = insertEvent(createTodoStateChangeEvent({
      todo_id: current.id,
      source_event_id: current.source_event_id,
      status,
      reason,
    }))
    const todo = updateTodoStatus({
      id: current.id,
      expectedStatus: current.status,
      status,
      stateEventId: event.id,
      reason,
    })
    if (!todo) throw new TodoConflictError("todo status changed concurrently")
    return { event, todo }
  })
}

export function parseTodoStatus(value: string | undefined): TodoStatus | undefined {
  if (value === undefined || value === "all") return undefined
  if (isTodoStatus(value)) return value
  throw new TodoValidationError("todo status is invalid")
}

function normalizeInput(input: { title: unknown; dueDate?: unknown }): {
  title: string
  dueDate: string | null
} {
  if (typeof input.title !== "string") throw new TodoValidationError("todo title is required")
  if (input.dueDate !== undefined && input.dueDate !== null && typeof input.dueDate !== "string") {
    throw new TodoValidationError("todo due date is invalid")
  }
  try {
    return {
      title: normalizeTodoTitle(input.title),
      dueDate: normalizeTodoDueDate(input.dueDate as string | null | undefined),
    }
  } catch (err) {
    if (err instanceof TodoValueError) throw new TodoValidationError(err.message)
    throw err
  }
}

function normalizeOptionalDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return normalizeTodoDueDate(value) ?? undefined
  } catch (err) {
    if (err instanceof TodoValueError) throw new TodoValidationError(err.message)
    throw err
  }
}

function assertTransition(current: TodoStatus, target: TodoStatus): void {
  if (current === target) throw new TodoConflictError("todo already has the requested status")
  if (current === "open" && (target === "done" || target === "cancelled")) return
  if ((current === "done" || current === "cancelled") && target === "open") return
  throw new TodoConflictError("todo status transition is not allowed")
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return value === "open" || value === "done" || value === "cancelled"
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function getLocalDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ""
  return `${read("year")}-${read("month")}-${read("day")}`
}
