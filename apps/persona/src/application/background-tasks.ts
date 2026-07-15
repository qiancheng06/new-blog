const pendingTasks = new Map<Promise<void>, string>()

export interface BackgroundTaskDrainResult {
  completed: boolean
  pending: number
}

export function trackBackgroundTask(task: Promise<unknown>, label: string): void {
  const normalizedLabel = label.trim() || "background-task"
  let tracked: Promise<void>

  tracked = task
    .then(() => undefined)
    .catch((err) => {
      console.error(
        `[background task error] ${normalizedLabel}:`,
        err instanceof Error ? err.message : err,
      )
    })
    .finally(() => {
      pendingTasks.delete(tracked)
    })

  pendingTasks.set(tracked, normalizedLabel)
}

export function getPendingBackgroundTaskCount(): number {
  return pendingTasks.size
}

export async function drainBackgroundTasks(timeoutMs = 25_000): Promise<BackgroundTaskDrainResult> {
  const deadline = Date.now() + Math.max(0, timeoutMs)

  while (pendingTasks.size > 0) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      return { completed: false, pending: pendingTasks.size }
    }

    const completed = await settleWithin([...pendingTasks.keys()], remainingMs)
    if (!completed) {
      return { completed: false, pending: pendingTasks.size }
    }
  }

  return { completed: true, pending: 0 }
}

function settleWithin(tasks: Promise<void>[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(false)
    }, timeoutMs)

    void Promise.all(tasks).then(() => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(true)
    })
  })
}
