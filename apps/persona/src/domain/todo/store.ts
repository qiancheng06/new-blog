import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"
import type { EventRow } from "../event/store.js"
import { normalizeTodoDueDate, normalizeTodoTitle } from "./validation.js"

export type TodoStatus = "open" | "done" | "cancelled"

export interface TodoRow {
  id: string
  source_event_id: string
  project_id: string | null
  project_event_id: string | null
  project_reason: string
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
  projectId?: string
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
  const projectId = readExistingProjectId(payload.project_id)
  run(
    `INSERT INTO todos (id, source_event_id, project_id, title, due_date)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_event_id) DO NOTHING`,
    [randomUUID(), event.id, projectId, title, dueDate],
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
  if (options.projectId) {
    where.push("project_id = ?")
    params.push(options.projectId)
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

export function updateTodoProject(options: {
  id: string
  expectedProjectId: string | null
  projectId: string | null
  projectEventId: string
  reason: string
}): TodoRow | null {
  const result = run(
    `UPDATE todos
     SET project_id = ?, project_event_id = ?, project_reason = ?, updated_at = datetime('now')
     WHERE id = ? AND project_id IS ?`,
    [options.projectId, options.projectEventId, options.reason, options.id, options.expectedProjectId],
  )
  return result.changes === 1 ? getTodoById(options.id) : null
}

export function buildOpenTodoContextText(limit = 10): string {
  const items = query<TodoRow & { project_name: string | null }>(
    `SELECT t.*, p.name AS project_name
     FROM todos t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.status = 'open'
     ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.created_at DESC
     LIMIT ?`,
    [normalizeLimit(limit)],
  )
  return items
    .map((todo) => [
      "- ",
      todo.due_date ? `[due ${todo.due_date}] ` : "",
      todo.project_name ? `[project ${todo.project_name}] ` : "",
      todo.title,
    ].join(""))
    .join("\n")
}

function readExistingProjectId(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const id = value.trim()
  return queryOne("SELECT 1 FROM projects WHERE id = ?", [id]) ? id : null
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
