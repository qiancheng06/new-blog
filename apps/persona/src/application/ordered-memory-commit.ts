let commitTail: Promise<void> = Promise.resolve()

type AnalysisOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }

export interface OrderedMemoryCommitReservation {
  run<T>(
    analyze: () => Promise<T>,
    commit: (result: T) => void | Promise<void>,
  ): Promise<void>
  cancel(): void
}

export function reserveOrderedMemoryCommit(): OrderedMemoryCommitReservation {
  const previous = commitTail
  let release!: () => void
  const completed = new Promise<void>((resolve) => {
    release = resolve
  })
  commitTail = completed
  let state: "reserved" | "running" | "released" = "reserved"

  return {
    async run<T>(analyze: () => Promise<T>, commit: (result: T) => void | Promise<void>): Promise<void> {
      if (state !== "reserved") throw new Error("ordered Memory commit reservation already used")
      state = "running"
      const outcome: Promise<AnalysisOutcome<T>> = Promise.resolve()
        .then(analyze)
        .then(
          (value): AnalysisOutcome<T> => ({ ok: true, value }),
          (error: unknown): AnalysisOutcome<T> => ({ ok: false, error }),
        )

      await previous
      try {
        const settled = await outcome
        if (!settled.ok) throw settled.error
        await commit(settled.value)
      } finally {
        state = "released"
        release()
      }
    },
    cancel(): void {
      if (state !== "reserved") return
      state = "released"
      release()
    },
  }
}
