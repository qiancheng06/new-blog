import { randomUUID } from "crypto"

const tag = `codex-memory-transaction-${Date.now()}`
const topicName = `${tag}-topic`
const patchProfileKey = `${tag}-patch-profile`
const governedProfileKey = `${tag}-governed-profile`
const forcedReason = `${tag}-forced-state-failure`
const triggerName = `contract_profile_abort_${Date.now()}`

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { applyMemoryPatch } = await import("../domain/memory/store.js")
const { changeMemoryProfileState, correctMemoryProfile } = await import("./memory.js")

initializeDb()

try {
  verifyPatchRollback()
  verifyGovernanceRollback()
  console.log("memory transaction contract ok")
} finally {
  run(`DROP TRIGGER IF EXISTS ${triggerName}`)
  cleanup()
}

function verifyPatchRollback(): void {
  let failed = false
  try {
    applyMemoryPatch({
      topic_updates: [{ name: topicName, summary: `transaction topic ${tag}` }],
      profile_updates: [{ key: patchProfileKey, value: tag, confidence: 1 }],
      timeline_events: [{ date: "2026-07-15", type: "insight", summary: `transaction timeline ${tag}` }],
    }, { sourceEventId: randomUUID() })
  } catch {
    failed = true
  }

  assert(failed, "invalid source Event should fail the Memory patch")
  assert(!queryOne("SELECT id FROM topics WHERE name = ?", [topicName]), "failed patch must roll back Topic writes")
  assert(!queryOne("SELECT id FROM profile WHERE key = ?", [patchProfileKey]), "failed patch must roll back Profile writes")
  assert(!queryOne("SELECT id FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`]), "failed patch must roll back Timeline writes")
}

function verifyGovernanceRollback(): void {
  const setup = correctMemoryProfile({
    key: governedProfileKey,
    value: { tag, state: "active" },
    reason: `${tag}-setup`,
  })

  run(
    `CREATE TEMP TRIGGER ${triggerName}
     BEFORE UPDATE ON profile
     WHEN OLD.id = '${setup.profile.id}'
     BEGIN
       SELECT RAISE(ABORT, 'forced profile state failure');
     END`,
  )

  let failed = false
  try {
    changeMemoryProfileState({
      id: setup.profile.id,
      state: "suppressed",
      reason: forcedReason,
    })
  } catch {
    failed = true
  }

  assert(failed, "forced projection failure should reject governance change")
  const profile = queryOne<{ state: string; state_event_id: string | null }>(
    "SELECT state, state_event_id FROM profile WHERE id = ?",
    [setup.profile.id],
  )
  assert(profile?.state === "active", "failed governance change must preserve Profile state")
  assert(profile.state_event_id === null, "failed governance change must not attach a state Event")
  assert(
    !queryOne("SELECT id FROM events WHERE payload LIKE ?", [`%${forcedReason}%`]),
    "failed governance change must roll back its Event",
  )
}

function cleanup(): void {
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key IN (?, ?)", [patchProfileKey, governedProfileKey])
  run("DELETE FROM topics WHERE name = ?", [topicName])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
