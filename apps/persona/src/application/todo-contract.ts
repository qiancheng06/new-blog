const contractTag = `codex-todo-contract-${Date.now()}`

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const {
  TodoConflictError,
  backfillTodoProjections,
  changeTodoStatus,
  createTodo,
  getTodo,
  getTodos,
  getTodosStatus,
} = await import("./todos.js")
const { buildPrompts } = await import("../ai-runtime/prompts/prompt-builder.js")
const { buildTelegramEvent } = await import("../interface/telegram/events.js")
const { handleConversationEvent } = await import("./conversation.js")
const { insertEvent } = await import("../domain/event/store.js")

initializeDb()

try {
  const baseline = getTodosStatus()
  const created = createTodo({ title: `  ${contractTag}   web task  `, dueDate: "1000-01-01" })
  assert(created.todo.title === `${contractTag} web task`, "web Todo title must be normalized")
  assert(created.todo.due_date === "1000-01-01", "web Todo due date mismatch")
  assert(created.todo.status === "open", "new Todo must be open")
  assert(created.todo.source_event_id === created.event.id, "Todo must retain source Event provenance")
  assert(getTodo(created.todo.id).id === created.todo.id, "Todo must be readable by id")
  assert(
    getTodos({ status: "open", dueBefore: "1000-01-01", limit: 100 }).items.some((todo) => todo.id === created.todo.id),
    "open Todo must be filterable by due date",
  )

  const sourcePayload = JSON.parse(created.event.payload) as { text?: string; due_date?: string }
  assert(created.event.source === "web" && created.event.type === "todo", "web Todo must append a Todo Event")
  assert(sourcePayload.text === `${contractTag} web task`, "Todo Event title mismatch")
  assert(sourcePayload.due_date === "1000-01-01", "Todo Event due date mismatch")
  assert(getTodosStatus().open === baseline.open + 1, "Todo stats must count the new open Todo")
  assertPromptIncludesTodo(created.todo.id, `${contractTag} web task`)

  const completed = changeTodoStatus({
    id: created.todo.id,
    status: "done",
    reason: `${contractTag} completed`,
  })
  assert(completed.event.type === "todo_completed", "completing a Todo must append an audit Event")
  assert(completed.todo.completed_at !== null && completed.todo.cancelled_at === null, "completed Todo timestamps mismatch")
  assert(getTodosStatus().done === baseline.done + 1, "Todo stats must count completed Todos")
  assertPromptExcludesTodo(`${contractTag} web task`)
  assertThrowsConflict(
    () => changeTodoStatus({ id: created.todo.id, status: "done", reason: `${contractTag} duplicate` }),
    "repeating a terminal Todo state must conflict",
  )

  const reopened = changeTodoStatus({
    id: created.todo.id,
    status: "open",
    reason: `${contractTag} reopened`,
  })
  assert(reopened.event.type === "todo_reopened", "reopening a Todo must append an audit Event")
  assert(reopened.todo.completed_at === null && reopened.todo.cancelled_at === null, "reopened Todo must clear terminal timestamps")
  assertPromptIncludesTodo(created.todo.id, `${contractTag} web task`)

  const cancelled = changeTodoStatus({
    id: created.todo.id,
    status: "cancelled",
    reason: `${contractTag} cancelled`,
  })
  assert(cancelled.event.type === "todo_cancelled", "cancelling a Todo must append an audit Event")
  assert(cancelled.todo.cancelled_at !== null && cancelled.todo.completed_at === null, "cancelled Todo timestamps mismatch")
  assertPromptExcludesTodo(`${contractTag} web task`)

  await verifyTelegramProjection()
  await verifyAtomicProjectionRollback()
  verifyHistoricalBackfill()

  console.log("todo lifecycle contract ok")
} finally {
  cleanupContractRows()
}

function verifyHistoricalBackfill(): void {
  const valid = insertEvent({
    source: "web",
    type: "todo",
    payload: { text: `${contractTag} historical task`, due_date: "1000-01-03" },
    timestamp: new Date().toISOString(),
    metadata: {},
  })
  const invalid = insertEvent({
    source: "web",
    type: "todo",
    payload: { text: "", marker: `${contractTag} invalid historical task` },
    timestamp: new Date().toISOString(),
    metadata: {},
  })

  const first = backfillTodoProjections([valid.id, invalid.id])
  assert(first.scanned === 2 && first.created === 1 && first.skipped === 1, "Todo backfill result mismatch")
  assert(
    queryOne("SELECT 1 FROM todos WHERE source_event_id = ?", [valid.id]),
    "Todo backfill must restore a valid historical projection",
  )
  assert(
    !queryOne("SELECT 1 FROM todos WHERE source_event_id = ?", [invalid.id]),
    "Todo backfill must leave an invalid historical Event untouched",
  )

  const replay = backfillTodoProjections([valid.id])
  assert(replay.scanned === 0 && replay.created === 0, "Todo backfill must be idempotent")
}

async function verifyTelegramProjection(): Promise<void> {
  const input = {
    chatId: -Number(String(Date.now()).slice(-10)),
    userId: 2002,
    text: `/todo ${contractTag} telegram task @1000-01-02`,
    messageId: Number(String(Date.now()).slice(-8)) + 31,
  }
  const built = buildTelegramEvent(input)
  const first = await handleConversationEvent(built.event, { shouldReply: built.shouldReply })
  const duplicate = await handleConversationEvent(buildTelegramEvent(input).event, { shouldReply: false })

  assert(first.todo?.title === `${contractTag} telegram task`, "Telegram Todo must create a projection")
  assert(first.todo.due_date === "1000-01-02", "Telegram Todo projection due date mismatch")
  assert(duplicate.duplicate && duplicate.todo?.id === first.todo.id, "Telegram Todo retry must reuse its projection")
  const count = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM todos WHERE source_event_id = ?",
    [first.event.id],
  )
  assert(Number(count?.count) === 1, "Telegram redelivery must leave exactly one Todo projection")
}

async function verifyAtomicProjectionRollback(): Promise<void> {
  const rollbackTag = `${contractTag}-rollback`
  const input = {
    chatId: -Number(String(Date.now()).slice(-10)) - 1,
    userId: 2002,
    text: `/todo ${rollbackTag}`,
    messageId: Number(String(Date.now()).slice(-8)) + 32,
  }
  const event = buildTelegramEvent(input).event
  run(
    `CREATE TEMP TRIGGER todo_contract_rollback
     BEFORE INSERT ON todos WHEN NEW.title = '${rollbackTag}'
     BEGIN SELECT RAISE(ABORT, 'todo contract rollback'); END`,
  )
  let rejected = false
  try {
    await handleConversationEvent(event, { shouldReply: false })
  } catch {
    rejected = true
  } finally {
    run("DROP TRIGGER IF EXISTS todo_contract_rollback")
  }
  assert(rejected, "Todo projection failure must reject conversation capture")
  assert(!queryOne("SELECT 1 FROM events WHERE id = ?", [event.id]), "Todo projection failure must roll back its source Event")
}

function assertPromptIncludesTodo(todoId: string, title: string): void {
  const prompts = buildPrompts({ memoryText: "", recentEvents: [] })
  assert(prompts.todoText.includes(title), "open Todo must enter private prompt context")
  assert(prompts.companionSystemPrompt.includes(title), "Companion prompt must receive open Todo context")
  assert(prompts.historyText.includes(title), "Analysis context must receive open Todo context")
  assert(!prompts.todoText.includes(todoId), "Todo prompt context must not expose internal ids")
}

function assertPromptExcludesTodo(title: string): void {
  const prompts = buildPrompts({ memoryText: "", recentEvents: [] })
  assert(!prompts.todoText.includes(title), "terminal Todo must be excluded from private prompt context")
  assert(!prompts.companionSystemPrompt.includes(title), "terminal Todo must be excluded from Companion prompt")
}

function assertThrowsConflict(action: () => unknown, message: string): void {
  try {
    action()
  } catch (err) {
    assert(err instanceof TodoConflictError, message)
    return
  }
  throw new Error(message)
}

function cleanupContractRows(): void {
  run("DELETE FROM todos WHERE title LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${contractTag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
