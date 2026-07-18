import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"
import type { EventRow } from "../event/store.js"
import { normalizeTodoDueDate, normalizeTodoTitle } from "./validation.js"

export type TodoStatus = "open" | "done" | "cancelled"

export interface TodoRow {
  id: string
  source_event_id: string
  title: string
  due_date: string | null
  status: TodoStatus
  state_event_id: string | null
  state_reason: string
  created_at: string
  updated_at: string
  completed_at: string | null
  cancelled_at: string | null
}

export interface TodoListOptions {
  status?: TodoStatus
  dueBefore?: string
  dueAfter?: string
  limit?: number
  offset?: number
}

export interface TodoStats {
  open: number
  done: number
  cancelled: number
  overdue: number
  dueToday: number
}

export function ensureTodoForEvent(event: EventRow): TodoRow | null {
  if (event.type !== "todo") return null
  const payload = parsePayload(event.payload)
  const title = normalizeTodoTitle(typeof payload.text === "string" ? payload.text : "")
  const dueDate = normalizeTodoDueDate(typeof payload.due_date === "string" ? payload.due_date : null)
  run(
    `INSERT INTO todos (id, source_event_id, title, due_date)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source_event_id) DO NOTHING`,
    [randomUUID(), event.id, title, dueDate],
  )
  const todo = getTodoBySourceEventId(event.id)
  if (!todo) throw new Error("todo Event did not produce a projection")
  return todo
}

export function getTodoById(id: string): TodoRow | null {
  return queryOne<TodoRow>("SELECT * FROM todos WHERE id = ?", [id])
}

export function getTodoBySourceEventId(sourceEventId: string): TodoRow | null {
  return queryOne<TodoRow>("SELECT * FROM todos WHERE source_event_id = ?", [sourceEventId])
}

export function listTodos(options: TodoListOptions = {}): TodoRow[] {
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    where.push("status = ?")
    params.push(options.status)
  }
  if (options.dueBefore) {
    where.push("due_date IS NOT NULL AND due_date <= ?")
    params.push(options.dueBefore)
  }
  if (options.dueAfter) {
    where.push("due_date IS NOT NULL AND due_date >= ?")
    params.push(options.dueAfter)
  }
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))

  return query<TodoRow>(
    `SELECT * FROM todos
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY
       CASE status WHEN 'open' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
       CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
       due_date ASC, created_at DESC
     LIMIT ? OFFSET ?`,
    params,
  )
}

export function getTodoStats(today: string): TodoStats {
  const stats: TodoStats = { open: 0, done: 0, cancelled: 0, overdue: 0, dueToday: 0 }
  for (const row of query<{ status: TodoStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM todos GROUP BY status",
  )) {
    stats[row.status] = Number(row.count)
  }
  const due = queryOne<{ overdue: number; due_today: number }>(
    `SELECT
       SUM(CASE WHEN status = 'open' AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN status = 'open' AND due_date = ? THEN 1 ELSE 0 END) AS due_today
     FROM todos`,
    [today, today],
  )
  stats.overdue = Number(due?.overdue ?? 0)
  stats.dueToday = Number(due?.due_today ?? 0)
  return stats
}

export function updateTodoStatus(options: {
  id: string
  expectedStatus: TodoStatus
  status: TodoStatus
  stateEventId: string
  reason: string
}): TodoRow | null {
  const result = run(
    `UPDATE todos
     SET status = ?, state_event_id = ?, state_reason = ?, updated_at = datetime('now'),
         completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END,
         cancelled_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE NULL END
     WHERE id = ? AND status = ?`,
    [
      options.status,
      options.stateEventId,
      options.reason,
      options.status,
      options.status,
      options.id,
      options.expectedStatus,
    ],
  )
  return result.changes === 1 ? getTodoById(options.id) : null
}

export function buildOpenTodoContextText(limit = 10): string {
  const items = listTodos({ status: "open", limit: normalizeLimit(limit) })
  return items
    .map((todo) => `- ${todo.due_date ? `[due ${todo.due_date}] ` : ""}${todo.title}`)
    .join("\n")
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
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
