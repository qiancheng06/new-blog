const contractTag = `codex-capture-contract-${Date.now()}`

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const { drainBackgroundTasks } = await import("./background-tasks.js")
const {
  createCapture,
  getCapture,
  getCaptures,
  getCapturesStatus,
} = await import("./captures.js")
const { handleConversationEvent } = await import("./conversation.js")
const { buildTelegramEvent } = await import("../interface/telegram/events.js")
const { createWebCaptureEventId } = await import("../domain/event/types.js")
const { EventIdentityConflictError } = await import("../domain/event/store.js")

initializeDb()

const profileSnapshot = queryOne<ProfileSnapshot>("SELECT * FROM profile WHERE key = 'last_mock_message'")
const baseline = getCapturesStatus()

try {
  const requestId = `${contractTag} request`
  const first = await createCapture({
    type: "note",
    text: `  ${contractTag} durable note  `,
    requestId,
  })
  assert(!first.duplicate, "first Web Capture must be accepted")
  assert(first.capture.type === "note" && first.capture.source === "web", "Web Capture identity mismatch")
  assert(first.capture.text === `${contractTag} durable note`, "Capture text must be normalized")
  assert(first.capture.analysis?.status === "running", "new Capture must start a durable Analysis job")
  assertNoConversationReply(first.capture.id)

  const duplicate = await createCapture({
    type: "note",
    text: `${contractTag} durable note`,
    requestId,
  })
  assert(duplicate.duplicate, "Web Capture replay must be idempotent")
  assert(duplicate.capture.id === first.capture.id, "Web Capture replay must reuse the Event")
  assert(duplicate.capture.analysis?.jobId === first.capture.analysis.jobId, "Capture replay must reuse Analysis job")
  await assertRejects(
    () => createCapture({
      type: "note",
      text: `${contractTag} changed note`,
      requestId,
    }),
    EventIdentityConflictError,
    "changed Web Capture replay must conflict",
  )

  const idea = await createCapture({
    type: "idea",
    text: `${contractTag} possible direction`,
  })
  const journal = await createCapture({
    type: "journal",
    text: `${contractTag} daily reflection`,
  })
  assert(idea.capture.type === "idea" && journal.capture.type === "journal", "Capture types must be preserved")

  const telegramInput = {
    chatId: -Number(String(Date.now()).slice(-10)) - 71,
    userId: 2002,
    text: `/note ${contractTag} telegram note`,
    messageId: Number(String(Date.now()).slice(-8)) + 71,
  }
  const built = buildTelegramEvent(telegramInput)
  const telegram = await handleConversationEvent(built.event, { shouldReply: built.shouldReply })
  const telegramReplay = await handleConversationEvent(
    buildTelegramEvent(telegramInput).event,
    { shouldReply: false },
  )
  assert(!built.shouldReply, "Telegram Capture must remain reply-free")
  assert(!telegram.duplicate && telegramReplay.duplicate, "Telegram Capture redelivery must be idempotent")
  assert(telegram.analysisJob?.status === "running", "Telegram Capture must start Analysis")
  assert(telegram.companionReply === undefined && telegram.replyEvent === undefined, "Capture must not call Companion")
  assertNoConversationReply(telegram.event.id)

  const drained = await drainBackgroundTasks(5_000)
  assert(drained.completed, "Capture Analysis tasks must settle")
  for (const captureId of [first.capture.id, idea.capture.id, journal.capture.id, telegram.event.id]) {
    const capture = getCapture(captureId)
    assert(capture.analysis?.status === "succeeded", "Capture Analysis must persist success")
    assertMemoryWritten(capture.id, capture.text)
  }

  const notePage = getCaptures({
    type: "note",
    query: `${contractTag} durable`,
    source: "web",
    limit: 100,
  })
  assert(
    notePage.items.length === 1 && notePage.items[0].id === first.capture.id,
    "Capture list must filter by type, query, and source",
  )
  assert(!JSON.stringify(notePage).includes("chat_id"), "Capture read model must hide Telegram identifiers")
  const stats = getCapturesStatus()
  assert(stats.notes >= baseline.notes + 2, "Capture stats must count Web and Telegram notes")
  assert(stats.ideas >= baseline.ideas + 1, "Capture stats must count ideas")
  assert(stats.journals >= baseline.journals + 1, "Capture stats must count journals")

  await verifyAtomicEventAndJobRollback()
  console.log("capture contract ok")
} finally {
  await drainBackgroundTasks(5_000)
  restoreProfileSnapshot()
  cleanupContractRows()
}

async function verifyAtomicEventAndJobRollback(): Promise<void> {
  const requestId = `${contractTag} rollback request`
  const eventId = createWebCaptureEventId(requestId)
  run(
    `CREATE TEMP TRIGGER capture_contract_rollback
     BEFORE INSERT ON analysis_jobs WHEN NEW.source_event_id = '${eventId}'
     BEGIN SELECT RAISE(ABORT, 'capture contract rollback'); END`,
  )
  let rejected = false
  try {
    await createCapture({
      type: "note",
      text: `${contractTag} rollback note`,
      requestId,
    })
  } catch {
    rejected = true
  } finally {
    run("DROP TRIGGER IF EXISTS capture_contract_rollback")
  }
  assert(rejected, "Analysis job projection failure must reject Capture")
  assert(!queryOne("SELECT 1 FROM events WHERE id = ?", [eventId]), "failed Capture must roll back Event")
  assert(!queryOne("SELECT 1 FROM analysis_jobs WHERE source_event_id = ?", [eventId]), "failed Capture must roll back job")
}

function assertNoConversationReply(sourceEventId: string): void {
  assert(
    !queryOne("SELECT 1 FROM conversation_jobs WHERE source_event_id = ?", [sourceEventId]),
    "Capture must not create a Conversation job",
  )
  assert(
    !queryOne("SELECT 1 FROM events WHERE type = 'companion_reply' AND payload LIKE ?", [`%${sourceEventId}%`]),
    "Capture must not append a Companion reply Event",
  )
}

function assertMemoryWritten(sourceEventId: string, text: string): void {
  assert(
    queryOne("SELECT 1 FROM timeline_events WHERE source_event_id = ?", [sourceEventId]),
    "Capture Analysis must append source-linked Timeline memory",
  )
  const topicName = text.trim().split(/\s+/).slice(0, 4).join(" ")
  assert(queryOne("SELECT 1 FROM topics WHERE name = ?", [topicName]), "Capture Analysis must write Topic memory")
}

async function assertRejects(
  action: () => Promise<unknown>,
  errorType: new (...args: never[]) => Error,
  message: string,
): Promise<void> {
  try {
    await action()
  } catch (err) {
    assert(err instanceof errorType, message)
    return
  }
  throw new Error(message)
}

function cleanupContractRows(): void {
  const eventIds = query<{ id: string }>(
    "SELECT id FROM events WHERE payload LIKE ?",
    [`%${contractTag}%`],
  ).map((row) => row.id)
  for (const eventId of eventIds) {
    run("DELETE FROM timeline_events WHERE source_event_id = ?", [eventId])
  }
  run("DELETE FROM topics WHERE name LIKE ?", [`%${contractTag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${contractTag}%`])
}

function restoreProfileSnapshot(): void {
  if (!profileSnapshot) {
    run("DELETE FROM profile WHERE key = 'last_mock_message' AND value LIKE ?", [`%${contractTag}%`])
    return
  }
  run(
    `INSERT INTO profile (
       id, key, value, source_event_id, updated_at, state,
       state_event_id, state_reason, state_updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       id = excluded.id, value = excluded.value, source_event_id = excluded.source_event_id,
       updated_at = excluded.updated_at, state = excluded.state,
       state_event_id = excluded.state_event_id, state_reason = excluded.state_reason,
       state_updated_at = excluded.state_updated_at`,
    [
      profileSnapshot.id,
      profileSnapshot.key,
      profileSnapshot.value,
      profileSnapshot.source_event_id,
      profileSnapshot.updated_at,
      profileSnapshot.state,
      profileSnapshot.state_event_id,
      profileSnapshot.state_reason,
      profileSnapshot.state_updated_at,
    ],
  )
}

interface ProfileSnapshot {
  id: string
  key: string
  value: string
  source_event_id: string | null
  updated_at: string
  state: string
  state_event_id: string | null
  state_reason: string
  state_updated_at: string | null
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
