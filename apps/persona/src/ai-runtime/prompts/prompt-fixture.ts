import type { EventRow } from "../../domain/event/store.js"

process.env.LLM_PROVIDER = "mock"

const { callAnalysis, callCompanion } = await import("../../infra/llm/deepseek.js")
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
assert(prompts.historyText.includes("latest message"), "historyText must include latest message")
assert(!prompts.historyText.includes("not user visible"), "historyText must ignore non-message events")

const companionWithMemory = buildCompanionSystemPrompt(memoryText)
assert(companionWithMemory.includes("<memory_context>"), "companion prompt must wrap memory context")
assert(companionWithMemory.includes("</memory_context>"), "companion prompt must close memory context")
assert(companionWithMemory.includes("Do not quote, summarize, reveal, or mention"), "companion prompt must hide memory internals")
assert(companionWithMemory.includes("memory_patch"), "companion prompt should name forbidden internal fields")
assert(companionWithMemory.includes("JSON"), "companion prompt should forbid JSON output")

const companionWithoutMemory = buildCompanionSystemPrompt("")
assert(!companionWithoutMemory.includes("<memory_context>"), "empty memory must not add memory context block")

const historyOnly = buildHistoryContext(recentEvents)
assert(historyOnly.includes("older message"), "history context must include older message")
assert(historyOnly.includes("latest message"), "history context must include latest message")
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

console.log("persona prompt fixture ok")

function createEvent(id: string, type: string, text: string): EventRow {
  return {
    id,
    source: "web",
    type,
    payload: JSON.stringify({ text }),
    timestamp: "2026-07-03T00:00:00.000Z",
    metadata: "{}",
    created_at: "2026-07-03T00:00:00.000Z",
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
