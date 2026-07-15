import { callCompanion, callAnalysis } from "../../infra/llm/deepseek.js"
import { getRecentEvents } from "../../domain/event/store.js"
import type { EventRow } from "../../domain/event/store.js"
import { applyMemoryPatch } from "../../domain/memory/index.js"
import { trackBackgroundTask } from "../../application/background-tasks.js"
import { buildPrompts } from "../prompts/prompt-builder.js"

export async function processMessage(eventRow: EventRow): Promise<{ companionReply: string }> {
  const payload = JSON.parse(eventRow.payload) as Record<string, unknown>
  const userText = (payload.text as string) || ""
  const recentEvents = getRecentEvents(21).filter((event) => event.id !== eventRow.id)
  const prompts = buildPrompts({ recentEvents })

  const companionReply = await callCompanion(prompts.companionSystemPrompt, userText)
  console.log(`  -> companion: ${companionReply.slice(0, 60)}...`)

  trackBackgroundTask(
    callAnalysis(prompts.analysisSystemPrompt, userText, prompts.historyText).then((result) => {
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

  return { companionReply }
}
