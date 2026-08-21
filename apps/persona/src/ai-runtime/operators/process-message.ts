import { callAnalysis, callCompanion } from "../../infra/llm/deepseek.js"
import { getRecentEvents, type EventRow } from "../../domain/event/store.js"
import { reserveOrderedMemoryCommit } from "../../application/ordered-memory-commit.js"
import { scheduleAnalysisForEvent } from "../../application/analysis-jobs.js"
import { buildPrompts } from "../prompts/prompt-builder.js"

export interface ProcessMessageDependencies {
  callCompanion?: typeof callCompanion
  callAnalysis?: typeof callAnalysis
}

export interface ProcessMessageOptions extends ProcessMessageDependencies {
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
    memoryQuery: userText,
    ...(options.memoryEnabled === false ? { memoryText: "" } : {}),
  })
  const companionSystemPrompt = appendUserInstructions(prompts.companionSystemPrompt, options.instructions)
  const memoryCommit = options.callAnalysis ? reserveOrderedMemoryCommit() : null

  try {
    const companionReply = options.callCompanion
      ? await options.callCompanion(companionSystemPrompt, userText)
      : await callCompanion(companionSystemPrompt, userText, {
          endpoint: options.endpoint,
          apiKey: options.apiKey,
          model: options.model,
          temperature: options.temperature,
          topP: options.topP,
          maxTokens: options.maxTokens,
        })
    console.log(`  -> companion: ${companionReply.slice(0, 60)}...`)

    // Explicit Analysis dependencies belong to governed/recovery flows. Normal
    // chat requests enqueue durable background work after the reply is persisted.
    if (options.callAnalysis && memoryCommit && options.backgroundAnalysis !== false) {
      scheduleAnalysisForEvent({
        sourceEventId: eventRow.id,
        reservation: memoryCommit,
        analyze: () => options.callAnalysis!(prompts.analysisSystemPrompt, userText, prompts.historyText),
      })
    } else {
      memoryCommit?.cancel()
    }

    return {
      companionReply,
      historyEventIds: recentEvents.map((event) => event.id),
    }
  } catch (err) {
    memoryCommit?.cancel()
    throw err
  }
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
