import { insertEvent, type EventRow } from "../domain/event/store.js"
import { createWorkingStateUpdatedEvent } from "../domain/event/types.js"
import { getProjectById } from "../domain/project/store.js"
import {
  getWorkingStateRecord,
  getWorkingStateSummary,
  updateWorkingState,
  type WorkingStateRecord,
  type WorkingStateSummary,
} from "../domain/working-state/store.js"
import {
  normalizeWorkingQuestions,
  normalizeWorkingTopics,
  WorkingStateValueError,
} from "../domain/working-state/validation.js"
import { withTransaction } from "../infra/db/pool.js"

export interface WorkingStateChangeResult {
  event: EventRow
  workingState: WorkingStateRecord
}

export class WorkingStateValidationError extends Error {}
export class WorkingStateNotFoundError extends Error {}
export class WorkingStateConflictError extends Error {}

export function getWorkingState(): WorkingStateRecord {
  return getWorkingStateRecord()
}

export function getWorkingStateStatus(): WorkingStateSummary {
  return getWorkingStateSummary()
}

export function changeWorkingState(input: {
  currentProjectId?: unknown
  activeTopics?: unknown
  currentQuestions?: unknown
  mode?: unknown
  reason: unknown
}): WorkingStateChangeResult {
  const reason = normalizeReason(input.reason)
  const hasCurrentProject = input.currentProjectId !== undefined
  const hasTopics = input.activeTopics !== undefined
  const hasQuestions = input.currentQuestions !== undefined
  const hasMode = input.mode !== undefined
  if (!hasCurrentProject && !hasTopics && !hasQuestions && !hasMode) {
    throw new WorkingStateValidationError("working state change is required")
  }
  if (hasMode && input.mode !== "S1") {
    throw new WorkingStateValidationError("only S1 mode is available")
  }

  return withTransaction(() => {
    const current = getWorkingStateRecord()
    const currentProjectId = hasCurrentProject
      ? normalizeCurrentProjectId(input.currentProjectId)
      : current.current_project_id
    const activeTopics = hasTopics
      ? normalizeWorkingValue(() => normalizeWorkingTopics(input.activeTopics))
      : current.active_topics
    const currentQuestions = hasQuestions
      ? normalizeWorkingValue(() => normalizeWorkingQuestions(input.currentQuestions))
      : current.current_questions

    if (currentProjectId) {
      const project = getProjectById(currentProjectId)
      if (!project) throw new WorkingStateNotFoundError("project not found")
      if (project.status !== "active" && project.status !== "paused") {
        throw new WorkingStateConflictError("terminal project cannot be current")
      }
    }
    if (
      currentProjectId === current.current_project_id &&
      sameStrings(activeTopics, current.active_topics) &&
      sameStrings(currentQuestions, current.current_questions) &&
      current.mode === "S1"
    ) {
      throw new WorkingStateConflictError("working state is unchanged")
    }

    const event = insertEvent(createWorkingStateUpdatedEvent({
      current_project_id: currentProjectId,
      active_topics: activeTopics,
      current_questions: currentQuestions,
      mode: "S1",
      reason,
    }))
    const workingState = updateWorkingState({
      currentProjectId,
      activeTopics,
      currentQuestions,
      stateEventId: event.id,
      reason,
    })
    if (!workingState) throw new WorkingStateConflictError("working state changed concurrently")
    return { event, workingState }
  })
}

function normalizeCurrentProjectId(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== "string") {
    throw new WorkingStateValidationError("current project id is invalid")
  }
  const id = value.trim()
  if (!id) throw new WorkingStateValidationError("current project id is invalid")
  return id
}

function normalizeReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : ""
  if (!reason) throw new WorkingStateValidationError("reason is required")
  if (reason.length > 500) throw new WorkingStateValidationError("reason is too long")
  return reason
}

function normalizeWorkingValue<T>(work: () => T): T {
  try {
    return work()
  } catch (err) {
    if (err instanceof WorkingStateValueError) {
      throw new WorkingStateValidationError(err.message)
    }
    throw err
  }
}

function sameStrings(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}
