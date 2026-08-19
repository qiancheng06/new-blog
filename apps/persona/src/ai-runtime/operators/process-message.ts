import { callCompanion, callAnalysis } from "../../infra/llm/deepseek.js"
import { getRecentEvents } from "../../domain/event/store.js"
import type { EventRow } from "../../domain/event/store.js"
import { applyMemoryPatch } from "../../domain/memory/index.js"
import { trackBackgroundTask } from "../../application/background-tasks.js"
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
): Promise<{ companionReply: string }> {
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

  if (options.backgroundAnalysis !== false) {
    trackBackgroundTask(
      callAnalysis(prompts.analysisSystemPrompt, userText, prompts.historyText, {
        endpoint: options.endpoint,
        apiKey: options.apiKey,
        model: options.model,
      }).then((result) => {
      if (result.research.core_points.length > 0) {
        console.log("  [analysis]", JSON.stringify(result.research))
      }
      if (result.critic.confidence > 0) {
        console.log("  [critic]", JSON.stringify(result.critic))
      }
      if (result.memory_patch.profile_updates.length > 0 || result.memory_patch.topic_updates.length > 0) {
        console.log("  [memory]", JSON.stringify(result.memory_patch))
      }
      const written = applyMemoryPatch(result.memory_patch, { sourceEventId: eventRow.id })
      if (written.topics.length > 0 || written.profile.length > 0 || written.timelineEvents.length > 0) {
        console.log(
          `  [memory written] topics=${written.topics.length} profile=${written.profile.length} timeline=${written.timelineEvents.length}`
        )
      }
      }),
      "analysis-memory-patch",
    )
  }

  return { companionReply }
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
