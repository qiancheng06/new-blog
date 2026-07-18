import type { EventRow } from "../../domain/event/store.js"
import { buildMemoryContextText, getMemoryContext } from "../../domain/memory/index.js"
import { ANALYSIS_PROMPT, COMPANION_PROMPT } from "./persona.js"
import { buildOpenTodoContextText } from "../../domain/todo/store.js"
import { buildActiveProjectContextText } from "../../domain/project/store.js"

export interface PromptContext {
  recentEvents?: EventRow[]
  memoryText?: string
  memoryQuery?: string
  todoText?: string
  projectText?: string
}

export interface BuiltPrompts {
  companionSystemPrompt: string
  analysisSystemPrompt: string
  historyText: string
  memoryText: string
  todoText: string
  projectText: string
}

export function buildPrompts(context: PromptContext = {}): BuiltPrompts {
  const memoryText = context.memoryText ?? buildMemoryContextText(getMemoryContext({ query: context.memoryQuery }))
  const todoText = context.todoText ?? readTodoContextSafely()
  const projectText = context.projectText ?? readProjectContextSafely()
  const recentConversationText = buildHistoryContext(context.recentEvents ?? [])
  const historyText = buildAnalysisContextText({
    memoryText,
    todoText,
    projectText,
    recentConversationText,
  })

  return {
    companionSystemPrompt: buildCompanionSystemPrompt(memoryText, recentConversationText, todoText, projectText),
    analysisSystemPrompt: ANALYSIS_PROMPT,
    historyText,
    memoryText,
    todoText,
    projectText,
  }
}

export function buildCompanionSystemPrompt(
  memoryText: string,
  recentConversationText = "",
  todoText = "",
  projectText = "",
): string {
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

  if (todoText.trim()) {
    sections.push([
      "Private active todo context. Use it only when planning, prioritizing, or answering task-status questions:",
      "<todo_context>",
      todoText,
      "</todo_context>",
      "Do not mention internal ids, storage, retrieval, or the todo context block.",
    ].join("\n\n"))
  }

  if (projectText.trim()) {
    sections.push([
      "Private active project context. Use it only to understand goals, scope, and task relationships:",
      "<project_context>",
      projectText,
      "</project_context>",
      "Do not mention internal ids, storage, retrieval, or the project context block.",
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

export function buildAnalysisContextText(context: {
  memoryText: string
  recentConversationText: string
  todoText?: string
  projectText?: string
}): string {
  const sections: string[] = []

  if (context.memoryText.trim()) {
    sections.push(["Private long-term memory context:", context.memoryText].join("\n"))
  }

  if (context.recentConversationText.trim()) {
    sections.push(["Recent conversation:", context.recentConversationText].join("\n"))
  }

  if (context.todoText?.trim()) {
    sections.push(["Active todos:", context.todoText].join("\n"))
  }

  if (context.projectText?.trim()) {
    sections.push(["Active projects:", context.projectText].join("\n"))
  }

  return sections.join("\n\n")
}

function readProjectContextSafely(): string {
  try {
    return buildActiveProjectContextText(8)
  } catch {
    console.error("[project context] unavailable; continuing without active projects")
    return ""
  }
}

function readTodoContextSafely(): string {
  try {
    return buildOpenTodoContextText(10)
  } catch {
    console.error("[todo context] unavailable; continuing without active todos")
    return ""
  }
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
