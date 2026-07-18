const port = Number(process.env.API_PORT) || 3107
const recoveryTag = `runtime-recovery-${Date.now()}`

process.env.PERSONA_MAIN_AUTOSTART = "0"
process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { startPersonaRuntime } = await import("./index.js")
const { initializeDb, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { createWorkspaceEvent } = await import("../domain/event/types.js")
const { ensureAnalysisJob, getAnalysisJobById } = await import("../domain/analysis-job/store.js")
const {
  beginConversationJobAttempt,
  ensureConversationJob,
  getConversationJobById,
} = await import("../domain/conversation-job/store.js")
const {
  getPendingBackgroundTaskCount,
  trackBackgroundTask,
} = await import("../application/background-tasks.js")

initializeDb()
const recoveryEvent = insertEvent(createWorkspaceEvent({ text: recoveryTag }))
const recoveryJob = ensureAnalysisJob(recoveryEvent.id)
const conversationJob = ensureConversationJob(recoveryEvent.id)
const runningConversationJob = beginConversationJobAttempt(conversationJob.id)
assert(runningConversationJob?.status === "running", "Conversation recovery fixture must be running")
const runtime = startPersonaRuntime({
  api: { port },
  telegram: false,
  dailySummary: false,
})

try {
  await waitForHealth(port)
  const address = runtime.apiServer.address()
  assert(typeof address === "object" && address?.address === "127.0.0.1", "runtime API should bind to loopback by default")
  const recoveredJob = getAnalysisJobById(recoveryJob.id)
  assert(recoveredJob?.status === "failed", "runtime startup must recover pending Analysis job")
  assert(recoveredJob.error_code === "interrupted", "runtime startup recovery error code mismatch")
  const recoveredConversationJob = getConversationJobById(conversationJob.id)
  assert(recoveredConversationJob?.status === "failed", "runtime startup must recover running Conversation job")
  assert(recoveredConversationJob.error_code === "interrupted", "Conversation recovery error code mismatch")
  let releaseTask = (): void => undefined
  const blockedTask = new Promise<void>((resolve) => {
    releaseTask = resolve
  })
  trackBackgroundTask(blockedTask, "runtime-startup-contract")

  const status = await readStatus(port)
  assert(status.background_tasks?.pending === 1, "status should expose one pending background task")

  let stopCompleted = false
  const stopPromise = runtime.stop().then(() => {
    stopCompleted = true
  })
  await assertStopped(port)
  assert(!stopCompleted, "runtime stop should wait for pending background tasks")
  assert(getPendingBackgroundTaskCount() === 1, "pending task should remain tracked while shutdown waits")

  releaseTask()
  await stopPromise
  assert(stopCompleted, "runtime stop should complete after pending task settles")
  assert(getPendingBackgroundTaskCount() === 0, "shutdown should drain pending background tasks")
  cleanupRecoveryRows()
  console.log("runtime startup contract ok")
} catch (err) {
  await runtime.stop().catch(() => undefined)
  cleanupRecoveryRows()
  throw err
}

function cleanupRecoveryRows(): void {
  run("DELETE FROM events WHERE id = ?", [recoveryEvent.id])
}

async function readStatus(portNumber: number): Promise<{
  background_tasks?: { pending?: number }
}> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/status`)
  assert(response.ok, "status request failed")
  return await response.json() as { background_tasks?: { pending?: number } }
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`)
      if (response.ok) {
        const body = await response.json() as { status?: string; events_today?: number }
        assert(body.status === "ok", "health status mismatch")
        assert(typeof body.events_today === "number", "health events_today should be numeric")
        return
      }
    } catch {
      // Runtime is still starting.
    }
    await delay(100)
  }
  throw new Error("persona runtime did not become healthy")
}

async function assertStopped(portNumber: number): Promise<void> {
  await delay(100)
  try {
    await fetch(`http://127.0.0.1:${portNumber}/health`)
  } catch {
    return
  }
  throw new Error("persona runtime should stop listening after stop()")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
