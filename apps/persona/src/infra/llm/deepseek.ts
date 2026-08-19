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
  endpoint?: string
  apiKey?: string
  model?: string
  temperature: number
  topP?: number
  maxTokens: number
  jsonResponse?: boolean
}

export interface CompanionCompletionOptions {
  endpoint?: string
  apiKey?: string
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number
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

export interface DailySummaryResult {
  summary: string
  highlights: string[]
  topic_distribution: Record<string, number>
}

export interface DailySummaryRequest {
  date: string
  eventCount: number
  context: string
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

const dailySummaryResultSchema = z.object({
  summary: z.string().trim().min(1).max(16_000),
  highlights: z.array(z.string().trim().min(1).max(4_000)).max(50),
  topic_distribution: z.record(z.number().int().nonnegative().max(10_000)),
})

async function post(
  body: string,
  timeout: number,
  connection: { endpoint?: string; apiKey?: string } = {},
): Promise<{ status: number; data: string }> {
  const apiKey = connection.apiKey ?? config.openaiApiKey
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetch(connection.endpoint ?? API_URL, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(timeout),
  })

  const data = await response.text()
  return { status: response.status, data }
}

async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  if (!options.endpoint) assertRuntimeConfig(config, { requireLlm: true })

  const body = JSON.stringify({
    model: options.model ?? config.llmModel,
    messages: options.messages,
    temperature: options.temperature,
    ...(options.topP === undefined ? {} : { top_p: options.topP }),
    max_tokens: options.maxTokens,
    ...(options.jsonResponse ? { response_format: { type: "json_object" } } : {}),
  })

  let status: number
  let data: string
  try {
    const result = await post(body, 20000, { endpoint: options.endpoint, apiKey: options.apiKey })
    status = result.status
    data = result.data
  } catch (err) {
    throw new Error(`LLM provider request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (status !== 200) throw new Error(`LLM provider API ${status}: ${sanitizeProviderError(data, options.apiKey)}`)

  let parsed: { choices?: Array<{ message?: { content?: string } }> }
  try {
    parsed = JSON.parse(data) as { choices?: Array<{ message?: { content?: string } }> }
  } catch {
    throw new Error("LLM provider returned non-JSON response")
  }
  const content = parsed.choices?.[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")

  return content
}

export async function callCompanion(
  systemPrompt: string,
  userMessage: string,
  options: CompanionCompletionOptions = {},
): Promise<string> {
  if (config.llmProvider === "mock" && !options.endpoint) {
    return `[mock companion] ${userMessage}`
  }

  return createChatCompletion({
    endpoint: options.endpoint,
    apiKey: options.apiKey,
    model: options.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: options.temperature ?? 0.8,
    topP: options.topP,
    maxTokens: options.maxTokens ?? 1000,
  })
}

export async function callAnalysis(
  systemPrompt: string,
  userMessage: string,
  history?: string,
  connection: Pick<CompanionCompletionOptions, "endpoint" | "apiKey" | "model"> = {},
): Promise<AnalysisResult> {
  if (config.llmProvider === "mock" && !connection.endpoint) {
    return createMockAnalysisResult(userMessage, history)
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }]
  const historyText = history?.trim()

  if (historyText) {
    messages.push({ role: "user", content: historyText })
  }

  messages.push({ role: "user", content: userMessage })

  const content = await createChatCompletion({
    endpoint: connection.endpoint,
    apiKey: connection.apiKey,
    model: connection.model,
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

export async function callDailySummary(
  systemPrompt: string,
  request: DailySummaryRequest,
): Promise<DailySummaryResult> {
  if (config.llmProvider === "mock") {
    return createMockDailySummaryResult(request)
  }

  const content = await createChatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          `Daily Note date: ${request.date}`,
          `Summarizable event count: ${request.eventCount}`,
          "<daily_context>",
          request.context,
          "</daily_context>",
        ].join("\n"),
      },
    ],
    temperature: 0.2,
    maxTokens: 1600,
    jsonResponse: true,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new Error("DeepSeek daily summary response was not valid JSON")
  }
  return parseDailySummaryResult(parsed)
}

export function parseAnalysisResult(input: unknown): AnalysisResult {
  const result = analysisResultSchema.safeParse(input)
  if (result.success) return result.data as AnalysisResult

  const paths = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "root"))]
  throw new Error(`DeepSeek analysis response failed schema validation at: ${paths.slice(0, 8).join(", ")}`)
}

export function parseDailySummaryResult(input: unknown): DailySummaryResult {
  const result = dailySummaryResultSchema.safeParse(input)
  if (result.success) return result.data

  const paths = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "root"))]
  throw new Error(`DeepSeek daily summary response failed schema validation at: ${paths.slice(0, 8).join(", ")}`)
}

function sanitizeProviderError(data: string, requestApiKey?: string): string {
  let sanitized = data
  for (const secret of [requestApiKey, config.openaiApiKey]) {
    if (secret) sanitized = sanitized.replaceAll(secret, "[redacted]")
  }
  return sanitized.slice(0, 200)
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

function createMockDailySummaryResult(request: DailySummaryRequest): DailySummaryResult {
  const userLines = request.context
    .split(/\r?\n/)
    .filter((line) => line.includes(" User "))
    .map((line) => line.replace(/^\[[^\]]+\]\s+User\s+\([^)]*\):\s*/, "").trim())
    .filter(Boolean)

  const highlights = userLines.slice(-3)
  const detail = highlights.at(-1) ?? "No user activity recorded."

  return {
    summary: `[mock daily summary ${request.date}] ${request.eventCount} events. ${detail}`,
    highlights,
    topic_distribution: request.eventCount > 0 ? { conversation: request.eventCount } : {},
  }
}
