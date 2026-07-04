import {
  getMemoryStats,
  inspectMemory,
  inspectMemorySources,
  listMemoryProfile,
  listMemoryTimelineEvents,
  listMemoryTopics,
  type MemoryInspection,
  type MemorySourceInspection,
  type ProfileListOptions,
  type ProfileRow,
  type TimelineEventRow,
  type TimelineListOptions,
  type TopicListOptions,
  type TopicRow,
} from "../domain/memory/index.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export interface PagedMemoryResult<T> {
  items: T[]
  limit: number
  offset: number
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
