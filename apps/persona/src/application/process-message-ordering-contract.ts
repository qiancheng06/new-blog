import { setTimeout as delay } from "timers/promises"
import type { AnalysisResult } from "../infra/llm/deepseek.js"

const contractTag = `codex-process-ordering-${Date.now()}`
const values = ["first", "second", "third"] as const

process.env.LLM_PROVIDER = "mock"
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { createWorkspaceEvent } = await import("../domain/event/types.js")
const { processMessage } = await import("../ai-runtime/operators/process-message.js")
const { drainBackgroundTasks, getPendingBackgroundTaskCount } = await import("./background-tasks.js")

initializeDb()
const events = values.map((value) => insertEvent(createWorkspaceEvent({ text: `${contractTag}-${value}` })))

try {
  const replies = await Promise.all(events.map((event) => processMessage(event, {
    callCompanion: async (_systemPrompt, userMessage) => {
      await delay(companionDelay(userMessage))
      return `reply:${userMessage}`
    },
    callAnalysis: async (_systemPrompt, userMessage) => {
      await delay(analysisDelay(userMessage))
      return createAnalysisResult(userMessage)
    },
  })))

  assert(replies.map((item) => item.companionReply).join("|") === values
    .map((value) => `reply:${contractTag}-${value}`).join("|"), "concurrent Companion replies mismatch")
  assert(getPendingBackgroundTaskCount() > 0, "ordering contract must exercise tracked background Analysis")

  const drained = await drainBackgroundTasks(5_000)
  assert(drained.completed && drained.pending === 0, "ordered Analysis tasks must drain")

  const profile = queryOne<{ value: string; source_event_id: string | null }>(
    "SELECT value, source_event_id FROM profile WHERE key = ?",
    [profileKey()],
  )
  assert(profile?.value === JSON.stringify(`${contractTag}-third`), "latest input must own final Profile value")
  assert(profile.source_event_id === events[2].id, "latest input Event must remain Profile provenance")
  console.log("process message ordering contract ok")
} finally {
  run("DELETE FROM profile WHERE key = ?", [profileKey()])
  for (const event of events) run("DELETE FROM events WHERE id = ?", [event.id])
}

function companionDelay(userMessage: string): number {
  if (userMessage.endsWith("-first")) return 60
  if (userMessage.endsWith("-second")) return 1
  return 5
}

function analysisDelay(userMessage: string): number {
  return userMessage.endsWith("-first") ? 20 : 1
}

function createAnalysisResult(userMessage: string): AnalysisResult {
  return {
    research: { core_points: [], hidden_assumptions: [], open_questions: [] },
    critic: { confidence: 0, counter_examples: [], evidence_gaps: [] },
    memory_patch: {
      profile_updates: [{ key: profileKey(), value: userMessage, confidence: 1 }],
      topic_updates: [],
      timeline_events: [],
    },
  }
}

function profileKey(): string {
  return `ordering_probe_${contractTag}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
