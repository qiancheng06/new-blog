import { callCompanion, callAnalysis } from "../../infra/llm/deepseek.js"
import { getRecentEvents } from "../../domain/event/store.js"
import type { EventRow } from "../../domain/event/store.js"
import { reserveOrderedMemoryCommit } from "../../application/ordered-memory-commit.js"
import { scheduleAnalysisForEvent } from "../../application/analysis-jobs.js"
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
  const prompts = buildPrompts({ recentEvents, memoryQuery: userText })
  const memoryCommit = reserveOrderedMemoryCommit()
  const companion = dependencies.callCompanion ?? callCompanion
  const analysis = dependencies.callAnalysis ?? callAnalysis

  try {
    const companionReply = await companion(prompts.companionSystemPrompt, userText)
    console.log(`  -> companion: ${companionReply.slice(0, 60)}...`)

    scheduleAnalysisForEvent({
      sourceEventId: eventRow.id,
      reservation: memoryCommit,
      analyze: () => analysis(prompts.analysisSystemPrompt, userText, prompts.historyText),
    })

    return { companionReply }
  } catch (err) {
    memoryCommit.cancel()
    throw err
  }
}
