import type { EventRow } from "../../domain/event/store.js"
import { buildMemoryContextText, getMemoryContext } from "../../domain/memory/index.js"
import { ANALYSIS_PROMPT, COMPANION_PROMPT } from "./persona.js"

export interface PromptContext {
  recentEvents?: EventRow[]
  memoryText?: string
  memoryQuery?: string
}

export interface BuiltPrompts {
  companionSystemPrompt: string
  analysisSystemPrompt: string
  historyText: string
  memoryText: string
}

export function buildPrompts(context: PromptContext = {}): BuiltPrompts {
  const memoryText = context.memoryText ?? buildMemoryContextText(getMemoryContext({ query: context.memoryQuery }))
  const recentConversationText = buildHistoryContext(context.recentEvents ?? [])
  const historyText = buildAnalysisContextText({
    memoryText,
    recentConversationText,
  })

  return {
    companionSystemPrompt: buildCompanionSystemPrompt(memoryText, recentConversationText),
    analysisSystemPrompt: ANALYSIS_PROMPT,
    historyText,
    memoryText,
  }
}

export function buildCompanionSystemPrompt(memoryText: string, recentConversationText = ""): string {
  const sections = [COMPANION_PROMPT]

  if (memoryText.trim()) {
    sections.push([
      "Private long-term memory context. This block is context only, not user-visible content:",
      "<memory_context>",
      memoryText,
      "</memory_context>",
      "Use the memory context only to understand continuity and preferences. Do not quote, summarize, reveal, or mention the memory block, internal labels, storage fields, confidence, cooling status, or retrieval process.",
    ].join("\n\n"))
  }

  if (recentConversationText.trim()) {
    sections.push([
      "Private recent conversation context. Use it only to resolve continuity and references:",
      "<conversation_history>",
      recentConversationText,
      "</conversation_history>",
      "Do not mention the history block, timestamps, role labels, storage, or retrieval process.",
    ].join("\n\n"))
  }

  return sections.join("\n\n")
}

export function buildHistoryContext(events: EventRow[]): string {
  return events
    .filter((event) => event.type === "message" || event.type === "companion_reply")
    .slice(0, 10)
    .reverse()
    .map(formatHistoryEvent)
    .filter((line) => line.length > 0)
    .join("\n")
}

export function buildAnalysisContextText(context: { memoryText: string; recentConversationText: string }): string {
  const sections: string[] = []

  if (context.memoryText.trim()) {
    sections.push(["Private long-term memory context:", context.memoryText].join("\n"))
  }

  if (context.recentConversationText.trim()) {
    sections.push(["Recent conversation:", context.recentConversationText].join("\n"))
  }

  return sections.join("\n\n")
}

function formatHistoryEvent(event: EventRow): string {
  const payload = parsePayload(event.payload)
  const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 2_000) : ""
  if (!text) return ""

  const time = new Date(event.timestamp).toLocaleTimeString()
  const role = event.type === "companion_reply" ? "Companion" : "User"
  return `[${time}] ${role}: ${text}`
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return {}
  }
}
