import { assertRuntimeConfig, config } from "../config/index.js"
import { z } from "zod"

const API_URL = "https://api.deepseek.com/v1/chat/completions"

type ChatRole = "system" | "user" | "assistant"

interface ChatMessage {
  role: ChatRole
  content: string
}

interface ChatCompletionOptions {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  jsonResponse?: boolean
}

export interface AnalysisResult {
  research: {
    core_points: string[]
    hidden_assumptions: string[]
    open_questions: string[]
  }
  critic: {
    confidence: number
    counter_examples: string[]
    evidence_gaps: string[]
  }
  memory_patch: {
    profile_updates: Array<{
      key: string
      value: unknown
      confidence: number
      cooling_required?: boolean
    }>
    topic_updates: Array<{ name: string; summary?: string }>
    timeline_events: Array<{
      date: string
      type: "insight" | "shift" | "milestone"
      summary: string
    }>
  }
}

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]))

const textArraySchema = z.array(z.string().max(16_000)).max(100)

const analysisResultSchema = z.object({
  research: z.object({
    core_points: textArraySchema,
    hidden_assumptions: textArraySchema,
    open_questions: textArraySchema,
  }),
  critic: z.object({
    confidence: z.number().finite().min(0).max(1),
    counter_examples: textArraySchema,
    evidence_gaps: textArraySchema,
  }),
  memory_patch: z.object({
    profile_updates: z.array(z.object({
      key: z.string().trim().min(1).max(255),
      value: jsonValueSchema,
      confidence: z.number().finite().min(0).max(1),
      cooling_required: z.boolean().optional(),
    })).max(50),
    topic_updates: z.array(z.object({
      name: z.string().trim().min(1).max(255),
      summary: z.string().trim().min(1).max(4_000).optional(),
    })).max(50),
    timeline_events: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(["insight", "shift", "milestone"]),
      summary: z.string().trim().min(1).max(4_000),
    })).max(50),
  }),
})

async function post(body: string, timeout: number): Promise<{ status: number; data: string }> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body,
    signal: AbortSignal.timeout(timeout),
  })

  const data = await response.text()
  return { status: response.status, data }
}

async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  assertRuntimeConfig(config, { requireLlm: true })

  const body = JSON.stringify({
    model: "deepseek-chat",
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    ...(options.jsonResponse ? { response_format: { type: "json_object" } } : {}),
  })

  let status: number
  let data: string
  try {
    const result = await post(body, 20000)
    status = result.status
    data = result.data
  } catch (err) {
    throw new Error(`DeepSeek request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (status !== 200) throw new Error(`DeepSeek API ${status}: ${sanitizeProviderError(data)}`)

  let parsed: { choices?: Array<{ message?: { content?: string } }> }
  try {
    parsed = JSON.parse(data) as { choices?: Array<{ message?: { content?: string } }> }
  } catch {
    throw new Error("DeepSeek returned non-JSON response")
  }
  const content = parsed.choices?.[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")

  return content
}

export async function callCompanion(systemPrompt: string, userMessage: string): Promise<string> {
  if (config.llmProvider === "mock") {
    return `[mock companion] ${userMessage}`
  }

  return createChatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.8,
    maxTokens: 1000,
  })
}

export async function callAnalysis(systemPrompt: string, userMessage: string, history?: string): Promise<AnalysisResult> {
  if (config.llmProvider === "mock") {
    return createMockAnalysisResult(userMessage, history)
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }]
  const historyText = history?.trim()

  if (historyText) {
    messages.push({ role: "user", content: historyText })
  }

  messages.push({ role: "user", content: userMessage })

  const content = await createChatCompletion({
    messages,
    temperature: 0.3,
    maxTokens: 2000,
    jsonResponse: true,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new Error("DeepSeek analysis response was not valid JSON")
  }
  return parseAnalysisResult(parsed)
}

export function parseAnalysisResult(input: unknown): AnalysisResult {
  const result = analysisResultSchema.safeParse(input)
  if (result.success) return result.data as AnalysisResult

  const paths = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "root"))]
  throw new Error(`DeepSeek analysis response failed schema validation at: ${paths.slice(0, 8).join(", ")}`)
}

function sanitizeProviderError(data: string): string {
  return data.replace(config.openaiApiKey, "[redacted]").slice(0, 200)
}

function createMockAnalysisResult(userMessage: string, history?: string): AnalysisResult {
  const trimmed = userMessage.trim()
  const topicName = trimmed.split(/\s+/).slice(0, 4).join(" ") || "mock-topic"

  return {
    research: {
      core_points: trimmed ? [trimmed] : [],
      hidden_assumptions: history?.trim() ? ["recent conversation context available"] : [],
      open_questions: [],
    },
    critic: {
      confidence: 0.5,
      counter_examples: [],
      evidence_gaps: [],
    },
    memory_patch: {
      profile_updates: [
        {
          key: "last_mock_message",
          value: trimmed,
          confidence: 0.5,
        },
      ],
      topic_updates: [
        {
          name: topicName,
          summary: "Generated by mock LLM provider for smoke testing.",
        },
      ],
      timeline_events: [
        {
          date: new Date().toISOString().slice(0, 10),
          type: "insight",
          summary: `Mock analysis observed: ${trimmed.slice(0, 80)}`,
        },
      ],
    },
  }
}
