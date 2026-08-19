import { callCompanion, type CompanionCompletionOptions } from "../infra/llm/deepseek.js"

export interface ModelConnectionTestResult {
  reply: string
  latencyMs: number
}

export async function testModelConnection(options: CompanionCompletionOptions = {}): Promise<ModelConnectionTestResult> {
  const startedAt = performance.now()
  const reply = await callCompanion(
    "You are a model connection probe. Follow the user request exactly and do not use memory.",
    "Reply with OK.",
    options,
  )
  return {
    reply,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
  }
}
