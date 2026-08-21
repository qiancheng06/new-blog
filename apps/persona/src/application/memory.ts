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
  searchMemory,
  normalizeMemorySearchQuery,
  type MemorySearchResult,
} from "../domain/memory/index.js"
import {
  getMemoryProposalById,
  listMemoryProposals,
  markMemoryProposalReviewed,
  type MemoryProposalDecision,
  type MemoryProposalListOptions,
  type MemoryProposalRow,
  type MemoryProposalStatus,
} from "../domain/memory-proposal/store.js"
import { insertEvent, type EventRow } from "../domain/event/store.js"
import { withTransaction } from "../infra/db/pool.js"
import {
  createMemoryProfileCorrectionEvent,
  createMemoryProfileStateEvent,
  createMemoryProposalReviewEvent,
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

export interface MemoryProposalReviewInput {
  id: string
  decision: MemoryProposalDecision
  reason: string
}

export interface MemoryProposalReviewResult {
  event: EventRow
  proposal: MemoryProposalRow
  profile: ProfileRow | null
}

export interface MemorySearchResponse {
  items: MemorySearchResult[]
  limit: number
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

export function getMemoryProposals(
  options: MemoryProposalListOptions = {},
): PagedMemoryResult<MemoryProposalRow> {
  const paging = normalizePaging(options)
  return {
    items: listMemoryProposals({ ...options, ...paging }),
    ...paging,
  }
}

export function getMemorySearch(input: { query: string; limit?: number }): MemorySearchResponse {
  const rawQuery = input.query.trim()
  if (!rawQuery) throw new MemoryValidationError("memory search query is required")
  if (rawQuery.length > 500) throw new MemoryValidationError("memory search query is too long")
  const query = normalizeMemorySearchQuery(rawQuery)
  const limit = clampSearchLimit(input.limit)
  return { items: searchMemory(query, { limit }), limit }
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

export function reviewMemoryProposal(input: MemoryProposalReviewInput): MemoryProposalReviewResult {
  const id = input.id.trim()
  const reason = input.reason.trim()
  if (!id) throw new MemoryValidationError("proposal id is required")
  if (input.decision !== "accept" && input.decision !== "reject") {
    throw new MemoryValidationError("proposal decision is invalid")
  }
  if (!reason) throw new MemoryValidationError("reason is required")

  return withTransaction(() => {
    const current = getMemoryProposalById(id)
    if (!current) throw new MemoryNotFoundError("memory proposal not found")
    if (current.status !== "pending") throw new MemoryConflictError("memory proposal is already reviewed")

    const event = insertEvent(createMemoryProposalReviewEvent({
      proposal_id: current.id,
      source_event_id: current.source_event_id,
      proposal_key: current.proposal_key,
      decision: input.decision,
      reason,
    }))

    let profile: ProfileRow | null = null
    if (input.decision === "accept") {
      const [written] = upsertProfileUpdates(
        [{
          key: current.proposal_key,
          value: JSON.parse(current.proposed_value) as unknown,
          confidence: current.confidence,
        }],
        { sourceEventId: event.id, allowStaleProfile: true },
      )
      if (!written) throw new Error("accepted memory proposal did not write a Profile row")
      profile = written
    }

    const proposal = markMemoryProposalReviewed({
      id: current.id,
      status: input.decision === "accept" ? "accepted" : "rejected",
      reviewEventId: event.id,
      reason,
    })
    if (!proposal) throw new MemoryConflictError("memory proposal is already reviewed")
    return { event, proposal, profile }
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

export class MemoryConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MemoryConflictError"
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

function clampSearchLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10
  return Math.min(50, Math.max(1, Math.floor(value)))
}

export function parseMemoryProposalStatus(value: string | undefined): MemoryProposalStatus | undefined {
  if (value === undefined) return undefined
  if (value === "pending" || value === "accepted" || value === "rejected") return value
  throw new MemoryValidationError("memory proposal status is invalid")
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
