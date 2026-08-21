export const CAPTURE_TYPES = ["note", "idea", "journal"] as const
export type CaptureType = typeof CAPTURE_TYPES[number]

export const CAPTURE_SOURCES = ["telegram", "web"] as const
export type CaptureSource = typeof CAPTURE_SOURCES[number]

export const MAX_CAPTURE_TEXT_LENGTH = 16_000
export const MAX_CAPTURE_QUERY_LENGTH = 500

export class CaptureValueError extends Error {}

export function isCaptureType(value: unknown): value is CaptureType {
  return typeof value === "string" && CAPTURE_TYPES.includes(value as CaptureType)
}

export function isCaptureSource(value: unknown): value is CaptureSource {
  return typeof value === "string" && CAPTURE_SOURCES.includes(value as CaptureSource)
}

export function normalizeCaptureText(value: unknown): string {
  if (typeof value !== "string") throw new CaptureValueError("capture text is required")
  const text = value.trim()
  if (!text) throw new CaptureValueError("capture text is required")
  if (text.length > MAX_CAPTURE_TEXT_LENGTH) throw new CaptureValueError("capture text is too long")
  return text
}

export function normalizeCaptureQuery(value: string | undefined): string | undefined {
  const query = value?.trim()
  if (!query) return undefined
  if (query.length > MAX_CAPTURE_QUERY_LENGTH) throw new CaptureValueError("capture query is too long")
  return query
}
