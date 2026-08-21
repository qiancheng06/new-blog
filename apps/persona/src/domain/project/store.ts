import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"
import type { EventRow } from "../event/store.js"
import {
  normalizeProjectName,
  normalizeProjectSummary,
  normalizeProjectTopics,
} from "./validation.js"

export type ProjectStatus = "active" | "paused" | "done" | "archived"

interface ProjectRow {
  id: string
  source_event_id: string | null
  name: string
  status: ProjectStatus
  topics: string
  summary: string
  state_event_id: string | null
  state_reason: string
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
}

export interface ProjectRecord extends Omit<ProjectRow, "topics"> {
  topics: string[]
}

export interface ProjectListOptions {
  status?: ProjectStatus
  topic?: string
  limit?: number
  offset?: number
}

export interface ProjectStats {
  active: number
  paused: number
  done: number
  archived: number
}

export function ensureProjectForEvent(event: EventRow): ProjectRecord | null {
  if (event.type !== "project") return null
  const bySource = getProjectBySourceEventId(event.id)
  if (bySource) return bySource

  const payload = parsePayload(event.payload)
  const name = normalizeProjectName(typeof payload.text === "string" ? payload.text : "")
  const summary = normalizeProjectSummary(typeof payload.summary === "string" ? payload.summary : "")
  const topics = normalizeProjectTopics(payload.topics)
  const byName = getProjectByName(name)
  if (byName) return byName

  run(
    `INSERT INTO projects (id, source_event_id, name, summary, topics)
     VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), event.id, name, summary, JSON.stringify(topics)],
  )
  const project = getProjectBySourceEventId(event.id)
  if (!project) throw new Error("project Event did not produce a projection")
  return project
}

export function getProjectById(id: string): ProjectRecord | null {
  return toProjectRecord(queryOne<ProjectRow>("SELECT * FROM projects WHERE id = ?", [id]))
}

export function getProjectByName(name: string): ProjectRecord | null {
  return toProjectRecord(queryOne<ProjectRow>("SELECT * FROM projects WHERE name = ? COLLATE NOCASE", [name]))
}

export function getProjectBySourceEventId(sourceEventId: string): ProjectRecord | null {
  return toProjectRecord(queryOne<ProjectRow>("SELECT * FROM projects WHERE source_event_id = ?", [sourceEventId]))
}

export function listProjects(options: ProjectListOptions = {}): ProjectRecord[] {
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    where.push("p.status = ?")
    params.push(options.status)
  }
  if (options.topic) {
    where.push("EXISTS (SELECT 1 FROM json_each(p.topics) WHERE value = ? COLLATE NOCASE)")
    params.push(options.topic)
  }
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))

  return query<ProjectRow>(
    `SELECT p.* FROM projects p
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY
       CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
       p.updated_at DESC, p.name ASC
     LIMIT ? OFFSET ?`,
    params,
  ).map((row) => toProjectRecord(row) as ProjectRecord)
}

export function getProjectStats(): ProjectStats {
  const stats: ProjectStats = { active: 0, paused: 0, done: 0, archived: 0 }
  for (const row of query<{ status: ProjectStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM projects GROUP BY status",
  )) {
    if (row.status in stats) stats[row.status] = Number(row.count)
  }
  return stats
}

export function updateProjectDetails(options: {
  id: string
  name: string
  summary: string
  topics: string[]
}): ProjectRecord | null {
  const result = run(
    `UPDATE projects
     SET name = ?, summary = ?, topics = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [options.name, options.summary, JSON.stringify(options.topics), options.id],
  )
  return result.changes === 1 ? getProjectById(options.id) : null
}

export function updateProjectStatus(options: {
  id: string
  expectedStatus: ProjectStatus
  status: ProjectStatus
  stateEventId: string
  reason: string
}): ProjectRecord | null {
  const result = run(
    `UPDATE projects
     SET status = ?, state_event_id = ?, state_reason = ?, updated_at = datetime('now'),
         completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END,
         archived_at = CASE WHEN ? = 'archived' THEN datetime('now') ELSE NULL END
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
  return result.changes === 1 ? getProjectById(options.id) : null
}

export function countOpenTodosForProject(projectId: string): number {
  return Number(queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM todos WHERE project_id = ? AND status = 'open'",
    [projectId],
  )?.count ?? 0)
}

export function buildActiveProjectContextText(limit = 8): string {
  return listProjects({ status: "active", limit: normalizeLimit(limit) })
    .map((project) => {
      const details = [
        project.summary,
        project.topics.length ? `topics: ${project.topics.join(", ")}` : "",
      ].filter(Boolean).join("; ")
      return `- ${project.name}${details ? `: ${details}` : ""}`
    })
    .join("\n")
}

function toProjectRecord(row: ProjectRow | null): ProjectRecord | null {
  if (!row) return null
  return { ...row, topics: parseTopics(row.topics) }
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseTopics(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
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
