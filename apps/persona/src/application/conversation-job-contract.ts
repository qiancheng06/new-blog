const contractTag = `codex-conversation-job-${Date.now()}`

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { createWorkspaceEvent } = await import("../domain/event/types.js")
const { insertEvent } = await import("../domain/event/store.js")
const {
  beginConversationJobAttempt,
  ensureConversationJob,
  getConversationJobById,
  getConversationJobBySourceEventId,
} = await import("../domain/conversation-job/store.js")
const {
  ConversationExecutionError,
  getConversationJobsStatus,
  recoverConversationJobsAtStartup,
  retryConversationJob,
} = await import("./conversation-jobs.js")
const { handleConversationEvent } = await import("./conversation.js")
const { drainBackgroundTasks } = await import("./background-tasks.js")

initializeDb()
const sourceEventIds: string[] = []

try {
  await verifyFailedReplayRecovery()
  await verifyConcurrentSingleFlight()
  await verifyManualRetry()
  verifyStartupRecovery()
  const stats = getConversationJobsStatus()
  assert(stats.succeeded >= 3, "Conversation job stats must include successful contracts")
  assert(stats.failed >= 1, "Conversation job stats must include interrupted contract")
  const drained = await drainBackgroundTasks(5_000)
  assert(drained.completed, "Conversation job Analysis tasks must drain")
  console.log("conversation job contract ok")
} finally {
  await drainBackgroundTasks(5_000)
  cleanup()
}

async function verifyFailedReplayRecovery(): Promise<void> {
  const event = createWorkspaceEvent(
    { text: `${contractTag}-replay` },
    { requestId: `${contractTag}-replay-request` },
  )
  sourceEventIds.push(event.id!)
  let companionCalls = 0

  let failure: { jobId: string; sourceEventId: string } | null = null
  try {
    await handleConversationEvent(event, {
      resumeDuplicate: true,
      dependencies: {
        callCompanion: async () => {
          companionCalls += 1
          throw new Error("provider details must not persist")
        },
      },
    })
  } catch (err) {
    if (err instanceof ConversationExecutionError) failure = err
    else throw err
  }
  assert(failure, "first Companion failure must return a bounded execution error")
  const failed = getConversationJobById(failure.jobId)
  assert(failed?.status === "failed", "failed Companion call must persist failed job")
  assert(failed.error_code === "companion_error", "failed Companion error code mismatch")
  assert(failed.attempt_count === 1, "first failed attempt count mismatch")

  const recovered = await handleConversationEvent(event, {
    resumeDuplicate: true,
    dependencies: {
      callCompanion: async () => {
        companionCalls += 1
        return `recovered:${contractTag}`
      },
    },
  })
  assert(recovered.duplicate, "idempotent replay must reuse the input Event")
  assert(recovered.companionReply === `recovered:${contractTag}`, "recovered reply mismatch")
  assert(recovered.job?.status === "succeeded", "replayed Conversation job must succeed")
  assert(recovered.job.attemptCount === 2, "replayed Conversation job attempt count mismatch")
  assert(companionCalls === 2, "failed replay must call Companion once per attempt")

  const retryEvent = queryOne<{ type: string; payload: string; metadata: string }>(
    "SELECT type, payload, metadata FROM events WHERE id = ?",
    [recovered.job.retryEventId],
  )
  assert(retryEvent?.type === "conversation_retry_requested", "idempotent replay audit Event type mismatch")
  assert(
    (JSON.parse(retryEvent.payload) as { reason?: string }).reason === "idempotent_replay",
    "idempotent replay audit reason mismatch",
  )
  assert(
    (JSON.parse(retryEvent.metadata) as { purpose?: string }).purpose === "conversation_recovery",
    "idempotent replay audit metadata mismatch",
  )

  const stored = await handleConversationEvent(event, {
    resumeDuplicate: true,
    dependencies: {
      callCompanion: async () => {
        companionCalls += 1
        return "must-not-run"
      },
    },
  })
  assert(stored.replyEvent?.id === recovered.replyEvent?.id, "successful replay must return stored reply Event")
  assert(stored.companionReply === recovered.companionReply, "successful replay must return stored reply text")
  assert(companionCalls === 2, "successful replay must not call Companion again")
}

async function verifyConcurrentSingleFlight(): Promise<void> {
  const event = createWorkspaceEvent(
    { text: `${contractTag}-concurrent` },
    { requestId: `${contractTag}-concurrent-request` },
  )
  sourceEventIds.push(event.id!)
  let companionCalls = 0
  const dependencies = {
    callCompanion: async (): Promise<string> => {
      companionCalls += 1
      await delay(40)
      return `single-flight:${contractTag}`
    },
  }

  const [first, second] = await Promise.all([
    handleConversationEvent(event, { resumeDuplicate: true, dependencies }),
    handleConversationEvent(event, { resumeDuplicate: true, dependencies }),
  ])
  assert(companionCalls === 1, "concurrent duplicate must share one Companion call")
  assert(first.event.id === second.event.id, "concurrent duplicate input Event mismatch")
  assert(first.replyEvent?.id === second.replyEvent?.id, "concurrent duplicate reply Event mismatch")
  assert(first.job?.id === second.job?.id, "concurrent duplicate Conversation job mismatch")
  assert([first.duplicate, second.duplicate].filter(Boolean).length === 1, "one concurrent request must be duplicate")
}

async function verifyManualRetry(): Promise<void> {
  const event = createWorkspaceEvent({ text: `${contractTag}-manual` })
  sourceEventIds.push(event.id ?? "")
  let failedJobId = ""
  try {
    await handleConversationEvent(event, {
      dependencies: { callCompanion: async () => { throw new Error("manual retry fixture") } },
    })
  } catch (err) {
    if (!(err instanceof ConversationExecutionError)) throw err
    failedJobId = err.jobId
    sourceEventIds[sourceEventIds.length - 1] = err.sourceEventId
  }
  assert(failedJobId, "manual retry fixture must fail first")

  const result = await retryConversationJob(failedJobId, "manual", {
    callCompanion: async () => `manual-retry:${contractTag}`,
  })
  assert(result.job.status === "succeeded", "manual retry must succeed")
  assert(result.companionReply === `manual-retry:${contractTag}`, "manual retry reply mismatch")
  const retry = queryOne<{ payload: string }>("SELECT payload FROM events WHERE id = ?", [result.retryEventId])
  assert((JSON.parse(retry!.payload) as { reason?: string }).reason === "manual", "manual retry reason mismatch")
}

function verifyStartupRecovery(): void {
  const event = insertEvent(createWorkspaceEvent({ text: `${contractTag}-interrupted` }))
  sourceEventIds.push(event.id)
  const job = ensureConversationJob(event.id)
  const running = beginConversationJobAttempt(job.id)
  assert(running?.status === "running", "interrupted fixture must start running")
  assert(recoverConversationJobsAtStartup() >= 1, "startup recovery must find interrupted Conversation job")
  const recovered = getConversationJobBySourceEventId(event.id)
  assert(recovered?.status === "failed", "interrupted Conversation job must become failed")
  assert(recovered.error_code === "interrupted", "interrupted Conversation job error code mismatch")
}

function cleanup(): void {
  for (const sourceEventId of sourceEventIds.filter(Boolean)) {
    run("DELETE FROM timeline_events WHERE source_event_id = ?", [sourceEventId])
    run("DELETE FROM profile WHERE source_event_id = ?", [sourceEventId])
    run("DELETE FROM events WHERE type = 'companion_reply' AND json_extract(payload, '$.in_reply_to') = ?", [sourceEventId])
    run("DELETE FROM events WHERE type = 'conversation_retry_requested' AND json_extract(payload, '$.source_event_id') = ?", [sourceEventId])
    run("DELETE FROM events WHERE id = ?", [sourceEventId])
  }
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${contractTag}%`])
  run("DELETE FROM topics WHERE name LIKE ? OR summary LIKE ?", [`%${contractTag}%`, `%${contractTag}%`])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
