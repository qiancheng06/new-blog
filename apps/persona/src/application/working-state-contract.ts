const contractTag = `codex-working-state-contract-${Date.now()}`

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const {
  WorkingStateConflictError,
  WorkingStateNotFoundError,
  WorkingStateValidationError,
  changeWorkingState,
  getWorkingState,
  getWorkingStateStatus,
} = await import("./working-state.js")
const { changeProjectStatus, createProject } = await import("./projects.js")
const { buildPrompts } = await import("../ai-runtime/prompts/prompt-builder.js")

initializeDb()

const snapshot = getWorkingState()

try {
  assert(getWorkingStateStatus().mode === snapshot.mode, "Working State summary mode mismatch")

  const primary = createProject({
    name: `${contractTag} primary`,
    summary: "Close the persisted Working State loop.",
    topics: ["Architecture"],
  })
  const changed = changeWorkingState({
    currentProjectId: primary.project.id,
    activeTopics: [" Architecture ", "architecture", "MVP"],
    currentQuestions: [" What closes the MVP? ", "what closes the mvp?", "How do we verify it?"],
    mode: "S1",
    reason: `${contractTag} establish focus`,
  })
  assert(changed.workingState.current_project_id === primary.project.id, "current Project update mismatch")
  assert(changed.workingState.active_topics.join("|") === "Architecture|MVP", "active topics must be normalized")
  assert(
    changed.workingState.current_questions.join("|") === "What closes the MVP?|How do we verify it?",
    "current questions must be normalized",
  )
  assert(changed.workingState.mode === "S1", "Working State mode must remain S1")
  assertWorkingStateAudit(changed.event.id, "working_state_updated", `${contractTag} establish focus`)

  const prompts = buildPrompts({ memoryText: "", recentEvents: [], todoText: "", projectText: "" })
  assert(prompts.workingStateText.includes(primary.project.name), "Working State must enter private prompt context")
  assert(prompts.workingStateText.includes("What closes the MVP?"), "Working State questions must enter prompt context")
  assert(prompts.companionSystemPrompt.includes("<working_state_context>"), "Companion prompt must wrap Working State")
  assert(prompts.historyText.includes("Working state:"), "Analysis context must include Working State")
  assert(!prompts.workingStateText.includes(primary.project.id), "Working State prompt must hide internal Project ids")

  assertThrows(
    () => changeWorkingState({ mode: "S2", reason: `${contractTag} invalid mode` }),
    WorkingStateValidationError,
    "unavailable modes must be rejected",
  )
  assertThrows(
    () => changeWorkingState({ activeTopics: changed.workingState.active_topics, reason: `${contractTag} unchanged` }),
    WorkingStateConflictError,
    "unchanged Working State must conflict",
  )
  assertThrows(
    () => changeWorkingState({ currentProjectId: "missing-project", reason: `${contractTag} missing project` }),
    WorkingStateNotFoundError,
    "missing current Project must be rejected",
  )

  changeProjectStatus({ id: primary.project.id, status: "paused", reason: `${contractTag} pause` })
  assert(getWorkingState().current_project_id === primary.project.id, "paused current Project must remain selected")
  changeProjectStatus({ id: primary.project.id, status: "active", reason: `${contractTag} resume` })

  const completed = changeProjectStatus({
    id: primary.project.id,
    status: "done",
    reason: `${contractTag} complete`,
  })
  assert(completed.workingStateEvent, "completing the current Project must append a Working State Event")
  assert(getWorkingState().current_project_id === null, "completing the current Project must clear it")
  assertWorkingStateAudit(
    completed.workingStateEvent.id,
    "working_state_project_cleared",
    `${contractTag} complete`,
  )
  assertThrows(
    () => changeWorkingState({ currentProjectId: primary.project.id, reason: `${contractTag} terminal` }),
    WorkingStateConflictError,
    "terminal Project must not become current",
  )

  changeProjectStatus({ id: primary.project.id, status: "active", reason: `${contractTag} reactivate` })
  changeWorkingState({
    currentProjectId: primary.project.id,
    reason: `${contractTag} select for archive`,
  })
  const archived = changeProjectStatus({
    id: primary.project.id,
    status: "archived",
    reason: `${contractTag} archive`,
  })
  assert(archived.workingStateEvent, "archiving the current Project must append a Working State Event")
  assert(getWorkingState().current_project_id === null, "archiving the current Project must clear it")

  verifyAtomicRollback()
  console.log("working state contract ok")
} finally {
  restoreWorkingState()
  run("DELETE FROM projects WHERE name LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${contractTag}%`])
}

function verifyAtomicRollback(): void {
  const rollbackProject = createProject({ name: `${contractTag} rollback Project` })
  changeWorkingState({
    currentProjectId: rollbackProject.project.id,
    activeTopics: [`${contractTag} before rollback`],
    currentQuestions: [],
    reason: `${contractTag} prepare rollback`,
  })
  const before = getWorkingState()
  const rollbackReason = `${contractTag} force rollback`
  run(
    `CREATE TEMP TRIGGER working_state_contract_rollback
     BEFORE UPDATE ON working_state WHEN NEW.state_reason = '${escapeSql(rollbackReason)}'
     BEGIN SELECT RAISE(ABORT, 'working state contract rollback'); END`,
  )
  let rejected = false
  try {
    changeWorkingState({
      activeTopics: [`${contractTag} after rollback`],
      reason: rollbackReason,
    })
  } catch {
    rejected = true
  } finally {
    run("DROP TRIGGER IF EXISTS working_state_contract_rollback")
  }
  assert(rejected, "Working State projection failure must reject the transaction")
  const after = getWorkingState()
  assert(after.state_event_id === before.state_event_id, "rollback must preserve Working State provenance")
  assert(after.active_topics.join("|") === before.active_topics.join("|"), "rollback must preserve Working State values")
  assert(
    !queryOne("SELECT 1 FROM events WHERE type = 'working_state_updated' AND payload LIKE ?", [`%${rollbackReason}%`]),
    "Working State projection failure must roll back its audit Event",
  )
}

function restoreWorkingState(): void {
  run(
    `UPDATE working_state
     SET current_project_id = ?, active_topics = ?, current_questions = ?, mode = ?,
         state_event_id = ?, state_reason = ?, updated_at = ?
     WHERE id = 'primary'`,
    [
      snapshot.current_project_id,
      JSON.stringify(snapshot.active_topics),
      JSON.stringify(snapshot.current_questions),
      snapshot.mode,
      snapshot.state_event_id,
      snapshot.state_reason,
      snapshot.updated_at,
    ],
  )
}

function assertWorkingStateAudit(eventId: string, type: string, marker: string): void {
  const event = queryOne<{ source: string; type: string; payload: string; metadata: string }>(
    "SELECT source, type, payload, metadata FROM events WHERE id = ?",
    [eventId],
  )
  assert(event?.source === "web" && event.type === type, `${type} audit Event mismatch`)
  assert(event.payload.includes(marker), `${type} audit Event payload mismatch`)
  const metadata = JSON.parse(event.metadata) as Record<string, unknown>
  assert(metadata.purpose === "working_state", `${type} audit purpose mismatch`)
  assert(metadata.visibility === "user", `${type} audit visibility mismatch`)
}

function assertThrows(
  action: () => unknown,
  errorType: new (...args: never[]) => Error,
  message: string,
): void {
  try {
    action()
  } catch (err) {
    assert(err instanceof errorType, message)
    return
  }
  throw new Error(message)
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
