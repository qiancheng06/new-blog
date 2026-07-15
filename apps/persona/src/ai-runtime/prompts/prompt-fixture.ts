import type { EventRow } from "../../domain/event/store.js"

process.env.LLM_PROVIDER = "mock"

const { callAnalysis, callCompanion, parseAnalysisResult } = await import("../../infra/llm/deepseek.js")
const {
  buildAnalysisContextText,
  buildCompanionSystemPrompt,
  buildHistoryContext,
  buildPrompts,
} = await import("./prompt-builder.js")

const memoryText = [
  "Profile:",
  "- communication_style: concise, warm",
  "Topics:",
  "- project architecture - User is reorganizing a merged project.",
  "Timeline:",
  "- 2026-07-03 [insight] Architecture boundaries matter.",
].join("\n")

const recentEvents: EventRow[] = [
  createEvent("system-note", "note", "not user visible"),
  createEvent("older", "message", "older message"),
  createEvent("previous-reply", "companion_reply", "previous reply", "system"),
  createEvent("latest", "message", "latest message"),
]

const longHistoryEvents: EventRow[] = [
  createEvent("ignored-note", "note", "internal note"),
  ...Array.from({ length: 12 }, (_, index) => {
    const sequence = 12 - index
    return createEvent(`msg-${sequence}`, "message", `message ${sequence}`)
  }),
]

const prompts = buildPrompts({ memoryText, recentEvents })

assert(prompts.memoryText === memoryText, "buildPrompts must preserve provided memoryText")
assert(prompts.analysisSystemPrompt.includes("JSON"), "analysis prompt must demand JSON output")
assert(prompts.historyText.includes("Private long-term memory context:"), "historyText must include memory context")
assert(prompts.historyText.includes("Recent conversation:"), "historyText must include recent conversation")
assert(prompts.historyText.includes("older message"), "historyText must include older message")
assert(prompts.historyText.includes("previous reply"), "historyText must include previous Companion reply")
assert(prompts.historyText.includes("latest message"), "historyText must include latest message")
assert(!prompts.historyText.includes("not user visible"), "historyText must ignore non-message events")
assert(prompts.companionSystemPrompt.includes("<conversation_history>"), "companion prompt must wrap recent conversation")
assert(prompts.companionSystemPrompt.includes("User: older message"), "companion prompt must include prior user text")
assert(prompts.companionSystemPrompt.includes("Companion: previous reply"), "companion prompt must include prior Companion reply")
assert(prompts.companionSystemPrompt.includes("Do not mention the history block"), "companion prompt must hide history internals")

const companionWithMemory = buildCompanionSystemPrompt(memoryText)
assert(companionWithMemory.includes("<memory_context>"), "companion prompt must wrap memory context")
assert(companionWithMemory.includes("</memory_context>"), "companion prompt must close memory context")
assert(companionWithMemory.includes("Do not quote, summarize, reveal, or mention"), "companion prompt must hide memory internals")
assert(companionWithMemory.includes("memory_patch"), "companion prompt should name forbidden internal fields")
assert(companionWithMemory.includes("JSON"), "companion prompt should forbid JSON output")

const companionWithoutMemory = buildCompanionSystemPrompt("")
assert(!companionWithoutMemory.includes("<memory_context>"), "empty memory must not add memory context block")

const historyOnly = buildHistoryContext(recentEvents)
assert(historyOnly.includes("User: older message"), "history context must label older user message")
assert(historyOnly.includes("Companion: previous reply"), "history context must label prior Companion reply")
assert(historyOnly.includes("User: latest message"), "history context must label latest user message")
assert(!historyOnly.includes("not user visible"), "history context must ignore non-message events")

const analysisContext = buildAnalysisContextText({ memoryText, recentConversationText: historyOnly })
assert(analysisContext.includes("Private long-term memory context:"), "analysis context must label memory")
assert(analysisContext.includes("Recent conversation:"), "analysis context must label history")

const longHistory = buildHistoryContext(longHistoryEvents)
const longHistoryLines = longHistory.split(/\r?\n/)
assert(!longHistory.includes("internal note"), "history limit fixture must filter non-message events")
assert(!longHistoryLines.some((line) => line.endsWith("message 1")), "history fixture must keep only the latest 10 messages")
assert(!longHistoryLines.some((line) => line.endsWith("message 2")), "history fixture must keep only the latest 10 messages")
assert(longHistoryLines.some((line) => line.endsWith("message 3")), "history fixture must include message 3")
assert(longHistoryLines.some((line) => line.endsWith("message 12")), "history fixture must include the latest message")

const companionReply = await callCompanion(prompts.companionSystemPrompt, "fixture user message")
assert(companionReply === "[mock companion] fixture user message", "mock companion response mismatch")

const analysis = await callAnalysis(prompts.analysisSystemPrompt, "fixture user message", prompts.historyText)
assert(analysis.research.core_points[0] === "fixture user message", "mock analysis core point mismatch")
assert(analysis.research.hidden_assumptions.includes("recent conversation context available"), "mock analysis must notice history")
assert(analysis.critic.confidence === 0.5, "mock critic confidence mismatch")
assert(analysis.critic.confidence >= 0 && analysis.critic.confidence <= 1, "critic confidence must be 0-1")
assert(analysis.memory_patch.profile_updates[0]?.key === "last_mock_message", "mock memory profile key mismatch")
assert(analysis.memory_patch.profile_updates[0]?.value === "fixture user message", "mock memory profile value mismatch")
assert(typeof analysis.memory_patch.profile_updates[0]?.confidence === "number", "mock memory profile confidence mismatch")
assert(analysis.memory_patch.topic_updates[0]?.name === "fixture user message", "mock topic name mismatch")
assert(analysis.memory_patch.timeline_events[0]?.type === "insight", "mock timeline type mismatch")

verifyAnalysisSchema()

console.log("persona prompt fixture ok")

function createEvent(id: string, type: string, text: string, source = "web"): EventRow {
  return {
    id,
    source,
    type,
    payload: JSON.stringify({ text }),
    timestamp: "2026-07-03T00:00:00.000Z",
    metadata: "{}",
    created_at: "2026-07-03T00:00:00.000Z",
  }
}

function verifyAnalysisSchema(): void {
  const valid = {
    research: { core_points: [], hidden_assumptions: [], open_questions: [] },
    critic: { confidence: 0.5, counter_examples: [], evidence_gaps: [] },
    memory_patch: {
      profile_updates: [{ key: "preference", value: { concise: true }, confidence: 0.8 }],
      topic_updates: [{ name: "architecture", summary: "Modular monolith" }],
      timeline_events: [{ date: "2026-07-15", type: "insight", summary: "Schema fixture" }],
    },
  }

  const parsed = parseAnalysisResult(valid)
  assert(parsed.memory_patch.profile_updates[0]?.key === "preference", "valid analysis schema should parse")

  assertSchemaRejected({ ...valid, critic: { ...valid.critic, confidence: 2 } }, "critic.confidence")
  assertSchemaRejected({ ...valid, memory_patch: { ...valid.memory_patch, topic_updates: null } }, "memory_patch.topic_updates")
  assertSchemaRejected({
    ...valid,
    memory_patch: {
      ...valid.memory_patch,
      timeline_events: [{ date: "2026-07-15", type: "reflection", summary: "private-schema-marker" }],
    },
  }, "memory_patch.timeline_events.0.type", "private-schema-marker")
}

function assertSchemaRejected(input: unknown, expectedPath: string, privateMarker?: string): void {
  let message = ""
  try {
    parseAnalysisResult(input)
  } catch (err) {
    message = err instanceof Error ? err.message : String(err)
  }
  assert(message.includes(expectedPath), `analysis schema should reject ${expectedPath}`)
  if (privateMarker) assert(!message.includes(privateMarker), "analysis schema error must not leak provider content")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
