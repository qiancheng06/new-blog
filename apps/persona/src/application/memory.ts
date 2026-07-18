import {
  getMemoryStats,
  getMemoryProfileById,
  getMemoryTopicById,
  inspectMemory,
  inspectMemorySources,
  listMemoryProfile,
  listMemoryTimelineEvents,
  listMemoryTopics,
  upsertProfileUpdates,
  updateProfileState,
  updateTopicState,
  type MemoryListState,
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
import { withTransaction } from "../infra/db/pool.js"
import {
  createMemoryProfileCorrectionEvent,
  createMemoryProfileStateEvent,
  createMemoryTopicStateEvent,
  type MemoryProjectionState,
} from "../domain/event/types.js"

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

export interface MemoryStateChangeInput {
  id: string
  state: MemoryProjectionState
  reason: string
}

export interface ProfileStateChangeResult {
  event: EventRow
  profile: ProfileRow
}

export interface TopicStateChangeResult {
  event: EventRow
  topic: TopicRow
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

  return withTransaction(() => {
    const event = insertEvent(createMemoryProfileCorrectionEvent({
      key,
      value: input.value,
      reason: input.reason?.trim() || undefined,
    }))

    const [profile] = upsertProfileUpdates(
      [{ key, value: input.value, confidence: 1 }],
      { sourceEventId: event.id, allowStaleProfile: true }
    )

    if (!profile) throw new Error("profile correction did not write a row")

    return { event, profile }
  })
}

export function changeMemoryProfileState(input: MemoryStateChangeInput): ProfileStateChangeResult {
  const normalized = normalizeStateChangeInput(input)
  const current = getMemoryProfileById(normalized.id)
  if (!current) throw new MemoryNotFoundError("profile not found")

  return withTransaction(() => {
    const event = insertEvent(createMemoryProfileStateEvent({
      target_id: current.id,
      target_key: current.key,
      reason: normalized.reason,
      mode: stateToMode(normalized.state),
    }))
    const profile = updateProfileState({ ...normalized, eventId: event.id })
    if (!profile) throw new MemoryNotFoundError("profile not found")
    return { event, profile }
  })
}

export function changeMemoryTopicState(input: MemoryStateChangeInput): TopicStateChangeResult {
  const normalized = normalizeStateChangeInput(input)
  const current = getMemoryTopicById(normalized.id)
  if (!current) throw new MemoryNotFoundError("topic not found")

  return withTransaction(() => {
    const event = insertEvent(createMemoryTopicStateEvent({
      target_id: current.id,
      target_key: current.name,
      reason: normalized.reason,
      mode: stateToMode(normalized.state),
    }))
    const topic = updateTopicState({ ...normalized, eventId: event.id })
    if (!topic) throw new MemoryNotFoundError("topic not found")
    return { event, topic }
  })
}

export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MemoryValidationError"
  }
}

export class MemoryNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MemoryNotFoundError"
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

export function parseMemoryListState(value: string | undefined): MemoryListState | undefined {
  if (value === "active" || value === "archived" || value === "suppressed" || value === "all") return value
  return undefined
}

function normalizeStateChangeInput(input: MemoryStateChangeInput): MemoryStateChangeInput {
  const id = input.id.trim()
  const reason = input.reason.trim()
  if (!id) throw new MemoryValidationError("id is required")
  if (!isProjectionState(input.state)) throw new MemoryValidationError("state is invalid")
  if (!reason) throw new MemoryValidationError("reason is required")
  return { id, state: input.state, reason }
}

function isProjectionState(value: string): value is MemoryProjectionState {
  return value === "active" || value === "archived" || value === "suppressed"
}

function stateToMode(state: MemoryProjectionState): "archive" | "suppress" | "restore" {
  if (state === "archived") return "archive"
  if (state === "suppressed") return "suppress"
  return "restore"
}
