import {
  getMemoryStats,
  inspectMemory,
  inspectMemorySources,
  listMemoryProfile,
  listMemoryTimelineEvents,
  listMemoryTopics,
  upsertProfileUpdates,
  type MemoryInspection,
  type MemorySourceInspection,
  type ProfileListOptions,
  type ProfileRow,
  type TimelineEventRow,
  type TimelineListOptions,
  type TopicListOptions,
  type TopicRow,
} from "../domain/memory/index.js"
import { insertEvent, type EventRow } from "../domain/event/store.js"
import { createMemoryProfileCorrectionEvent } from "../domain/event/types.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export interface PagedMemoryResult<T> {
  items: T[]
  limit: number
  offset: number
}

export interface ProfileCorrectionInput {
  key: string
  value: unknown
  reason?: string
}

export interface ProfileCorrectionResult {
  event: EventRow
  profile: ProfileRow
}

export function getMemoryOverview(options: {
  topicLimit?: number
  profileLimit?: number
  timelineLimit?: number
} = {}): MemoryInspection {
  return inspectMemory({
    topicLimit: clampLimit(options.topicLimit),
    profileLimit: clampLimit(options.profileLimit),
    timelineLimit: clampLimit(options.timelineLimit),
  })
}

export function getMemoryStatusStats() {
  return getMemoryStats()
}

export function getMemoryTopics(options: TopicListOptions = {}): PagedMemoryResult<TopicRow> {
  const paging = normalizePaging(options)
  return {
    items: listMemoryTopics({ ...options, ...paging }),
    ...paging,
  }
}

export function getMemoryProfile(options: ProfileListOptions = {}): PagedMemoryResult<ProfileRow> {
  const paging = normalizePaging(options)
  return {
    items: listMemoryProfile({ ...options, ...paging }),
    ...paging,
  }
}

export function getMemoryTimelineEvents(options: TimelineListOptions = {}): PagedMemoryResult<TimelineEventRow> {
  const paging = normalizePaging(options)
  return {
    items: listMemoryTimelineEvents({ ...options, ...paging }),
    ...paging,
  }
}

export function getMemorySourceInspection(): MemorySourceInspection {
  return inspectMemorySources()
}

export function correctMemoryProfile(input: ProfileCorrectionInput): ProfileCorrectionResult {
  const key = input.key.trim()
  if (!key) throw new MemoryValidationError("key is required")

  const event = insertEvent(createMemoryProfileCorrectionEvent({
    key,
    value: input.value,
    reason: input.reason?.trim() || undefined,
  }))

  const [profile] = upsertProfileUpdates(
    [{ key, value: input.value, confidence: 1 }],
    { sourceEventId: event.id }
  )

  if (!profile) throw new Error("profile correction did not write a row")

  return { event, profile }
}

export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MemoryValidationError"
  }
}

function normalizePaging(options: { limit?: number; offset?: number }): { limit: number; offset: number } {
  return {
    limit: clampLimit(options.limit),
    offset: normalizeOffset(options.offset),
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
