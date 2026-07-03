import { randomUUID } from "crypto"
import { query, run } from "../../infra/db/pool.js"
import { pathToFileURL } from "url"

interface CleanupOptions {
  tag: string
  apply: boolean
}

interface CleanupPreview {
  tag: string
  eventIds: string[]
  counts: {
    events: number
    profile: number
    timelineEvents: number
    possibleTopics: number
  }
  review: {
    profile: Array<{ id: string; key: string; source_event_id: string | null }>
    events: Array<{ id: string; source: string; type: string; timestamp: string }>
  }
  possibleTopics: Array<{ id: string; name: string; summary: string }>
}

interface EventIdRow {
  id: string
}

interface CountRow {
  count: number
}

interface TopicRow {
  id: string
  name: string
  summary: string
}

interface ProfileReviewRow {
  id: string
  key: string
  source_event_id: string | null
}

interface EventReviewRow {
  id: string
  source: string
  type: string
  timestamp: string
}

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const preview = inspectRealModeTestData(options.tag)

    printPreview(preview, options.apply)

    if (options.apply) {
      applyCleanup(preview)
      console.log("cleanup applied")
    } else {
      console.log("dry run only; pass --apply to delete tagged test data")
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    console.error("usage: npm.cmd run cleanup:real-mode -- --tag <evaluation-run-id> [--apply]")
    process.exitCode = 1
  }
}

export function inspectRealModeTestData(tag: string): CleanupPreview {
  const normalizedTag = normalizeTag(tag)
  const like = `%${normalizedTag}%`
  const eventIds = query<EventIdRow>(
    `SELECT id FROM events
     WHERE payload LIKE ? OR metadata LIKE ?
     ORDER BY created_at DESC`,
    [like, like],
  ).map((row) => row.id)

  const possibleTopics = query<TopicRow>(
    `SELECT id, name, summary FROM topics
     WHERE name LIKE ? OR summary LIKE ?
     ORDER BY last_active_at DESC`,
    [like, like],
  )

  return {
    tag: normalizedTag,
    eventIds,
    counts: {
      events: eventIds.length,
      profile: eventIds.length > 0 ? countBySourceEvents("profile", eventIds) : 0,
      timelineEvents: eventIds.length > 0 ? countBySourceEvents("timeline_events", eventIds) : 0,
      possibleTopics: possibleTopics.length,
    },
    review: {
      profile: eventIds.length > 0 ? listProfileBySourceEvents(eventIds) : [],
      events: eventIds.length > 0 ? listEvents(eventIds) : [],
    },
    possibleTopics,
  }
}

export function applyCleanup(preview: CleanupPreview): void {
  if (preview.eventIds.length === 0) return

  deleteBySourceEvents("timeline_events", preview.eventIds)
}

export function normalizeTag(tag: string): string {
  const normalized = tag.trim()
  if (normalized.length < 8) {
    throw new Error("cleanup tag must be at least 8 characters")
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error("cleanup tag may only contain letters, numbers, dot, underscore, colon, and hyphen")
  }
  return normalized
}

function countBySourceEvents(tableName: "profile" | "timeline_events", eventIds: string[]): number {
  const row = query<CountRow>(
    `SELECT COUNT(*) as count FROM ${tableName} WHERE source_event_id IN (${placeholders(eventIds)})`,
    eventIds,
  )[0]
  return row ? Number(row.count) : 0
}

function listProfileBySourceEvents(eventIds: string[]): ProfileReviewRow[] {
  return query<ProfileReviewRow>(
    `SELECT id, key, source_event_id FROM profile WHERE source_event_id IN (${placeholders(eventIds)}) ORDER BY updated_at DESC`,
    eventIds,
  )
}

function listEvents(eventIds: string[]): EventReviewRow[] {
  return query<EventReviewRow>(
    `SELECT id, source, type, timestamp FROM events WHERE id IN (${placeholders(eventIds)}) ORDER BY timestamp DESC`,
    eventIds,
  )
}

function deleteBySourceEvents(tableName: "profile" | "timeline_events", eventIds: string[]): void {
  run(
    `DELETE FROM ${tableName} WHERE source_event_id IN (${placeholders(eventIds)})`,
    eventIds,
  )
}

function placeholders(items: unknown[]): string {
  return items.map(() => "?").join(", ")
}

function parseArgs(args: string[]): CleanupOptions {
  const tagIndex = args.indexOf("--tag")
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : ""
  return {
    tag: normalizeTag(tag || ""),
    apply: args.includes("--apply"),
  }
}

function printPreview(preview: CleanupPreview, apply: boolean): void {
  console.log("Real-mode test data cleanup")
  console.log(`mode: ${apply ? "apply" : "dry-run"}`)
  console.log(`tag: ${preview.tag}`)
  console.log(`events requiring review (not auto-deleted): ${preview.counts.events}`)
  console.log(`profile rows requiring review (not auto-deleted): ${preview.counts.profile}`)
  console.log(`timeline rows from tagged events: ${preview.counts.timelineEvents}`)
  console.log(`possible topics containing tag (not auto-deleted): ${preview.counts.possibleTopics}`)

  if (preview.review.profile.length > 0) {
    for (const item of preview.review.profile.slice(0, 10)) {
      console.log(`  profile ${item.id}: ${item.key}`)
    }
  }

  if (preview.possibleTopics.length > 0) {
    for (const topic of preview.possibleTopics.slice(0, 10)) {
      console.log(`  topic ${topic.id}: ${topic.name} - ${topic.summary}`)
    }
  }
}

export function createCleanupTestTag(): string {
  return `cleanup-test-${randomUUID()}`
}

function isMain(): boolean {
  const entry = process.argv[1]
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href)
}
