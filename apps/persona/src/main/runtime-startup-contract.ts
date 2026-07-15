const port = Number(process.env.API_PORT) || 3107

process.env.PERSONA_MAIN_AUTOSTART = "0"
process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { startPersonaRuntime } = await import("./index.js")
const {
  getPendingBackgroundTaskCount,
  trackBackgroundTask,
} = await import("../application/background-tasks.js")

const runtime = startPersonaRuntime({
  api: { port },
  telegram: false,
})

try {
  await waitForHealth(port)
  const address = runtime.apiServer.address()
  assert(typeof address === "object" && address?.address === "127.0.0.1", "runtime API should bind to loopback by default")
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
  console.log("runtime startup contract ok")
} catch (err) {
  await runtime.stop().catch(() => undefined)
  throw err
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
