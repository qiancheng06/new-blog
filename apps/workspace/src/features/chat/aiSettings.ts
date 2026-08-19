export interface AiSettingsConfig {
  connectionMode: "server" | "custom"
  endpoint: string
  model: string
  apiKey: string
  temperature: number
  topP: number
  maxTokens: number
  historyLimit: number
  memoryEnabled: boolean
  backgroundAnalysis: boolean
  instructions: string
}

export const AI_SETTINGS_KEY = "persona-ai-settings"
export const AI_API_KEY_SESSION_KEY = "persona-ai-api-key"

export const defaultAiSettings: AiSettingsConfig = {
  connectionMode: "server",
  endpoint: "",
  model: "",
  apiKey: "",
  temperature: 0.8,
  topP: 1,
  maxTokens: 1000,
  historyLimit: 10,
  memoryEnabled: true,
  backgroundAnalysis: true,
  instructions: "",
}

export function parseAiSettings(value: string | null): AiSettingsConfig {
  if (!value) return defaultAiSettings

  try {
    const parsed = JSON.parse(value) as Partial<AiSettingsConfig>
    return {
      connectionMode: parsed.connectionMode === "custom" ? "custom" : "server",
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint.slice(0, 2048) : "",
      model: typeof parsed.model === "string" ? parsed.model.slice(0, 200) : "",
      apiKey: "",
      temperature: clamp(Number(parsed.temperature ?? defaultAiSettings.temperature), 0, 2),
      topP: clamp(Number(parsed.topP ?? defaultAiSettings.topP), 0.1, 1),
      maxTokens: Math.round(clamp(Number(parsed.maxTokens ?? defaultAiSettings.maxTokens), 128, 4096)),
      historyLimit: Math.round(clamp(Number(parsed.historyLimit ?? defaultAiSettings.historyLimit), 0, 10)),
      memoryEnabled: parsed.memoryEnabled !== false,
      backgroundAnalysis: parsed.backgroundAnalysis !== false,
      instructions: typeof parsed.instructions === "string" ? parsed.instructions.slice(0, 1000) : "",
    }
  } catch {
    return defaultAiSettings
  }
}

export function getAiSettingsError(value: AiSettingsConfig): string | null {
  if (value.connectionMode !== "custom") return null
  if (!value.endpoint.trim()) return "请填写 API 地址"
  if (!value.model.trim()) return "请填写模型名称"

  let endpoint: URL
  try {
    endpoint = new URL(value.endpoint)
  } catch {
    return "API 地址格式无效"
  }

  const localHttp = endpoint.protocol === "http:"
    && (endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]")
  if (endpoint.protocol !== "https:" && !localHttp) return "远程 API 地址必须使用 HTTPS"
  if (!localHttp && !value.apiKey.trim()) return "请填写 API Key"
  return null
}

export function buildAiRequest(value: AiSettingsConfig): Omit<AiSettingsConfig, "connectionMode"> {
  const { connectionMode, endpoint, model, apiKey, ...generationSettings } = value
  return {
    ...generationSettings,
    endpoint: connectionMode === "custom" ? endpoint : "",
    model: connectionMode === "custom" ? model : "",
    apiKey: connectionMode === "custom" ? apiKey : "",
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
