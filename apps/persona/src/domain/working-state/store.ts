import { queryOne, run } from "../../infra/db/pool.js"

export type WorkingMode = "S1" | "S2" | "S3" | "S4"

interface WorkingStateRow {
  id: "primary"
  current_project_id: string | null
  active_topics: string
  current_questions: string
  mode: WorkingMode
  state_event_id: string | null
  state_reason: string
  updated_at: string
}

export interface WorkingStateRecord extends Omit<WorkingStateRow, "active_topics" | "current_questions"> {
  active_topics: string[]
  current_questions: string[]
}

export interface WorkingStateSummary {
  mode: WorkingMode
  hasCurrentProject: boolean
  activeTopicCount: number
  currentQuestionCount: number
}

export function getWorkingStateRecord(): WorkingStateRecord {
  const row = queryOne<WorkingStateRow>("SELECT * FROM working_state WHERE id = 'primary'")
  if (!row) throw new Error("working state singleton is missing")
  return toRecord(row)
}

export function getWorkingStateSummary(): WorkingStateSummary {
  const state = getWorkingStateRecord()
  return {
    mode: state.mode,
    hasCurrentProject: state.current_project_id !== null,
    activeTopicCount: state.active_topics.length,
    currentQuestionCount: state.current_questions.length,
  }
}

export function updateWorkingState(options: {
  currentProjectId: string | null
  activeTopics: string[]
  currentQuestions: string[]
  stateEventId: string
  reason: string
}): WorkingStateRecord | null {
  const result = run(
    `UPDATE working_state
     SET current_project_id = ?, active_topics = ?, current_questions = ?,
         mode = 'S1', state_event_id = ?, state_reason = ?, updated_at = datetime('now')
     WHERE id = 'primary'`,
    [
      options.currentProjectId,
      JSON.stringify(options.activeTopics),
      JSON.stringify(options.currentQuestions),
      options.stateEventId,
      options.reason,
    ],
  )
  return result.changes === 1 ? getWorkingStateRecord() : null
}

export function clearCurrentProject(options: {
  expectedProjectId: string
  stateEventId: string
  reason: string
}): WorkingStateRecord | null {
  const result = run(
    `UPDATE working_state
     SET current_project_id = NULL, state_event_id = ?, state_reason = ?, updated_at = datetime('now')
     WHERE id = 'primary' AND current_project_id = ?`,
    [options.stateEventId, options.reason, options.expectedProjectId],
  )
  return result.changes === 1 ? getWorkingStateRecord() : null
}

export function buildWorkingStateContextText(): string {
  const row = queryOne<WorkingStateRow & { project_name: string | null }>(
    `SELECT w.*, p.name AS project_name
     FROM working_state w
     LEFT JOIN projects p ON p.id = w.current_project_id
     WHERE w.id = 'primary'`,
  )
  if (!row) return ""
  const topics = parseStringArray(row.active_topics)
  const questions = parseStringArray(row.current_questions)
  const lines = ["Mode: S1 (companion-first)"]
  if (row.project_name) lines.push(`Current project: ${row.project_name}`)
  if (topics.length) lines.push(`Active topics: ${topics.join(", ")}`)
  if (questions.length) {
    lines.push("Current questions:")
    lines.push(...questions.map((question) => `- ${question}`))
  }
  return lines.join("\n")
}

function toRecord(row: WorkingStateRow): WorkingStateRecord {
  return {
    ...row,
    active_topics: parseStringArray(row.active_topics),
    current_questions: parseStringArray(row.current_questions),
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}
