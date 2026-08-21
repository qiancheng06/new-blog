import {
  getCaptureById,
  getCaptureStats,
  listCaptures,
  type CaptureRecord,
  type CaptureStats,
} from "../domain/capture/store.js"
import {
  isCaptureSource,
  isCaptureType,
  normalizeCaptureQuery,
  normalizeCaptureText,
  CaptureValueError,
  type CaptureSource,
  type CaptureType,
} from "../domain/capture/validation.js"
import { createWebCaptureEvent } from "../domain/event/types.js"
import { handleConversationEvent } from "./conversation.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export interface CapturePage {
  items: CaptureRecord[]
  limit: number
  offset: number
}

export interface CaptureCreateResult {
  capture: CaptureRecord
  duplicate: boolean
}

export class CaptureValidationError extends Error {}
export class CaptureNotFoundError extends Error {}

export async function createCapture(input: {
  type: unknown
  text: unknown
  requestId?: string
}): Promise<CaptureCreateResult> {
  if (!isCaptureType(input.type)) throw new CaptureValidationError("capture type is invalid")
  const text = normalizeCaptureValue(() => normalizeCaptureText(input.text))
  const result = await handleConversationEvent(
    createWebCaptureEvent(input.type, { text }, { requestId: input.requestId }),
    { shouldReply: false },
  )
  const capture = getCaptureById(result.event.id)
  if (!capture) throw new Error("capture Event did not produce a readable record")
  return { capture, duplicate: result.duplicate }
}

export function getCaptures(options: {
  type?: CaptureType
  source?: CaptureSource
  query?: string
  limit?: number
  offset?: number
} = {}): CapturePage {
  const limit = clampLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  const query = normalizeCaptureValue(() => normalizeCaptureQuery(options.query))
  return {
    items: listCaptures({ ...options, query, limit, offset }),
    limit,
    offset,
  }
}

export function getCapture(idValue: string): CaptureRecord {
  const id = idValue.trim()
  if (!id) throw new CaptureValidationError("capture id is required")
  const capture = getCaptureById(id)
  if (!capture) throw new CaptureNotFoundError("capture not found")
  return capture
}

export function getCapturesStatus(): CaptureStats {
  return getCaptureStats()
}

export function parseCaptureType(value: string | undefined): CaptureType | undefined {
  if (value === undefined || value === "all") return undefined
  if (isCaptureType(value)) return value
  throw new CaptureValidationError("capture type is invalid")
}

export function parseCaptureSource(value: string | undefined): CaptureSource | undefined {
  if (value === undefined || value === "all") return undefined
  if (isCaptureSource(value)) return value
  throw new CaptureValidationError("capture source is invalid")
}

function normalizeCaptureValue<T>(work: () => T): T {
  try {
    return work()
  } catch (err) {
    if (err instanceof CaptureValueError) throw new CaptureValidationError(err.message)
    throw err
  }
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
