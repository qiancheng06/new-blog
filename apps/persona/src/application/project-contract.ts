const contractTag = `codex-project-contract-${Date.now()}`

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const {
  ProjectConflictError,
  backfillProjectProjections,
  changeProjectDetails,
  changeProjectStatus,
  createProject,
  getProject,
  getProjects,
  getProjectsStatus,
} = await import("./projects.js")
const {
  TodoConflictError,
  assignTodoProject,
  changeTodoStatus,
  createTodo,
} = await import("./todos.js")
const { buildPrompts } = await import("../ai-runtime/prompts/prompt-builder.js")
const { buildTelegramEvent } = await import("../interface/telegram/events.js")
const { handleConversationEvent } = await import("./conversation.js")
const { insertEvent } = await import("../domain/event/store.js")

initializeDb()

try {
  const baseline = getProjectsStatus()
  const created = createProject({
    name: `  ${contractTag}   primary  `,
    summary: "  Initial project summary.  ",
    topics: ["Architecture", "architecture", "Delivery"],
  })
  assert(created.project.name === `${contractTag} primary`, "Project name must be normalized")
  assert(created.project.summary === "Initial project summary.", "Project summary must be normalized")
  assert(created.project.topics.join("|") === "Architecture|Delivery", "Project topics must be deduplicated")
  assert(created.project.status === "active", "new Project must be active")
  assert(created.project.source_event_id === created.event.id, "Project must retain source Event provenance")
  assert(getProject(created.project.id).id === created.project.id, "Project must be readable by id")
  assert(getProjectsStatus().active === baseline.active + 1, "Project stats must count a new active Project")
  assert(
    getProjects({ status: "active", topic: "architecture", limit: 100 }).items.some((item) => item.id === created.project.id),
    "Project list must filter by status and topic",
  )
  assertAuditEvent(created.event.id, "project", created.project.name)
  assertProjectPromptIncludes(created.project.id, created.project.name)

  assertThrows(
    () => createProject({ name: created.project.name.toUpperCase() }),
    ProjectConflictError,
    "Project names must be unique case-insensitively",
  )

  const renamed = changeProjectDetails({
    id: created.project.id,
    name: `${contractTag} core`,
    summary: "Runtime Project context.",
    topics: ["Architecture", "Context"],
    reason: `${contractTag} clarify scope`,
  })
  assert(renamed.project.name === `${contractTag} core`, "Project rename mismatch")
  assert(renamed.project.topics.includes("Context"), "Project topic update mismatch")
  assertAuditEvent(renamed.event.id, "project_details_updated", `${contractTag} clarify scope`)
  assertThrows(
    () => changeProjectDetails({
      id: created.project.id,
      name: renamed.project.name,
      reason: `${contractTag} unchanged`,
    }),
    ProjectConflictError,
    "unchanged Project details must conflict",
  )

  const paused = changeProjectStatus({
    id: created.project.id,
    status: "paused",
    reason: `${contractTag} pause`,
  })
  assert(paused.project.status === "paused", "Project pause mismatch")
  assertAuditEvent(paused.event.id, "project_paused", `${contractTag} pause`)
  assertProjectPromptExcludes(renamed.project.name)

  changeProjectStatus({ id: created.project.id, status: "active", reason: `${contractTag} resume` })
  assertProjectPromptIncludes(created.project.id, renamed.project.name)

  const secondary = createProject({ name: `${contractTag} secondary`, topics: ["Delivery"] })
  const todo = createTodo({
    title: `${contractTag} linked task`,
    dueDate: "1000-02-01",
    projectId: created.project.id,
  })
  assert(todo.todo.project_id === created.project.id, "Todo create must retain Project assignment")
  assertTodoPromptIncludesProject(renamed.project.name, todo.todo.title)
  assertThrows(
    () => changeProjectStatus({
      id: created.project.id,
      status: "done",
      reason: `${contractTag} premature completion`,
    }),
    ProjectConflictError,
    "Project completion must reject open Todos",
  )

  const moved = assignTodoProject({
    id: todo.todo.id,
    projectId: secondary.project.id,
    reason: `${contractTag} move task`,
  })
  assert(moved.todo.project_id === secondary.project.id, "Todo Project reassignment mismatch")
  assertAuditEvent(moved.event.id, "todo_project_assigned", `${contractTag} move task`)
  const unassigned = assignTodoProject({
    id: todo.todo.id,
    projectId: null,
    reason: `${contractTag} unassign task`,
  })
  assert(unassigned.todo.project_id === null, "Todo Project unassignment mismatch")
  assertAuditEvent(unassigned.event.id, "todo_project_unassigned", `${contractTag} unassign task`)
  assignTodoProject({ id: todo.todo.id, projectId: created.project.id, reason: `${contractTag} restore task` })

  changeTodoStatus({ id: todo.todo.id, status: "done", reason: `${contractTag} finish task` })
  const completed = changeProjectStatus({
    id: created.project.id,
    status: "done",
    reason: `${contractTag} complete project`,
  })
  assert(completed.project.completed_at !== null, "completed Project must have completion timestamp")
  assertAuditEvent(completed.event.id, "project_completed", `${contractTag} complete project`)
  assertProjectPromptExcludes(renamed.project.name)
  assertThrows(
    () => createTodo({ title: `${contractTag} rejected task`, projectId: created.project.id }),
    TodoConflictError,
    "terminal Project must reject new open Todos",
  )
  assertThrows(
    () => changeTodoStatus({ id: todo.todo.id, status: "open", reason: `${contractTag} rejected reopen` }),
    TodoConflictError,
    "Todo must not reopen inside a terminal Project",
  )

  changeProjectStatus({ id: created.project.id, status: "active", reason: `${contractTag} reactivate` })
  changeTodoStatus({ id: todo.todo.id, status: "open", reason: `${contractTag} reopen task` })
  changeTodoStatus({ id: todo.todo.id, status: "done", reason: `${contractTag} finish reopened task` })
  const archived = changeProjectStatus({
    id: created.project.id,
    status: "archived",
    reason: `${contractTag} archive project`,
  })
  assert(archived.project.archived_at !== null, "archived Project must have archive timestamp")
  assertProjectPromptExcludes(renamed.project.name)

  await verifyTelegramProjection()
  verifyHistoricalBackfill()
  await verifyAtomicProjectionRollback()

  console.log("project lifecycle contract ok")
} finally {
  cleanupContractRows()
}

async function verifyTelegramProjection(): Promise<void> {
  const input = {
    chatId: -Number(String(Date.now()).slice(-10)) - 41,
    userId: 2002,
    text: `/project ${contractTag} telegram`,
    messageId: Number(String(Date.now()).slice(-8)) + 41,
  }
  const built = buildTelegramEvent(input)
  const first = await handleConversationEvent(built.event, { shouldReply: built.shouldReply })
  const duplicate = await handleConversationEvent(buildTelegramEvent(input).event, { shouldReply: false })
  assert(!built.shouldReply, "Telegram Project command must not request a Companion reply")
  assert(first.project?.name === `${contractTag} telegram`, "Telegram Project must create a projection")
  assert(duplicate.duplicate && duplicate.project?.id === first.project.id, "Telegram Project retry must reuse its projection")
  const count = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM projects WHERE source_event_id = ?",
    [first.event.id],
  )
  assert(Number(count?.count) === 1, "Telegram redelivery must leave exactly one Project projection")
}

function verifyHistoricalBackfill(): void {
  const valid = insertEvent({
    source: "web",
    type: "project",
    payload: { text: `${contractTag} historical`, summary: "Historical Project", topics: ["History"] },
    timestamp: new Date().toISOString(),
    metadata: {},
  })
  const invalid = insertEvent({
    source: "web",
    type: "project",
    payload: { text: "", marker: `${contractTag} invalid historical` },
    timestamp: new Date().toISOString(),
    metadata: {},
  })

  const first = backfillProjectProjections([valid.id, invalid.id])
  assert(
    first.scanned === 2 && first.created === 1 && first.reused === 0 && first.skipped === 1,
    "Project backfill result mismatch",
  )
  assert(queryOne("SELECT 1 FROM projects WHERE source_event_id = ?", [valid.id]), "Project backfill must restore valid Event")
  assert(!queryOne("SELECT 1 FROM projects WHERE source_event_id = ?", [invalid.id]), "Project backfill must skip invalid Event")
  const replay = backfillProjectProjections([valid.id])
  assert(replay.scanned === 0 && replay.created === 0, "Project backfill must be idempotent")
}

async function verifyAtomicProjectionRollback(): Promise<void> {
  const rollbackTag = `${contractTag} rollback`
  const input = {
    chatId: -Number(String(Date.now()).slice(-10)) - 42,
    userId: 2002,
    text: `/project ${rollbackTag}`,
    messageId: Number(String(Date.now()).slice(-8)) + 42,
  }
  const event = buildTelegramEvent(input).event
  run(
    `CREATE TEMP TRIGGER project_contract_rollback
     BEFORE INSERT ON projects WHEN NEW.name = '${rollbackTag}'
     BEGIN SELECT RAISE(ABORT, 'project contract rollback'); END`,
  )
  let rejected = false
  try {
    await handleConversationEvent(event, { shouldReply: false })
  } catch {
    rejected = true
  } finally {
    run("DROP TRIGGER IF EXISTS project_contract_rollback")
  }
  assert(rejected, "Project projection failure must reject conversation capture")
  assert(!queryOne("SELECT 1 FROM events WHERE id = ?", [event.id]), "Project projection failure must roll back source Event")
}

function assertProjectPromptIncludes(projectId: string, name: string): void {
  const prompts = buildPrompts({ memoryText: "", recentEvents: [], todoText: "" })
  assert(prompts.projectText.includes(name), "active Project must enter private prompt context")
  assert(prompts.companionSystemPrompt.includes(name), "Companion prompt must receive active Project context")
  assert(prompts.historyText.includes(name), "Analysis context must receive active Project context")
  assert(!prompts.projectText.includes(projectId), "Project prompt context must not expose internal ids")
}

function assertProjectPromptExcludes(name: string): void {
  const prompts = buildPrompts({ memoryText: "", recentEvents: [], todoText: "" })
  assert(!prompts.projectText.includes(name), "non-active Project must be excluded from private prompt context")
}

function assertTodoPromptIncludesProject(projectName: string, title: string): void {
  const prompts = buildPrompts({ memoryText: "", recentEvents: [], projectText: "" })
  assert(prompts.todoText.includes(`[project ${projectName}]`), "Todo context must include its Project name")
  assert(prompts.todoText.includes(title), "Todo context must include linked Todo title")
}

function assertAuditEvent(eventId: string, type: string, marker: string): void {
  const event = queryOne<{ source: string; type: string; payload: string }>(
    "SELECT source, type, payload FROM events WHERE id = ?",
    [eventId],
  )
  assert(event?.type === type, `${type} audit Event type mismatch`)
  assert(event.source === "web" || event.source === "telegram", `${type} audit Event source mismatch`)
  assert(event.payload.includes(marker), `${type} audit Event payload mismatch`)
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

function cleanupContractRows(): void {
  run("DELETE FROM todos WHERE title LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM projects WHERE name LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${contractTag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
