import { callCompanion, callAnalysis } from "../../infra/llm/deepseek.js"
import { getRecentEvents } from "../../domain/event/store.js"
import type { EventRow } from "../../domain/event/store.js"
import { applyMemoryPatch } from "../../domain/memory/index.js"
import { trackBackgroundTask } from "../../application/background-tasks.js"
import { reserveOrderedMemoryCommit } from "../../application/ordered-memory-commit.js"
import { buildPrompts } from "../prompts/prompt-builder.js"

export interface ProcessMessageDependencies {
  callCompanion?: typeof callCompanion
  callAnalysis?: typeof callAnalysis
}

export async function processMessage(
  eventRow: EventRow,
  dependencies: ProcessMessageDependencies = {},
): Promise<{ companionReply: string }> {
  const payload = JSON.parse(eventRow.payload) as Record<string, unknown>
  const userText = (payload.text as string) || ""
  const recentEvents = getRecentEvents(21).filter((event) => event.id !== eventRow.id)
  const prompts = buildPrompts({ recentEvents })
  const memoryCommit = reserveOrderedMemoryCommit()
  const companion = dependencies.callCompanion ?? callCompanion
  const analysis = dependencies.callAnalysis ?? callAnalysis

  try {
    const companionReply = await companion(prompts.companionSystemPrompt, userText)
    console.log(`  -> companion: ${companionReply.slice(0, 60)}...`)

    trackBackgroundTask(
      memoryCommit.run(
        () => analysis(prompts.analysisSystemPrompt, userText, prompts.historyText),
        (result) => commitAnalysisResult(result, eventRow.id),
      ),
      "analysis-memory-patch",
    )

    return { companionReply }
  } catch (err) {
    memoryCommit.cancel()
    throw err
  }
}

function commitAnalysisResult(result: Awaited<ReturnType<typeof callAnalysis>>, sourceEventId: string): void {
  if (result.research.core_points.length > 0) {
    console.log("  [analysis]", JSON.stringify(result.research))
  }
  if (result.critic.confidence > 0) {
    console.log("  [critic]", JSON.stringify(result.critic))
  }
  if (result.memory_patch.profile_updates.length > 0 || result.memory_patch.topic_updates.length > 0) {
    console.log("  [memory]", JSON.stringify(result.memory_patch))
  }
  const written = applyMemoryPatch(result.memory_patch, { sourceEventId })
  if (written.topics.length > 0 || written.profile.length > 0 || written.timelineEvents.length > 0) {
    console.log(
      `  [memory written] topics=${written.topics.length} profile=${written.profile.length} timeline=${written.timelineEvents.length}`
    )
  }
}
