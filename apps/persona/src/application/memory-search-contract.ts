import { randomUUID } from "crypto"

const tag = `codex-memory-search-${Date.now()}`
const profileKey = `preferred_tea_${tag}`
const proposalKey = `reviewed_signal_${tag}`
const pendingValue = `pending-only-${tag}`
const acceptedValue = `accepted-searchable-${tag}`

const { initializeDb, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { createWorkspaceEvent } = await import("../domain/event/types.js")
const {
  applyMemoryPatch,
  buildMemoryContextText,
  getMemoryContext,
  searchMemory,
} = await import("../domain/memory/index.js")
const { upsertDailyNote } = await import("../domain/daily-note/store.js")
const { buildPrompts } = await import("../ai-runtime/prompts/prompt-builder.js")
const {
  changeMemoryProfileState,
  changeMemoryTopicState,
  reviewMemoryProposal,
} = await import("./memory.js")

initializeDb()

const sourceEvent = insertEvent({
  ...createWorkspaceEvent({ text: `memory search source ${tag}` }),
  id: randomUUID(),
})

let cleaned = false

try {
  const written = applyMemoryPatch({
    profile_updates: [{
      key: profileKey,
      value: { drink: "茉莉花茶", preference: `quiet mornings ${tag}` },
      confidence: 0.94,
    }],
    topic_updates: [{
      name: `系统架构复盘 ${tag}`,
      summary: `长期研究模块化边界与可靠性 ${tag}`,
    }],
    timeline_events: [{
      date: "2099-03-14",
      type: "milestone",
      summary: `在上海完成可靠性迁移检查 ${tag}`,
    }],
  }, { sourceEventId: sourceEvent.id })

  const dailyNote = upsertDailyNote({
    id: randomUUID(),
    date: "2099-03-15",
    summary: `Completed release checkpoint with robust migration planning ${tag}`,
    highlights: [`validated rollback ${tag}`, "documented ownership"],
    topicDistribution: { architecture: 2 },
    sourceEventId: sourceEvent.id,
    finalized: true,
  })

  const cooled = applyMemoryPatch({
    profile_updates: [
      { key: `${proposalKey}_pending`, value: pendingValue, confidence: 0.51, cooling_required: true },
      { key: proposalKey, value: acceptedValue, confidence: 0.88, cooling_required: true },
    ],
    topic_updates: [],
    timeline_events: [],
  }, { sourceEventId: sourceEvent.id })

  const topic = written.topics[0]
  const profile = written.profile[0]
  assert(topic && profile, "search contract Memory rows missing")
  assert(searchMemory("花茶").some((item) => item.entityId === profile.id), "two-character CJK search must use exact fallback")
  assert(
    searchMemory("我最近持续研究系统架构的可靠性").some((item) => item.entityId === topic.id),
    "CJK trigram retrieval must find a related Topic without full-query equality",
  )
  assert(
    searchMemory("planning release checkpoint").some((item) => item.entityId === dailyNote.id && item.entityType === "daily_note"),
    "token retrieval must find Daily Notes",
  )
  assert(
    searchMemory("上海完成可靠性").some((item) => item.entityType === "timeline"),
    "retrieval must include Timeline rows",
  )
  assert(
    !searchMemory(pendingValue).some((item) => item.text.includes(pendingValue)),
    "pending proposal must stay outside the search index",
  )
  assert(
    !searchMemory(acceptedValue).some((item) => item.text.includes(acceptedValue)),
    "unreviewed proposal must stay outside the search index",
  )

  const context = getMemoryContext({
    query: "如何继续系统架构可靠性研究",
    topicLimit: 20,
    profileLimit: 20,
    timelineLimit: 20,
  })
  assert(context.relevant.some((item) => item.entityId === topic.id), "query-aware Memory context must contain relevant Topic")
  const contextText = buildMemoryContextText(context)
  assert(contextText.includes("Relevant memory:"), "formatted context must label relevant Memory")
  assert(contextText.includes(tag), "formatted context must include retrieved evidence")
  assert(contextText.indexOf("Relevant memory:") < contextText.indexOf("Profile:"), "relevant Memory must precede generic context")
  assert(!contextText.includes(pendingValue), "pending proposal must not enter Prompt context")
  const prompts = buildPrompts({ memoryQuery: "如何继续系统架构可靠性研究" })
  assert(prompts.memoryText.includes("Relevant memory:"), "Prompt Builder must execute query-aware retrieval")
  assert(prompts.companionSystemPrompt.includes(tag), "Companion Prompt must receive retrieved Memory")
  assert(prompts.historyText.includes(tag), "Analysis context must receive the same retrieved Memory")

  changeMemoryTopicState({ id: topic.id, state: "suppressed", reason: `search suppression ${tag}` })
  assert(!searchMemory("系统架构").some((item) => item.entityId === topic.id), "suppressed Topic must not be recalled")
  changeMemoryTopicState({ id: topic.id, state: "active", reason: `search restore ${tag}` })

  changeMemoryProfileState({ id: profile.id, state: "archived", reason: `search archive ${tag}` })
  assert(!searchMemory("花茶").some((item) => item.entityId === profile.id), "archived Profile must not be recalled")
  changeMemoryProfileState({ id: profile.id, state: "active", reason: `search profile restore ${tag}` })

  const reviewed = reviewMemoryProposal({
    id: cooled.proposals.find((item) => item.proposal_key === proposalKey)!.id,
    decision: "accept",
    reason: `confirmed for search ${tag}`,
  })
  assert(reviewed.profile?.key === proposalKey, "accepted proposal must write Profile")
  assert(
    searchMemory(acceptedValue).some((item) => item.entityId === reviewed.profile?.id),
    "accepted proposal must become searchable through the Profile trigger",
  )
  assert(
    !searchMemory(pendingValue).some((item) => item.text.includes(pendingValue)),
    "other pending proposal must remain unsearchable",
  )

  run("DELETE FROM memory_search")
  assert(searchMemory(tag).length === 0, "manual index deletion should remove derived search rows")
  initializeDb()
  assert(searchMemory(tag).length > 0, "database initialization must rebuild search from source projections")

  cleanup()
  cleaned = true
  assert(searchMemory(tag).length === 0, "source deletion triggers must remove search rows")
  console.log("memory search contract ok")
} finally {
  if (!cleaned) cleanup()
}

function cleanup(): void {
  run("DELETE FROM daily_notes WHERE source_event_id = ?", [sourceEvent.id])
  run("DELETE FROM timeline_events WHERE source_event_id = ?", [sourceEvent.id])
  run("DELETE FROM profile WHERE key IN (?, ?, ?)", [profileKey, proposalKey, `${proposalKey}_pending`])
  run("DELETE FROM topics WHERE name LIKE ?", [`%${tag}%`])
  run("DELETE FROM events WHERE id = ?", [sourceEvent.id])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
