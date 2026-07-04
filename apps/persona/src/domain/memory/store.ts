import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"
import type { MemoryPatch, MemoryPatchWriteOptions, ProfileUpdate, TimelineEventPatch, TopicUpdate } from "./types.js"

export interface TopicRow {
  id: string
  name: string
  first_seen_at: string
  last_active_at: string
  message_count: number
  summary: string
  related_topics: string
}

export interface ProfileRow {
  id: string
  key: string
  value: string
  source_event_id: string | null
  updated_at: string
}

export interface TimelineEventRow {
  id: string
  date: string
  type: "insight" | "shift" | "milestone"
  summary: string
  source_event_id: string | null
  created_at: string
}

export interface MemoryPatchWriteResult {
  topics: TopicRow[]
  profile: ProfileRow[]
  timelineEvents: TimelineEventRow[]
}

export interface MemoryContext {
  topics: TopicRow[]
  profile: ProfileRow[]
  timelineEvents: TimelineEventRow[]
}

export interface MemoryStats {
  topics: number
  profile: number
  timelineEvents: number
}

export interface MemoryListOptions {
  limit?: number
  offset?: number
}

export interface TopicListOptions extends MemoryListOptions {
  name?: string
}

export interface ProfileListOptions extends MemoryListOptions {
  key?: string
}

export interface TimelineListOptions extends MemoryListOptions {
  type?: TimelineEventRow["type"]
  date?: string
  sourceEventId?: string
}

export interface MemoryInspection {
  stats: MemoryStats
  topics: TopicRow[]
  profile: ProfileRow[]
  timelineEvents: TimelineEventRow[]
}

export interface MemorySourceInspection {
  profileWithSource: number
  profileMissingSource: number
  timelineWithSource: number
  timelineMissingSource: number
}

export function applyMemoryPatch(patch: MemoryPatch, options: MemoryPatchWriteOptions = {}): MemoryPatchWriteResult {
  return {
    topics: upsertTopicUpdates(patch.topic_updates),
    profile: upsertProfileUpdates(patch.profile_updates, options),
    timelineEvents: appendTimelineEvents(patch.timeline_events, options),
  }
}

export function getMemoryContext(options: { topicLimit?: number; profileLimit?: number; timelineLimit?: number } = {}): MemoryContext {
  const topicLimit = normalizeLimit(options.topicLimit ?? 8)
  const profileLimit = normalizeLimit(options.profileLimit ?? 12)
  const timelineLimit = normalizeLimit(options.timelineLimit ?? 8)

  return {
    topics: query<TopicRow>(
      `SELECT * FROM topics ORDER BY last_active_at DESC, message_count DESC LIMIT ?`,
      [topicLimit]
    ),
    profile: query<ProfileRow>(
      `SELECT * FROM profile ORDER BY updated_at DESC LIMIT ?`,
      [profileLimit]
    ),
    timelineEvents: query<TimelineEventRow>(
      `SELECT * FROM timeline_events ORDER BY date DESC, created_at DESC LIMIT ?`,
      [timelineLimit]
    ),
  }
}

export function getMemoryStats(): MemoryStats {
  return {
    topics: readCount("topics"),
    profile: readCount("profile"),
    timelineEvents: readCount("timeline_events"),
  }
}

export function inspectMemory(options: {
  topicLimit?: number
  profileLimit?: number
  timelineLimit?: number
} = {}): MemoryInspection {
  const context = getMemoryContext(options)
  return {
    stats: getMemoryStats(),
    topics: context.topics,
    profile: context.profile,
    timelineEvents: context.timelineEvents,
  }
}

export function listMemoryTopics(options: TopicListOptions = {}): TopicRow[] {
  const params: unknown[] = []
  const where: string[] = []

  if (options.name?.trim()) {
    where.push("name LIKE ?")
    params.push(`%${options.name.trim()}%`)
  }

  params.push(normalizeLimit(options.limit ?? 20))
  params.push(normalizeOffset(options.offset ?? 0))

  return query<TopicRow>(
    `SELECT * FROM topics
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY last_active_at DESC, message_count DESC
     LIMIT ? OFFSET ?`,
    params
  )
}

export function listMemoryProfile(options: ProfileListOptions = {}): ProfileRow[] {
  const params: unknown[] = []
  const where: string[] = []

  if (options.key?.trim()) {
    where.push("key LIKE ?")
    params.push(`%${options.key.trim()}%`)
  }

  params.push(normalizeLimit(options.limit ?? 20))
  params.push(normalizeOffset(options.offset ?? 0))

  return query<ProfileRow>(
    `SELECT * FROM profile
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    params
  )
}

export function listMemoryTimelineEvents(options: TimelineListOptions = {}): TimelineEventRow[] {
  const params: unknown[] = []
  const where: string[] = []

  if (options.type) {
    where.push("type = ?")
    params.push(options.type)
  }
  if (options.date?.trim()) {
    where.push("date = ?")
    params.push(options.date.trim())
  }
  if (options.sourceEventId?.trim()) {
    where.push("source_event_id = ?")
    params.push(options.sourceEventId.trim())
  }

  params.push(normalizeLimit(options.limit ?? 20))
  params.push(normalizeOffset(options.offset ?? 0))

  return query<TimelineEventRow>(
    `SELECT * FROM timeline_events
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY date DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    params
  )
}

export function inspectMemorySources(): MemorySourceInspection {
  return {
    profileWithSource: readSourceCount("profile", true),
    profileMissingSource: readSourceCount("profile", false),
    timelineWithSource: readSourceCount("timeline_events", true),
    timelineMissingSource: readSourceCount("timeline_events", false),
  }
}

export function buildMemoryContextText(context: MemoryContext = getMemoryContext()): string {
  const lines: string[] = []

  if (context.profile.length > 0) {
    lines.push("Profile:")
    for (const item of context.profile) {
      lines.push(`- ${item.key}: ${formatProfileValue(item.value)}`)
    }
  }

  if (context.topics.length > 0) {
    lines.push("Topics:")
    for (const topic of context.topics) {
      const summary = topic.summary ? ` - ${topic.summary}` : ""
      lines.push(`- ${topic.name}${summary}`)
    }
  }

  if (context.timelineEvents.length > 0) {
    lines.push("Timeline:")
    for (const event of context.timelineEvents) {
      lines.push(`- ${event.date} [${event.type}] ${event.summary}`)
    }
  }

  return lines.join("\n")
}

export function upsertTopicUpdates(updates: TopicUpdate[]): TopicRow[] {
  return updates
    .map(normalizeTopicUpdate)
    .filter((update): update is TopicUpdate => update !== null)
    .map((update) => upsertTopic(update))
}

export function upsertProfileUpdates(
  updates: ProfileUpdate[],
  options: MemoryPatchWriteOptions = {}
): ProfileRow[] {
  return updates
    .map(normalizeProfileUpdate)
    .filter((update): update is ProfileUpdate => update !== null)
    .map((update) => upsertProfile(update, options))
}

export function appendTimelineEvents(
  events: TimelineEventPatch[],
  options: MemoryPatchWriteOptions = {}
): TimelineEventRow[] {
  return events
    .map(normalizeTimelineEvent)
    .filter((event): event is TimelineEventPatch => event !== null)
    .map((event) => appendTimelineEvent(event, options))
}

function upsertTopic(update: TopicUpdate): TopicRow {
  const existing = queryOne<TopicRow>("SELECT * FROM topics WHERE name = ?", [update.name])
  const summary = update.summary ?? existing?.summary ?? ""

  if (existing) {
    run(
      `UPDATE topics
       SET last_active_at = datetime('now'),
           message_count = message_count + 1,
           summary = ?
       WHERE id = ?`,
      [summary, existing.id]
    )
    return queryOne<TopicRow>("SELECT * FROM topics WHERE id = ?", [existing.id])!
  }

  const id = randomUUID()
  run(
    `INSERT INTO topics (id, name, summary, message_count)
     VALUES (?, ?, ?, 1)`,
    [id, update.name, summary]
  )
  return queryOne<TopicRow>("SELECT * FROM topics WHERE id = ?", [id])!
}

function upsertProfile(update: ProfileUpdate, options: MemoryPatchWriteOptions): ProfileRow {
  const existing = queryOne<ProfileRow>("SELECT * FROM profile WHERE key = ?", [update.key])
  const value = JSON.stringify(update.value)

  if (existing) {
    const sourceEventId = options.sourceEventId ?? existing.source_event_id
    run(
      `UPDATE profile
       SET value = ?,
           source_event_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [value, sourceEventId, existing.id]
    )
    return queryOne<ProfileRow>("SELECT * FROM profile WHERE id = ?", [existing.id])!
  }

  const id = randomUUID()
  run(
    `INSERT INTO profile (id, key, value, source_event_id)
     VALUES (?, ?, ?, ?)`,
    [id, update.key, value, options.sourceEventId ?? null]
  )
  return queryOne<ProfileRow>("SELECT * FROM profile WHERE id = ?", [id])!
}

function appendTimelineEvent(event: TimelineEventPatch, options: MemoryPatchWriteOptions): TimelineEventRow {
  const id = randomUUID()
  run(
    `INSERT INTO timeline_events (id, date, type, summary, source_event_id)
     VALUES (?, ?, ?, ?, ?)`,
    [id, event.date, event.type, event.summary, options.sourceEventId ?? null]
  )
  return queryOne<TimelineEventRow>("SELECT * FROM timeline_events WHERE id = ?", [id])!
}

function normalizeTopicUpdate(update: TopicUpdate): TopicUpdate | null {
  const name = update.name.trim()
  if (!name) return null

  const summary = update.summary?.trim()
  return summary ? { name, summary } : { name }
}

function normalizeProfileUpdate(update: ProfileUpdate): ProfileUpdate | null {
  if (update.cooling_required) return null

  const key = update.key.trim()
  if (!key) return null

  return {
    ...update,
    key,
  }
}

function normalizeTimelineEvent(event: TimelineEventPatch): TimelineEventPatch | null {
  const date = event.date.trim()
  const summary = event.summary.trim()
  if (!date || !summary) return null
  const type = normalizeTimelineType((event as { type?: unknown }).type)

  return {
    date,
    type,
    summary,
  }
}

function normalizeTimelineType(type: unknown): TimelineEventPatch["type"] {
  if (type === "insight" || type === "shift" || type === "milestone") return type
  return "insight"
}

function formatProfileValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.join(", ")
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed)
    return String(parsed)
  } catch {
    return value
  }
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1
  return Math.max(1, Math.floor(limit))
}

function normalizeOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.floor(offset))
}

function readCount(tableName: "topics" | "profile" | "timeline_events"): number {
  const row = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`)
  return row ? Number(row.count) : 0
}

function readSourceCount(tableName: "profile" | "timeline_events", sourceExists: boolean): number {
  const condition = sourceExists
    ? "m.source_event_id IS NOT NULL AND e.id IS NOT NULL"
    : "m.source_event_id IS NOT NULL AND e.id IS NULL"
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM ${tableName} m
     LEFT JOIN events e ON e.id = m.source_event_id
     WHERE ${condition}`
  )
  return row ? Number(row.count) : 0
}
