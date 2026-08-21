import { callCompanion } from "../../infra/llm/deepseek.js"
import { getRecentEvents } from "../../domain/event/store.js"
import type { EventRow } from "../../domain/event/store.js"
import { buildPrompts } from "../prompts/prompt-builder.js"

export interface ProcessMessageOptions {
  endpoint?: string
  apiKey?: string
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  historyLimit?: number
  memoryEnabled?: boolean
  backgroundAnalysis?: boolean
  instructions?: string
}

export async function processMessage(
  eventRow: EventRow,
  options: ProcessMessageOptions = {},
): Promise<{ companionReply: string; historyEventIds: string[] }> {
  const payload = JSON.parse(eventRow.payload) as Record<string, unknown>
  const userText = (payload.text as string) || ""
  const historyLimit = options.historyLimit ?? 10
  const recentEvents = historyLimit > 0
    ? getRecentEvents(historyLimit * 2 + 1).filter((event) => event.id !== eventRow.id)
    : []
  const prompts = buildPrompts({
    recentEvents,
    ...(options.memoryEnabled === false ? { memoryText: "" } : {}),
  })
  const companionSystemPrompt = appendUserInstructions(prompts.companionSystemPrompt, options.instructions)

  const companionReply = await callCompanion(companionSystemPrompt, userText, {
    endpoint: options.endpoint,
    apiKey: options.apiKey,
    model: options.model,
    temperature: options.temperature,
    topP: options.topP,
    maxTokens: options.maxTokens,
  })
  console.log(`  -> companion: ${companionReply.slice(0, 60)}...`)

  return { companionReply, historyEventIds: recentEvents.map((event) => event.id) }
}

function appendUserInstructions(systemPrompt: string, instructions?: string): string {
  const trimmed = instructions?.trim()
  if (!trimmed) return systemPrompt

  return [
    systemPrompt,
    "User-configured response preferences:",
    "<response_preferences>",
    trimmed,
    "</response_preferences>",
  ].join("\n\n")
}
