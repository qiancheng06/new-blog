import { reserveOrderedMemoryCommit } from "./ordered-memory-commit.js"

await verifyCommitOrder()
await verifyFailureRelease()
await verifyCancellationRelease()

console.log("ordered memory commit contract ok")

async function verifyCommitOrder(): Promise<void> {
  const analyses: string[] = []
  const commits: string[] = []
  const first = reserveOrderedMemoryCommit()
  const second = reserveOrderedMemoryCommit()
  const third = reserveOrderedMemoryCommit()

  const secondRun = second.run(
    async () => {
      analyses.push("second")
      return "second"
    },
    (value) => { commits.push(value) },
  )
  const thirdRun = third.run(
    async () => {
      analyses.push("third")
      return "third"
    },
    (value) => { commits.push(value) },
  )
  await flushMicrotasks()
  assert(analyses.join(",") === "second,third", "later Analysis work should run concurrently")
  assert(commits.length === 0, "later Memory commits must wait for the earlier reservation")

  const firstRun = first.run(
    async () => {
      analyses.push("first")
      return "first"
    },
    (value) => { commits.push(value) },
  )
  await Promise.all([firstRun, secondRun, thirdRun])
  assert(commits.join(",") === "first,second,third", "Memory commits must follow reservation order")
}

async function verifyFailureRelease(): Promise<void> {
  const commits: string[] = []
  const failed = reserveOrderedMemoryCommit()
  const next = reserveOrderedMemoryCommit()
  const failedRun = failed.run(
    async () => { throw new Error("expected analysis failure") },
    () => { commits.push("failed") },
  )
  const nextRun = next.run(async () => "next", (value) => { commits.push(value) })

  let rejected = false
  try {
    await failedRun
  } catch (err) {
    rejected = err instanceof Error && err.message === "expected analysis failure"
  }
  await nextRun
  assert(rejected, "Analysis failure must reject its tracked task")
  assert(commits.join(",") === "next", "failed Analysis must release the next Memory commit")
}

async function verifyCancellationRelease(): Promise<void> {
  const commits: string[] = []
  const cancelled = reserveOrderedMemoryCommit()
  const next = reserveOrderedMemoryCommit()
  cancelled.cancel()
  await next.run(async () => "after-cancel", (value) => { commits.push(value) })
  assert(commits.join(",") === "after-cancel", "cancelled reservation must not block later commits")
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
