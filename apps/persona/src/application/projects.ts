import { query, withTransaction } from "../infra/db/pool.js"
import { insertEvent, type EventRow } from "../domain/event/store.js"
import {
  createProjectDetailsUpdatedEvent,
  createProjectStateChangeEvent,
  createWorkingStateProjectClearedEvent,
  createWebProjectEvent,
} from "../domain/event/types.js"
import {
  countOpenTodosForProject,
  ensureProjectForEvent,
  getProjectById,
  getProjectByName,
  getProjectStats,
  listProjects,
  updateProjectDetails,
  updateProjectStatus,
  type ProjectListOptions,
  type ProjectRecord,
  type ProjectStats,
  type ProjectStatus,
} from "../domain/project/store.js"
import {
  normalizeProjectName,
  normalizeProjectSummary,
  normalizeProjectTopics,
  ProjectValueError,
} from "../domain/project/validation.js"
import {
  clearCurrentProject,
  getWorkingStateRecord,
} from "../domain/working-state/store.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export interface ProjectPage {
  items: ProjectRecord[]
  limit: number
  offset: number
}

export interface ProjectCreateResult {
  event: EventRow
  project: ProjectRecord
}

export interface ProjectChangeResult {
  event: EventRow
  project: ProjectRecord
  workingStateEvent?: EventRow
}

export interface ProjectBackfillResult {
  scanned: number
  created: number
  reused: number
  skipped: number
}

export class ProjectValidationError extends Error {}
export class ProjectNotFoundError extends Error {}
export class ProjectConflictError extends Error {}

export function captureProjectEvent(event: EventRow): ProjectRecord | null {
  try {
    return ensureProjectForEvent(event)
  } catch (err) {
    if (err instanceof ProjectValueError) throw new ProjectValidationError(err.message)
    throw err
  }
}

export function backfillProjectProjections(eventIds?: string[]): ProjectBackfillResult {
  if (eventIds?.length === 0) return { scanned: 0, created: 0, reused: 0, skipped: 0 }
  const idFilter = eventIds
    ? `AND e.id IN (${eventIds.map(() => "?").join(", ")})`
    : ""
  const candidates = query<EventRow>(
    `SELECT e.* FROM events e
     LEFT JOIN projects p ON p.source_event_id = e.id
     WHERE e.type = 'project' AND p.id IS NULL ${idFilter}
     ORDER BY e.created_at ASC`,
    eventIds,
  )
  let created = 0
  let reused = 0
  let skipped = 0

  for (const event of candidates) {
    try {
      const project = withTransaction(() => captureProjectEvent(event))
      if (project?.source_event_id === event.id) created += 1
      else if (project) reused += 1
    } catch (err) {
      if (!(err instanceof ProjectValidationError)) throw err
      skipped += 1
    }
  }

  return { scanned: candidates.length, created, reused, skipped }
}

export function createProject(input: {
  name: unknown
  summary?: unknown
  topics?: unknown
}): ProjectCreateResult {
  const normalized = normalizeProjectInput(input)
  if (getProjectByName(normalized.name)) throw new ProjectConflictError("project name already exists")

  return withTransaction(() => {
    if (getProjectByName(normalized.name)) throw new ProjectConflictError("project name already exists")
    const event = insertEvent(createWebProjectEvent({
      text: normalized.name,
      summary: normalized.summary,
      topics: normalized.topics,
    }))
    const project = ensureProjectForEvent(event)
    if (!project) throw new Error("project creation Event did not produce a projection")
    return { event, project }
  })
}

export function getProjects(options: ProjectListOptions = {}): ProjectPage {
  const limit = clampLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  const topic = options.topic?.trim()
  if (topic) normalizeProjectValue(() => normalizeProjectTopics([topic]))
  return {
    items: listProjects({ ...options, topic: topic || undefined, limit, offset }),
    limit,
    offset,
  }
}

export function getProject(idValue: string): ProjectRecord {
  const id = idValue.trim()
  if (!id) throw new ProjectValidationError("project id is required")
  const project = getProjectById(id)
  if (!project) throw new ProjectNotFoundError("project not found")
  return project
}

export function getProjectsStatus(): ProjectStats {
  return getProjectStats()
}

export function changeProjectDetails(input: {
  id: string
  name?: unknown
  summary?: unknown
  topics?: unknown
  reason: unknown
}): ProjectChangeResult {
  const id = input.id.trim()
  const reason = normalizeReason(input.reason)
  if (!id) throw new ProjectValidationError("project id is required")
  if (input.name === undefined && input.summary === undefined && input.topics === undefined) {
    throw new ProjectValidationError("project details change is required")
  }

  return withTransaction(() => {
    const current = getProjectById(id)
    if (!current) throw new ProjectNotFoundError("project not found")
    const name = input.name === undefined
      ? current.name
      : normalizeProjectValue(() => {
        if (typeof input.name !== "string") throw new ProjectValueError("project name is required")
        return normalizeProjectName(input.name)
      })
    const summary = input.summary === undefined
      ? current.summary
      : normalizeProjectValue(() => {
        if (typeof input.summary !== "string" && input.summary !== null) {
          throw new ProjectValueError("project summary is invalid")
        }
        return normalizeProjectSummary(input.summary as string | null)
      })
    const topics = input.topics === undefined
      ? current.topics
      : normalizeProjectValue(() => normalizeProjectTopics(input.topics))

    const nameOwner = getProjectByName(name)
    if (nameOwner && nameOwner.id !== current.id) throw new ProjectConflictError("project name already exists")
    if (name === current.name && summary === current.summary && sameTopics(topics, current.topics)) {
      throw new ProjectConflictError("project details are unchanged")
    }

    const event = insertEvent(createProjectDetailsUpdatedEvent({
      project_id: current.id,
      source_event_id: current.source_event_id,
      name,
      summary,
      topics,
      reason,
    }))
    const project = updateProjectDetails({ id: current.id, name, summary, topics })
    if (!project) throw new ProjectConflictError("project changed concurrently")
    return { event, project }
  })
}

export function changeProjectStatus(input: {
  id: string
  status: unknown
  reason: unknown
}): ProjectChangeResult {
  const id = input.id.trim()
  const reason = normalizeReason(input.reason)
  if (!id) throw new ProjectValidationError("project id is required")
  if (!isProjectStatus(input.status)) throw new ProjectValidationError("project status is invalid")
  const status = input.status

  return withTransaction(() => {
    const current = getProjectById(id)
    if (!current) throw new ProjectNotFoundError("project not found")
    assertTransition(current.status, status)
    const openTodoCount = countOpenTodosForProject(current.id)
    if ((status === "done" || status === "archived") && openTodoCount > 0) {
      throw new ProjectConflictError("project has open todos")
    }

    const event = insertEvent(createProjectStateChangeEvent({
      project_id: current.id,
      source_event_id: current.source_event_id,
      status,
      reason,
    }))
    const project = updateProjectStatus({
      id: current.id,
      expectedStatus: current.status,
      status,
      stateEventId: event.id,
      reason,
    })
    if (!project) throw new ProjectConflictError("project status changed concurrently")
    let workingStateEvent: EventRow | undefined
    if ((status === "done" || status === "archived") && getWorkingStateRecord().current_project_id === current.id) {
      workingStateEvent = insertEvent(createWorkingStateProjectClearedEvent({
        project_id: current.id,
        project_state_event_id: event.id,
        reason,
      }))
      const workingState = clearCurrentProject({
        expectedProjectId: current.id,
        stateEventId: workingStateEvent.id,
        reason,
      })
      if (!workingState) throw new ProjectConflictError("working state changed concurrently")
    }
    return { event, project, workingStateEvent }
  })
}

export function parseProjectStatus(value: string | undefined): ProjectStatus | undefined {
  if (value === undefined || value === "all") return undefined
  if (isProjectStatus(value)) return value
  throw new ProjectValidationError("project status is invalid")
}

export function projectAcceptsOpenTodos(project: ProjectRecord): boolean {
  return project.status === "active" || project.status === "paused"
}

function normalizeProjectInput(input: { name: unknown; summary?: unknown; topics?: unknown }): {
  name: string
  summary: string
  topics: string[]
} {
  return normalizeProjectValue(() => {
    if (typeof input.name !== "string") throw new ProjectValueError("project name is required")
    if (input.summary !== undefined && input.summary !== null && typeof input.summary !== "string") {
      throw new ProjectValueError("project summary is invalid")
    }
    return {
      name: normalizeProjectName(input.name),
      summary: normalizeProjectSummary(input.summary as string | null | undefined),
      topics: normalizeProjectTopics(input.topics),
    }
  })
}

function normalizeReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : ""
  if (!reason) throw new ProjectValidationError("reason is required")
  if (reason.length > 500) throw new ProjectValidationError("reason is too long")
  return reason
}

function normalizeProjectValue<T>(work: () => T): T {
  try {
    return work()
  } catch (err) {
    if (err instanceof ProjectValueError) throw new ProjectValidationError(err.message)
    throw err
  }
}

function assertTransition(current: ProjectStatus, target: ProjectStatus): void {
  if (current === target) throw new ProjectConflictError("project already has the requested status")
  if ((current === "active" || current === "paused") && target !== current) return
  if ((current === "done" || current === "archived") && target === "active") return
  throw new ProjectConflictError("project status transition is not allowed")
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === "active" || value === "paused" || value === "done" || value === "archived"
}

function sameTopics(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((topic, index) => topic === second[index])
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
