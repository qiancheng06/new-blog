import { randomUUID } from "crypto"

const tag = `codex-memory-transaction-${Date.now()}`
const topicName = `${tag}-topic`
const patchProfileKey = `${tag}-patch-profile`
const governedProfileKey = `${tag}-governed-profile`
const forcedReason = `${tag}-forced-state-failure`
const triggerName = `contract_profile_abort_${Date.now()}`
const proposalTriggerName = `contract_proposal_abort_${Date.now()}`
const proposalProfileKey = `${tag}-proposal-profile`
const proposalReviewReason = `${tag}-proposal-review-failure`

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { applyMemoryPatch } = await import("../domain/memory/store.js")
const { changeMemoryProfileState, correctMemoryProfile, reviewMemoryProposal } = await import("./memory.js")

initializeDb()

try {
  verifyPatchRollback()
  verifyGovernanceRollback()
  verifyProposalReviewRollback()
  console.log("memory transaction contract ok")
} finally {
  run(`DROP TRIGGER IF EXISTS ${triggerName}`)
  run(`DROP TRIGGER IF EXISTS ${proposalTriggerName}`)
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

function verifyProposalReviewRollback(): void {
  const sourceEventId = randomUUID()
  run(
    `INSERT INTO events (id, source, type, payload, timestamp, metadata)
     VALUES (?, 'web', 'message', ?, datetime('now'), '{}')`,
    [sourceEventId, JSON.stringify({ text: `${tag}-proposal-source` })],
  )
  const written = applyMemoryPatch({
    topic_updates: [],
    profile_updates: [{
      key: proposalProfileKey,
      value: { tag, stability: "unconfirmed" },
      confidence: 0.7,
      cooling_required: true,
    }],
    timeline_events: [],
  }, { sourceEventId })
  const proposal = written.proposals[0]
  assert(proposal?.status === "pending", "cooling update should create pending proposal")

  run(
    `CREATE TEMP TRIGGER ${proposalTriggerName}
     BEFORE INSERT ON profile
     WHEN NEW.key = '${proposalProfileKey}'
     BEGIN
       SELECT RAISE(ABORT, 'forced proposal Profile failure');
     END`,
  )

  let failed = false
  try {
    reviewMemoryProposal({
      id: proposal.id,
      decision: "accept",
      reason: proposalReviewReason,
    })
  } catch {
    failed = true
  }
  assert(failed, "forced Profile failure should reject proposal review")
  const unchanged = queryOne<{ status: string; review_event_id: string | null }>(
    "SELECT status, review_event_id FROM memory_proposals WHERE id = ?",
    [proposal.id],
  )
  assert(unchanged?.status === "pending", "failed review must preserve pending proposal state")
  assert(unchanged.review_event_id === null, "failed review must not attach a review Event")
  assert(!queryOne("SELECT id FROM profile WHERE key = ?", [proposalProfileKey]), "failed review must not write Profile")
  assert(
    !queryOne("SELECT id FROM events WHERE payload LIKE ?", [`%${proposalReviewReason}%`]),
    "failed review must roll back its audit Event",
  )
}

function cleanup(): void {
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key IN (?, ?)", [patchProfileKey, governedProfileKey])
  run("DELETE FROM profile WHERE key = ?", [proposalProfileKey])
  run("DELETE FROM topics WHERE name = ?", [topicName])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
