const contractTag = `codex-api-contract-${Date.now()}`
const port = Number(process.env.API_PORT) || 3103

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""
process.env.OBSIDIAN_VAULT_PATH = ""

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")
const { applyMemoryPatch } = await import("../domain/memory/store.js")
const { randomUUID } = await import("crypto")

initializeDb()
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  await verifyOptions(port)
  await verifyHealth(port)
  await verifyReady(port)
  await verifyNotFound(port)
  await verifyInvalidChat(port)
  await verifyValidChat(port)
  await verifyIdempotentChat(port)
  await verifyEvents(port)
  await verifyStatus(port)
  await verifyTodos(port)
  await verifyMemoryOverview(port)
  await verifyMemorySearch(port)
  await verifyMemoryTopics(port)
  await verifyMemoryProfile(port)
  await verifyMemoryProfileCorrection(port)
  await verifyMemoryProjectionState(port)
  await verifyMemoryProposals(port)
  await verifyMemoryTimeline(port)
  await verifyMemorySources(port)
  console.log("api contract ok")
} finally {
  cleanupContractRows(contractTag)
  await stopApiServer(server)
}

async function verifyOptions(portNumber: number): Promise<void> {
  const allowedOrigin = "http://127.0.0.1:5173"
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin },
  })
  assert(response.status === 204, `OPTIONS /api/chat expected 204, got ${response.status}`)
  assert(response.headers.get("access-control-allow-origin") === allowedOrigin, "OPTIONS should echo trusted Workspace origin")
  assert(
    response.headers.get("access-control-allow-headers")?.includes("Idempotency-Key"),
    "OPTIONS should allow Idempotency-Key",
  )

  const rejected = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.example" },
  })
  assert(rejected.status === 403, `untrusted OPTIONS expected 403, got ${rejected.status}`)
  assert(rejected.headers.get("access-control-allow-origin") === null, "untrusted origin must not receive CORS access")
}

async function verifyHealth(portNumber: number): Promise<void> {
  const body = await getJson<{
    status?: string
    uptime?: number
    events_today?: number
    background_tasks?: { pending?: number }
    analysis_jobs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
  }>(`http://127.0.0.1:${portNumber}/health`)

  assert(body.status === "ok", "health.status must be ok")
  assert(typeof body.uptime === "number", "health.uptime must be number")
  assert(typeof body.events_today === "number", "health.events_today must be number")
  assert(typeof body.background_tasks?.pending === "number", "health.background_tasks.pending must be number")
  assert(typeof body.analysis_jobs?.pending === "number", "health.analysis_jobs.pending must be number")
  assert(typeof body.analysis_jobs.running === "number", "health.analysis_jobs.running must be number")
  assert(typeof body.analysis_jobs.succeeded === "number", "health.analysis_jobs.succeeded must be number")
  assert(typeof body.analysis_jobs.failed === "number", "health.analysis_jobs.failed must be number")
}

async function verifyReady(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/ready`)
  assert(response.status === 200, `ready expected 200, got ${response.status}`)
  const body = await response.json() as {
    status?: string
    components?: RuntimeComponents
  }

  assert(body.status === "ready", "ready.status must be ready")
  verifyRuntimeComponents(body.components, "ready")
}

async function verifyNotFound(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/missing`)
  assert(response.status === 404, `missing route expected 404, got ${response.status}`)
  const body = await response.json() as { error?: string }
  assert(body.error === "not found", "missing route error must be not found")
}

async function verifyInvalidChat(portNumber: number): Promise<void> {
  const rejectedTag = `${contractTag}-rejected-body`

  const wrongContentType = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    body: JSON.stringify({ text: rejectedTag }),
  })
  assert(wrongContentType.status === 415, `wrong content type expected 415, got ${wrongContentType.status}`)
  assert(
    (await wrongContentType.json() as { error?: string }).error === "content-type must be application/json",
    "wrong content type error mismatch",
  )

  const invalidJson = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  })
  assert(invalidJson.status === 400, `invalid JSON expected 400, got ${invalidJson.status}`)
  assert((await invalidJson.json() as { error?: string }).error === "invalid json", "invalid JSON error mismatch")

  for (const invalidShape of [null, [], "text", 42]) {
    const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidShape),
    })
    assert(response.status === 400, `non-object JSON expected 400, got ${response.status}`)
    assert((await response.json() as { error?: string }).error === "json object required", "JSON object error mismatch")
  }

  const oversized = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${rejectedTag}${"x".repeat(70 * 1024)}` }),
  })
  assert(oversized.status === 413, `oversized JSON expected 413, got ${oversized.status}`)
  assert((await oversized.json() as { error?: string }).error === "request body too large", "oversized body error mismatch")

  const missingText = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  })
  assert(missingText.status === 400, `missing text expected 400, got ${missingText.status}`)
  assert((await missingText.json() as { error?: string }).error === "text is required", "missing text error mismatch")

  const rejectedEvent = queryOne<{ id: string }>("SELECT id FROM events WHERE payload LIKE ?", [`%${rejectedTag}%`])
  assert(!rejectedEvent, "rejected request bodies must not create Events")
}

async function verifyValidChat(portNumber: number): Promise<void> {
  const evaluationRunId = `${contractTag}-eval`
  const body = await postJson<{
    reply?: string
    eventId?: string
    replyEventId?: string
    duplicate?: boolean
    conversationJobId?: string
    conversationJobStatus?: string
  }>(`http://127.0.0.1:${portNumber}/api/chat`, { text: contractTag, page: "api-contract", evaluationRunId })

  assert(typeof body.reply === "string" && body.reply.includes(contractTag), "chat.reply must include mock tag")
  assert(typeof body.eventId === "string" && body.eventId.length > 0, "chat.eventId must be non-empty string")
  assert(typeof body.replyEventId === "string" && body.replyEventId.length > 0, "chat.replyEventId must be non-empty string")
  assert(body.duplicate === false, "first chat request must not be duplicate")
  assert(typeof body.conversationJobId === "string", "chat.conversationJobId must be string")
  assert(body.conversationJobStatus === "succeeded", "chat conversation job must succeed")

  const event = queryOne<{ metadata: string }>("SELECT metadata FROM events WHERE id = ?", [body.eventId])
  assert(event, "chat event should exist")
  const metadata = JSON.parse(event.metadata) as { purpose?: string; run_id?: string }
  assert(metadata.purpose === "real_mode_evaluation", "evaluation metadata purpose mismatch")
  assert(metadata.run_id === evaluationRunId, "evaluation metadata run_id mismatch")

  const replyEvent = queryOne<{ source: string; type: string; payload: string; metadata: string }>(
    "SELECT source, type, payload, metadata FROM events WHERE id = ?",
    [body.replyEventId],
  )
  assert(replyEvent, "chat reply event should exist")
  assert(replyEvent.source === "system", "chat reply event source must be system")
  assert(replyEvent.type === "companion_reply", "chat reply event type must be companion_reply")
  const replyPayload = JSON.parse(replyEvent.payload) as { text?: string; in_reply_to?: string }
  assert(replyPayload.text === body.reply, "chat reply event text must equal the response reply")
  assert(replyPayload.in_reply_to === body.eventId, "chat reply event payload must link to the input event")
  const replyMetadata = JSON.parse(replyEvent.metadata) as {
    purpose?: string
    visibility?: string
    in_reply_to?: string
    run_id?: string
  }
  assert(replyMetadata.purpose === "conversation_output", "chat reply event purpose mismatch")
  assert(replyMetadata.visibility === "user", "chat reply event visibility mismatch")
  assert(replyMetadata.in_reply_to === body.eventId, "chat reply event metadata must link to the input event")
  assert(replyMetadata.run_id === evaluationRunId, "chat reply event run_id mismatch")
}

async function verifyIdempotentChat(portNumber: number): Promise<void> {
  const requestId = `${contractTag}-idempotent`
  const text = `${contractTag}-idempotent-message`
  const first = await postJson<{
    reply?: string
    eventId?: string
    replyEventId?: string
    duplicate?: boolean
    conversationJobId?: string
  }>(`http://127.0.0.1:${portNumber}/api/chat`, { text, requestId })
  const replay = await postJson<typeof first>(`http://127.0.0.1:${portNumber}/api/chat`, { text, requestId })

  assert(first.duplicate === false, "first idempotent chat must not be duplicate")
  assert(replay.duplicate === true, "replayed idempotent chat must be duplicate")
  assert(replay.eventId === first.eventId, "idempotent replay event id mismatch")
  assert(replay.replyEventId === first.replyEventId, "idempotent replay reply event id mismatch")
  assert(replay.conversationJobId === first.conversationJobId, "idempotent replay job id mismatch")
  assert(replay.reply === first.reply, "idempotent replay must return the stored reply")

  const conflict = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${text}-changed`, requestId }),
  })
  assert(conflict.status === 409, `idempotency conflict expected 409, got ${conflict.status}`)
  assert((await conflict.json() as { error?: string }).error === "idempotency key conflict", "idempotency conflict error mismatch")

  const mismatch = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `${requestId}-header`,
    },
    body: JSON.stringify({ text, requestId: `${requestId}-body` }),
  })
  assert(mismatch.status === 400, `idempotency key mismatch expected 400, got ${mismatch.status}`)

  const headerOnly = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `${requestId}-header-only`,
    },
    body: JSON.stringify({ text: `${text}-header-only` }),
  })
  assert(headerOnly.status === 200, `header-only idempotent chat expected 200, got ${headerOnly.status}`)
  const headerBody = await headerOnly.json() as { duplicate?: boolean; conversationJobId?: string }
  assert(headerBody.duplicate === false, "header-only first chat must not be duplicate")
  assert(typeof headerBody.conversationJobId === "string", "header-only chat must create a Conversation job")

  const invalidRequestId = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, requestId: 42 }),
  })
  assert(invalidRequestId.status === 400, `non-string requestId expected 400, got ${invalidRequestId.status}`)

  const jobs = await getJson<{
    items?: Array<{ id?: string; sourceEventId?: string; status?: string; replyEventId?: string | null }>
  }>(`http://127.0.0.1:${portNumber}/api/conversation-jobs?status=succeeded&limit=100`)
  const job = jobs.items?.find((item) => item.id === first.conversationJobId)
  assert(job?.sourceEventId === first.eventId, "conversation job source event mismatch")
  assert(job?.status === "succeeded", "conversation job list status mismatch")
  assert(job.replyEventId === first.replyEventId, "conversation job reply event mismatch")

  const retrySucceeded = await fetch(
    `http://127.0.0.1:${portNumber}/api/conversation-jobs/${first.conversationJobId}/retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  )
  assert(retrySucceeded.status === 409, `succeeded conversation retry expected 409, got ${retrySucceeded.status}`)
}

async function verifyEvents(portNumber: number): Promise<void> {
  const body = await getJson<{ events?: unknown[] }>(`http://127.0.0.1:${portNumber}/api/events`)
  assert(Array.isArray(body.events), "events.events must be array")
}

async function verifyStatus(portNumber: number): Promise<void> {
  const body = await getJson<{
    status?: string
    ready?: boolean
    components?: RuntimeComponents
    uptime?: number
    events_today?: number
    background_tasks?: { pending?: number }
    analysis_jobs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
    conversation_jobs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
    memory?: { topics?: number; profile?: number; timelineEvents?: number; pendingProposals?: number }
    todos?: { open?: number; done?: number; cancelled?: number; overdue?: number; dueToday?: number }
    recent_events?: Array<{ id?: string; source?: string; type?: string; timestamp?: string; preview?: string }>
  }>(`http://127.0.0.1:${portNumber}/api/status`)

  assert(body.status === "ok" || body.status === "degraded", "status.status must be ok or degraded")
  assert(body.ready === true, "status.ready must be true")
  verifyRuntimeComponents(body.components, "status")
  assert(typeof body.uptime === "number", "status.uptime must be number")
  assert(typeof body.events_today === "number", "status.events_today must be number")
  assert(typeof body.background_tasks?.pending === "number", "status.background_tasks.pending must be number")
  assert(typeof body.analysis_jobs?.failed === "number", "status.analysis_jobs.failed must be number")
  assert(typeof body.conversation_jobs?.failed === "number", "status.conversation_jobs.failed must be number")
  assert(typeof body.memory?.topics === "number", "status.memory.topics must be number")
  assert(typeof body.memory?.profile === "number", "status.memory.profile must be number")
  assert(typeof body.memory?.timelineEvents === "number", "status.memory.timelineEvents must be number")
  assert(typeof body.memory.pendingProposals === "number", "status.memory.pendingProposals must be number")
  assert(typeof body.todos?.open === "number", "status.todos.open must be number")
  assert(typeof body.todos.done === "number", "status.todos.done must be number")
  assert(typeof body.todos.cancelled === "number", "status.todos.cancelled must be number")
  assert(typeof body.todos.overdue === "number", "status.todos.overdue must be number")
  assert(typeof body.todos.dueToday === "number", "status.todos.dueToday must be number")
  assert(Array.isArray(body.recent_events), "status.recent_events must be array")

  for (const event of body.recent_events) {
    assert(typeof event.id === "string", "recent event id must be string")
    assert(typeof event.source === "string", "recent event source must be string")
    assert(typeof event.type === "string", "recent event type must be string")
    assert(typeof event.timestamp === "string", "recent event timestamp must be string")
    assert(typeof event.preview === "string", "recent event preview must be string")
  }
}

async function verifyTodos(portNumber: number): Promise<void> {
  const endpoint = `http://127.0.0.1:${portNumber}/api/todos`
  for (const body of [
    {},
    { title: { value: `${contractTag}-invalid-title` } },
    { title: `${contractTag}-invalid-due`, dueDate: { value: "2099-04-01" } },
    { title: `${contractTag}-invalid-date`, dueDate: "2099-02-30" },
  ]) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    assert(response.status === 400, `invalid Todo create expected 400, got ${response.status}`)
  }

  const created = await postJson<{
    eventId?: string
    todo?: TodoContractRow
  }>(endpoint, { title: `  ${contractTag} API task  `, dueDate: "2099-04-01" })
  assert(typeof created.eventId === "string", "Todo create eventId must be string")
  assert(typeof created.todo?.id === "string", "Todo create id must be string")
  assert(created.todo.title === `${contractTag} API task`, "Todo create title must be normalized")
  assert(created.todo.due_date === "2099-04-01", "Todo create due date mismatch")
  assert(created.todo.status === "open", "Todo create status must be open")
  assert(created.todo.source_event_id === created.eventId, "Todo create must expose Event provenance")

  const source = queryOne<{ source: string; type: string; payload: string }>(
    "SELECT source, type, payload FROM events WHERE id = ?",
    [created.eventId],
  )
  assert(source?.source === "web" && source.type === "todo", "Todo create must append a web Todo Event")
  assert(JSON.parse(source.payload).text === `${contractTag} API task`, "Todo source Event payload mismatch")

  const page = await getJson<{ items?: TodoContractRow[]; limit?: number; offset?: number }>(
    `${endpoint}?status=open&dueBefore=2099-04-01&limit=500&offset=0`,
  )
  assert(page.limit === 100 && page.offset === 0, "Todo list must normalize pagination")
  assert(page.items?.some((todo) => todo.id === created.todo?.id), "Todo list filters must include matching Todo")

  const detail = await getJson<{ todo?: TodoContractRow }>(`${endpoint}/${created.todo.id}`)
  assert(detail.todo?.id === created.todo.id, "Todo detail id mismatch")

  for (const path of ["?status=running", "?dueBefore=2099-02-30"]) {
    const response = await fetch(`${endpoint}${path}`)
    assert(response.status === 400, `invalid Todo list filter expected 400, got ${response.status}`)
  }
  const missing = await fetch(`${endpoint}/missing-todo`)
  assert(missing.status === 404, `missing Todo expected 404, got ${missing.status}`)

  for (const body of [
    { status: "done" },
    { status: "running", reason: `${contractTag} invalid status` },
    { status: { value: "done" }, reason: `${contractTag} invalid shape` },
    { status: "done", reason: { value: `${contractTag} invalid reason` } },
  ]) {
    const response = await fetch(`${endpoint}/${created.todo.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    assert(response.status === 400, `invalid Todo state expected 400, got ${response.status}`)
  }

  const completed = await postJson<{ eventId?: string; todo?: TodoContractRow }>(
    `${endpoint}/${created.todo.id}/state`,
    { status: "done", reason: `${contractTag} completed through API` },
  )
  assert(completed.todo?.status === "done" && completed.todo.completed_at, "Todo completion response mismatch")
  assertTodoAuditEvent(completed.eventId, "todo_completed", `${contractTag} completed through API`)

  const duplicateCompletion = await fetch(`${endpoint}/${created.todo.id}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done", reason: `${contractTag} duplicate completion` }),
  })
  assert(duplicateCompletion.status === 409, `duplicate Todo completion expected 409, got ${duplicateCompletion.status}`)

  const reopened = await postJson<{ eventId?: string; todo?: TodoContractRow }>(
    `${endpoint}/${created.todo.id}/state`,
    { status: "open", reason: `${contractTag} reopened through API` },
  )
  assert(reopened.todo?.status === "open" && reopened.todo.completed_at === null, "Todo reopen response mismatch")
  assertTodoAuditEvent(reopened.eventId, "todo_reopened", `${contractTag} reopened through API`)

  const cancelled = await postJson<{ eventId?: string; todo?: TodoContractRow }>(
    `${endpoint}/${created.todo.id}/state`,
    { status: "cancelled", reason: `${contractTag} cancelled through API` },
  )
  assert(cancelled.todo?.status === "cancelled" && cancelled.todo.cancelled_at, "Todo cancellation response mismatch")
  assertTodoAuditEvent(cancelled.eventId, "todo_cancelled", `${contractTag} cancelled through API`)
}

interface TodoContractRow {
  id: string
  source_event_id: string
  title: string
  due_date: string | null
  status: "open" | "done" | "cancelled"
  completed_at: string | null
  cancelled_at: string | null
}

function assertTodoAuditEvent(eventId: string | undefined, type: string, reason: string): void {
  assert(typeof eventId === "string", `${type} Event id must be string`)
  const event = queryOne<{ source: string; type: string; payload: string }>(
    "SELECT source, type, payload FROM events WHERE id = ?",
    [eventId],
  )
  assert(event?.source === "web" && event.type === type, `${type} audit Event mismatch`)
  assert(JSON.parse(event.payload).reason === reason, `${type} audit reason mismatch`)
}

interface RuntimeComponents {
  database?: { status?: string }
  llm?: { status?: string; provider?: string; mode?: string }
  telegram?: { status?: string }
  obsidian?: { status?: string }
  analysis?: {
    status?: string
    jobs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
  }
  conversation?: {
    status?: string
    jobs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
  }
  daily_summary?: {
    status?: string
    targetDate?: string | null
    lastCompletedDate?: string | null
    nextRunAt?: string | null
    failureCount?: number
    runs?: { pending?: number; running?: number; succeeded?: number; failed?: number }
  }
  background_tasks?: { status?: string; pending?: number }
}

function verifyRuntimeComponents(components: RuntimeComponents | undefined, route: string): void {
  assert(components?.database?.status === "ok", `${route} database component must be ok`)
  assert(components.llm?.status === "ok", `${route} LLM component must be ok`)
  assert(components.llm.provider === "mock", `${route} LLM provider must be mock`)
  assert(components.llm.mode === "mock", `${route} LLM mode must be mock`)
  assert(components.telegram?.status === "disabled", `${route} Telegram component must be disabled`)
  assert(components.obsidian?.status === "disabled", `${route} Obsidian component must be disabled`)
  assert(typeof components.analysis?.jobs?.failed === "number", `${route} Analysis failed count must be number`)
  assert(typeof components.conversation?.jobs?.failed === "number", `${route} Conversation failed count must be number`)
  assert(components.daily_summary?.status === "disabled", `${route} Daily Summary scheduler must be disabled`)
  assert(typeof components.daily_summary.failureCount === "number", `${route} Daily Summary failure count must be number`)
  assert(typeof components.daily_summary.runs?.failed === "number", `${route} Daily Summary failed run count must be number`)
  assert(typeof components.background_tasks?.pending === "number", `${route} background pending count must be number`)
}

async function verifyMemoryOverview(portNumber: number): Promise<void> {
  const body = await getJson<{
    stats?: { topics?: number; profile?: number; timelineEvents?: number; pendingProposals?: number }
    topics?: unknown[]
    profile?: unknown[]
    timelineEvents?: unknown[]
  }>(`http://127.0.0.1:${portNumber}/api/memory?topicLimit=5&profileLimit=5&timelineLimit=5`)

  assert(typeof body.stats?.topics === "number", "memory.stats.topics must be number")
  assert(typeof body.stats.profile === "number", "memory.stats.profile must be number")
  assert(typeof body.stats.timelineEvents === "number", "memory.stats.timelineEvents must be number")
  assert(typeof body.stats.pendingProposals === "number", "memory.stats.pendingProposals must be number")
  assert(Array.isArray(body.topics), "memory.topics must be array")
  assert(Array.isArray(body.profile), "memory.profile must be array")
  assert(Array.isArray(body.timelineEvents), "memory.timelineEvents must be array")
}

async function verifyMemorySearch(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{
      entityType?: string
      entityId?: string
      title?: string
      text?: string
      sourceEventId?: string | null
      date?: string | null
    }>
    limit?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/search?q=${encodeURIComponent(contractTag)}&limit=999`)

  assert(body.limit === 50, "memory search limit must be clamped to 50")
  assert(Array.isArray(body.items) && body.items.length > 0, "memory search must return indexed contract Memory")
  for (const item of body.items) {
    assert(
      item.entityType === "profile" || item.entityType === "topic" ||
      item.entityType === "timeline" || item.entityType === "daily_note",
      "memory search entity type mismatch",
    )
    assert(typeof item.entityId === "string" && item.entityId.length > 0, "memory search entity id missing")
    assert(typeof item.title === "string" && typeof item.text === "string", "memory search text shape mismatch")
  }

  const missing = await fetch(`http://127.0.0.1:${portNumber}/api/memory/search`)
  assert(missing.status === 400, `missing memory search query expected 400, got ${missing.status}`)
  const tooLong = await fetch(
    `http://127.0.0.1:${portNumber}/api/memory/search?q=${encodeURIComponent("x".repeat(501))}`,
  )
  assert(tooLong.status === 400, `oversized memory search query expected 400, got ${tooLong.status}`)
}

async function verifyMemoryTopics(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{ id?: string; name?: string; summary?: string; message_count?: number }>
    limit?: number
    offset?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}&limit=999&offset=-1`)

  assert(body.limit === 100, "memory topics limit must be clamped to 100")
  assert(body.offset === 0, "memory topics offset must normalize to 0")
  assert(Array.isArray(body.items), "memory topics items must be array")
  assert(body.items.some((item) => item.name === contractTag), "memory topics should include contract topic")
}

async function verifyMemoryProfile(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{ id?: string; key?: string; value?: string; source_event_id?: string | null; updated_at?: string }>
    limit?: number
    offset?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile?key=last_mock_message&limit=20&offset=0`)

  assert(body.limit === 20, "memory profile limit mismatch")
  assert(body.offset === 0, "memory profile offset mismatch")
  assert(Array.isArray(body.items), "memory profile items must be array")
  const item = body.items.find((row) => row.key === "last_mock_message" && typeof row.value === "string" && row.value.includes(contractTag))
  assert(item, "memory profile should include last_mock_message contract row")
  assert(typeof item.id === "string", "memory profile item id must be string")
  assert(typeof item.updated_at === "string", "memory profile updated_at must be string")
}

async function verifyMemoryProfileCorrection(portNumber: number): Promise<void> {
  const invalidJson = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  })
  assert(invalidJson.status === 400, `invalid profile correction JSON expected 400, got ${invalidJson.status}`)

  const missingKey = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "   ", value: "ignored" }),
  })
  assert(missingKey.status === 400, `missing profile correction key expected 400, got ${missingKey.status}`)

  const key = `contract_profile_correction_${contractTag}`
  const body = await postJson<{
    eventId?: string
    profile?: { id?: string; key?: string; value?: string; source_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    key,
    value: { mode: "correction", tag: contractTag },
    reason: "api contract correction",
  })

  assert(typeof body.eventId === "string" && body.eventId.length > 0, "profile correction eventId must be string")
  assert(body.profile?.key === key, "profile correction key mismatch")
  assert(typeof body.profile.value === "string" && body.profile.value.includes(contractTag), "profile correction value mismatch")
  assert(body.profile.source_event_id === body.eventId, "profile correction source_event_id must point to correction event")

  const event = queryOne<{ type: string; payload: string; metadata: string }>("SELECT type, payload, metadata FROM events WHERE id = ?", [body.eventId])
  assert(event, "profile correction event should exist")
  assert(event.type === "memory_profile_correction", "profile correction event type mismatch")
  assert(event.payload.includes(key), "profile correction event payload should include key")
  const metadata = JSON.parse(event.metadata) as { purpose?: string }
  assert(metadata.purpose === "memory_governance", "profile correction event metadata purpose mismatch")
}

async function verifyMemoryProjectionState(portNumber: number): Promise<void> {
  const profileKey = `contract_state_profile_${contractTag}`
  const correction = await postJson<{
    eventId?: string
    profile?: { id?: string; key?: string; state?: string; source_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    key: profileKey,
    value: { tag: contractTag, state: "active" },
    reason: `state setup ${contractTag}`,
  })

  const profileId = correction.profile?.id
  assert(typeof profileId === "string", "state correction profile id must be string")
  assert(correction.profile?.state === "active", "new profile correction must be active")

  const invalidProfileState = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: profileId, state: "deleted", reason: "invalid" }),
  })
  assert(invalidProfileState.status === 400, `invalid profile state expected 400, got ${invalidProfileState.status}`)

  const missingProfile = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000000", state: "suppressed", reason: "missing target" }),
  })
  assert(missingProfile.status === 404, `missing profile state target expected 404, got ${missingProfile.status}`)

  const suppressedProfile = await postJson<{
    eventId?: string
    profile?: { id?: string; key?: string; state?: string; state_event_id?: string | null; state_reason?: string }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    id: profileId,
    state: "suppressed",
    reason: `contract suppress ${contractTag}`,
  })

  assert(typeof suppressedProfile.eventId === "string", "suppressed profile eventId must be string")
  assert(suppressedProfile.profile?.state === "suppressed", "profile state should be suppressed")
  assert(suppressedProfile.profile.state_event_id === suppressedProfile.eventId, "profile state_event_id mismatch")

  const suppressedDefault = await getJson<{ items?: Array<{ id?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/profile?key=${encodeURIComponent(profileKey)}`
  )
  assert(Array.isArray(suppressedDefault.items), "suppressed default profile items must be array")
  assert(!suppressedDefault.items.some((item) => item.id === profileId), "suppressed profile must be hidden from default list")

  const suppressedList = await getJson<{ items?: Array<{ id?: string; state?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/profile?key=${encodeURIComponent(profileKey)}&state=suppressed`
  )
  assert(suppressedList.items?.some((item) => item.id === profileId && item.state === "suppressed"), "state=suppressed must include suppressed profile")

  await postJson(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    key: profileKey,
    value: { tag: contractTag, state: "updated while suppressed" },
    reason: `upsert should not revive ${contractTag}`,
  })
  const stillHidden = await getJson<{ items?: Array<{ id?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/profile?key=${encodeURIComponent(profileKey)}`
  )
  assert(!stillHidden.items?.some((item) => item.id === profileId), "profile correction must not revive suppressed profile")

  const restoredProfile = await postJson<{
    eventId?: string
    profile?: { id?: string; state?: string; state_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    id: profileId,
    state: "active",
    reason: `contract restore ${contractTag}`,
  })
  assert(restoredProfile.profile?.state === "active", "restored profile must be active")
  assert(restoredProfile.profile.state_event_id === restoredProfile.eventId, "restored profile state_event_id mismatch")

  const topicList = await getJson<{ items?: Array<{ id?: string; name?: string; state?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}&state=all`
  )
  const topic = topicList.items?.find((item) => item.name === contractTag)
  assert(typeof topic?.id === "string", "state contract topic id must be string")

  const archivedTopic = await postJson<{
    eventId?: string
    topic?: { id?: string; state?: string; state_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/topics/state`, {
    id: topic.id,
    state: "archived",
    reason: `contract archive topic ${contractTag}`,
  })
  assert(archivedTopic.topic?.state === "archived", "topic state should be archived")
  assert(archivedTopic.topic.state_event_id === archivedTopic.eventId, "topic state_event_id mismatch")

  const hiddenTopic = await getJson<{ items?: Array<{ id?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}`
  )
  assert(!hiddenTopic.items?.some((item) => item.id === topic.id), "archived topic must be hidden from default list")

  const archivedTopicList = await getJson<{ items?: Array<{ id?: string; state?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}&state=archived`
  )
  assert(archivedTopicList.items?.some((item) => item.id === topic.id && item.state === "archived"), "state=archived must include archived topic")

  await postJson(`http://127.0.0.1:${portNumber}/api/memory/topics/state`, {
    id: topic.id,
    state: "active",
    reason: `contract restore topic ${contractTag}`,
  })

  const profileEvent = queryOne<{ type: string; metadata: string }>("SELECT type, metadata FROM events WHERE id = ?", [suppressedProfile.eventId])
  assert(profileEvent?.type === "memory_profile_suppression", "profile suppression event type mismatch")
  assert((JSON.parse(profileEvent.metadata) as { purpose?: string }).purpose === "memory_governance", "profile suppression metadata mismatch")

  const topicEvent = queryOne<{ type: string; metadata: string }>("SELECT type, metadata FROM events WHERE id = ?", [archivedTopic.eventId])
  assert(topicEvent?.type === "memory_topic_suppression", "topic archive event type mismatch")
  assert((JSON.parse(topicEvent.metadata) as { purpose?: string }).purpose === "memory_governance", "topic archive metadata mismatch")
}


async function verifyMemoryProposals(portNumber: number): Promise<void> {
  const acceptedKey = `contract_proposal_accept_${contractTag}`
  const rejectedKey = `contract_proposal_reject_${contractTag}`
  const acceptedSourceEventId = randomUUID()
  const rejectedSourceEventId = randomUUID()

  for (const [id, text] of [
    [acceptedSourceEventId, `${contractTag}-proposal-accept-source`],
    [rejectedSourceEventId, `${contractTag}-proposal-reject-source`],
  ]) {
    run(
      `INSERT INTO events (id, source, type, payload, timestamp, metadata)
       VALUES (?, 'web', 'message', ?, datetime('now'), '{}')`,
      [id, JSON.stringify({ text })],
    )
  }

  const acceptedWrite = applyMemoryPatch({
    profile_updates: [{
      key: acceptedKey,
      value: { preference: contractTag },
      confidence: 0.82,
      cooling_required: true,
    }],
    topic_updates: [],
    timeline_events: [],
  }, { sourceEventId: acceptedSourceEventId })
  const rejectedWrite = applyMemoryPatch({
    profile_updates: [{
      key: rejectedKey,
      value: `reject-${contractTag}`,
      confidence: 0.61,
      cooling_required: true,
    }],
    topic_updates: [],
    timeline_events: [],
  }, { sourceEventId: rejectedSourceEventId })

  const acceptedProposal = acceptedWrite.proposals[0]
  const rejectedProposal = rejectedWrite.proposals[0]
  assert(acceptedProposal?.status === "pending", "cooled Profile update must create a pending proposal")
  assert(rejectedProposal?.status === "pending", "second cooled Profile update must create a pending proposal")
  assert(acceptedWrite.profile.length === 0, "pending proposal must not write Profile")
  assert(!queryOne("SELECT id FROM profile WHERE key = ?", [acceptedKey]), "pending value must stay outside Profile")
  const beforeReviewSearch = await getJson<{
    items?: Array<{ entityType?: string; title?: string }>
  }>(`http://127.0.0.1:${portNumber}/api/memory/search?q=${encodeURIComponent(acceptedKey)}`)
  assert(
    !beforeReviewSearch.items?.some((item) => item.entityType === "profile" && item.title === acceptedKey),
    "pending proposal must stay outside search API",
  )

  const pending = await getJson<{
    items?: Array<{ id?: string; source_event_id?: string; status?: string; proposal_key?: string }>
    limit?: number
    offset?: number
  }>(
    `http://127.0.0.1:${portNumber}/api/memory/proposals?status=pending&sourceEventId=${acceptedSourceEventId}&limit=999&offset=-2`,
  )
  assert(pending.limit === 100 && pending.offset === 0, "memory proposal paging must normalize")
  assert(
    pending.items?.some((item) => item.id === acceptedProposal.id && item.proposal_key === acceptedKey),
    "pending proposal API must filter by source Event",
  )

  const invalidStatus = await fetch(`http://127.0.0.1:${portNumber}/api/memory/proposals?status=running`)
  assert(invalidStatus.status === 400, `invalid proposal status expected 400, got ${invalidStatus.status}`)

  const missingReason = await fetch(
    `http://127.0.0.1:${portNumber}/api/memory/proposals/${acceptedProposal.id}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accept", reason: "" }),
    },
  )
  assert(missingReason.status === 400, `proposal review without reason expected 400, got ${missingReason.status}`)

  const accepted = await postJson<{
    eventId?: string
    proposal?: { id?: string; status?: string; review_event_id?: string }
    profile?: { key?: string; value?: string; source_event_id?: string }
  }>(`http://127.0.0.1:${portNumber}/api/memory/proposals/${acceptedProposal.id}/review`, {
    decision: "accept",
    reason: `confirmed during ${contractTag}`,
  })
  assert(accepted.proposal?.status === "accepted", "accepted proposal status mismatch")
  assert(accepted.proposal.review_event_id === accepted.eventId, "accepted proposal must reference review Event")
  assert(accepted.profile?.key === acceptedKey, "accepted proposal must write Profile key")
  assert(accepted.profile.source_event_id === accepted.eventId, "accepted Profile must reference review Event")
  assert(accepted.profile.value?.includes(contractTag), "accepted Profile must preserve proposed value")
  const afterReviewSearch = await getJson<{
    items?: Array<{ entityType?: string; title?: string }>
  }>(`http://127.0.0.1:${portNumber}/api/memory/search?q=${encodeURIComponent(acceptedKey)}`)
  assert(
    afterReviewSearch.items?.some((item) => item.entityType === "profile" && item.title === acceptedKey),
    "accepted proposal must become visible to search API",
  )

  const repeatedReview = await fetch(
    `http://127.0.0.1:${portNumber}/api/memory/proposals/${acceptedProposal.id}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject", reason: `repeat ${contractTag}` }),
    },
  )
  assert(repeatedReview.status === 409, `repeated proposal review expected 409, got ${repeatedReview.status}`)

  const rejected = await postJson<{
    eventId?: string
    proposal?: { status?: string; review_event_id?: string }
    profile?: unknown
  }>(`http://127.0.0.1:${portNumber}/api/memory/proposals/${rejectedProposal.id}/review`, {
    decision: "reject",
    reason: `not stable during ${contractTag}`,
  })
  assert(rejected.proposal?.status === "rejected", "rejected proposal status mismatch")
  assert(rejected.proposal.review_event_id === rejected.eventId, "rejected proposal must reference review Event")
  assert(rejected.profile === null, "rejected proposal must not return a Profile row")
  assert(!queryOne("SELECT id FROM profile WHERE key = ?", [rejectedKey]), "rejected proposal must not write Profile")

  const acceptedEvent = queryOne<{ type: string; metadata: string }>(
    "SELECT type, metadata FROM events WHERE id = ?",
    [accepted.eventId],
  )
  assert(acceptedEvent?.type === "memory_proposal_accepted", "proposal accept Event type mismatch")
  assert(
    (JSON.parse(acceptedEvent.metadata) as { purpose?: string }).purpose === "memory_governance",
    "proposal review Event metadata mismatch",
  )
}

async function verifyMemoryTimeline(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{ id?: string; date?: string; type?: string; summary?: string; source_event_id?: string | null }>
    limit?: number
    offset?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/timeline?type=insight&limit=20&offset=0`)

  assert(body.limit === 20, "memory timeline limit mismatch")
  assert(body.offset === 0, "memory timeline offset mismatch")
  assert(Array.isArray(body.items), "memory timeline items must be array")
  const item = body.items.find((row) => row.type === "insight" && typeof row.summary === "string" && row.summary.includes(contractTag))
  assert(item, "memory timeline should include contract insight row")
  assert(typeof item.id === "string", "memory timeline item id must be string")
  assert(typeof item.date === "string", "memory timeline item date must be string")
}

async function verifyMemorySources(portNumber: number): Promise<void> {
  const body = await getJson<{
    profileWithSource?: number
    profileMissingSource?: number
    timelineWithSource?: number
    timelineMissingSource?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/sources`)

  assert(typeof body.profileWithSource === "number", "memory sources profileWithSource must be number")
  assert(typeof body.profileMissingSource === "number", "memory sources profileMissingSource must be number")
  assert(typeof body.timelineWithSource === "number", "memory sources timelineWithSource must be number")
  assert(typeof body.timelineMissingSource === "number", "memory sources timelineMissingSource must be number")
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as T
}

async function postJson<T>(url: string, data: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as T
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await delay(100)
  }
  throw new Error("api server did not become healthy")
}

function cleanupContractRows(tag: string): void {
  run("DELETE FROM todos WHERE title LIKE ?", [`%${tag}%`])
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${tag}%`])
  run("DELETE FROM profile WHERE key LIKE ?", [`contract_profile_correction_${tag}%`])
  run("DELETE FROM profile WHERE key LIKE ?", [`contract_state_profile_${tag}%`])
  run("DELETE FROM profile WHERE key LIKE ?", [`contract_proposal_%_${tag}%`])
  run("DELETE FROM topics WHERE name LIKE ? OR summary LIKE ?", [`%${tag}%`, `%${tag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
