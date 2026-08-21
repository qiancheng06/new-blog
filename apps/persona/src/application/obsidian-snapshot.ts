import { createPersonaSnapshotExportedEvent } from "../domain/event/types.js"
import { insertEvent } from "../domain/event/store.js"
import {
  listMemoryProfile,
  listMemoryTimelineEvents,
  listMemoryTopics,
  type ProfileRow,
  type TimelineEventRow,
  type TopicRow,
} from "../domain/memory/store.js"
import { listProjects, type ProjectRecord } from "../domain/project/store.js"
import { config } from "../infra/config/index.js"
import {
  ObsidianArchiveConflictError,
  ObsidianArchiveUnavailableError,
} from "../infra/obsidian/managed-markdown-exporter.js"
import {
  exportPersonaSnapshotToObsidian,
  type PersonaSnapshotDocument,
} from "../infra/obsidian/persona-snapshot-exporter.js"
import { withTransaction } from "../infra/db/pool.js"

const SNAPSHOT_ITEM_LIMIT = 500
const PAGE_SIZE = 100

export interface PersonaSnapshotArchiveResult {
  snapshotEventId: string
  relativePath: string
  status: "created" | "updated" | "unchanged"
  exportedAt: string
  dataUpdatedThrough: string | null
  counts: {
    profile: number
    topics: number
    timeline: number
    projects: number
  }
  truncated: {
    profile: boolean
    topics: boolean
    timeline: boolean
    projects: boolean
  }
}

export class PersonaSnapshotArchiveConflictError extends Error {}
export class PersonaSnapshotArchiveUnavailableError extends Error {}

export function archivePersonaSnapshot(): PersonaSnapshotArchiveResult {
  const snapshot = buildPersonaSnapshot()
  let archive: { relativePath: string; status: "created" | "updated" | "unchanged" }
  try {
    archive = exportPersonaSnapshotToObsidian(snapshot, {
      vaultPath: config.obsidianVaultPath,
      relativeDirectory: config.obsidianSnapshotDirectory,
    })
  } catch (err) {
    if (err instanceof ObsidianArchiveConflictError) {
      throw new PersonaSnapshotArchiveConflictError(err.message)
    }
    if (err instanceof ObsidianArchiveUnavailableError) {
      throw new PersonaSnapshotArchiveUnavailableError(err.message)
    }
    throw err
  }

  const counts = {
    profile: snapshot.profile.length,
    topics: snapshot.topics.length,
    timeline: snapshot.timeline.length,
    projects: snapshot.projects.length,
  }
  return withTransaction(() => {
    const auditEvent = insertEvent(createPersonaSnapshotExportedEvent({
      relative_path: archive.relativePath,
      status: archive.status,
      counts,
      truncated: snapshot.truncated,
    }))
    return {
      snapshotEventId: auditEvent.id,
      relativePath: archive.relativePath,
      status: archive.status,
      exportedAt: auditEvent.timestamp,
      dataUpdatedThrough: snapshot.dataUpdatedThrough,
      counts,
      truncated: snapshot.truncated,
    }
  })
}

function buildPersonaSnapshot(): PersonaSnapshotDocument {
  const profile = readBoundedPages<ProfileRow>((limit, offset) => (
    listMemoryProfile({ state: "active", limit, offset })
  ))
  const topics = readBoundedPages<TopicRow>((limit, offset) => (
    listMemoryTopics({ state: "active", limit, offset })
  ))
  const timeline = readBoundedPages<TimelineEventRow>((limit, offset) => (
    listMemoryTimelineEvents({ limit, offset })
  ))
  const projects = readBoundedPages<ProjectRecord>((limit, offset) => (
    listProjects({ limit, offset })
  ))

  return {
    profile: profile.items.map((item) => ({
      key: item.key,
      value: formatProfileValue(item.value),
      updatedAt: item.updated_at,
    })),
    topics: topics.items.map((item) => ({
      name: item.name,
      summary: item.summary,
      messageCount: item.message_count,
      lastActiveAt: item.last_active_at,
    })),
    timeline: timeline.items.map((item) => ({
      date: item.date,
      type: item.type,
      summary: item.summary,
    })),
    projects: projects.items.map((item) => ({
      name: item.name,
      status: item.status,
      summary: item.summary,
      topics: item.topics,
      updatedAt: item.updated_at,
    })),
    dataUpdatedThrough: latestTimestamp([
      ...profile.items.map((item) => item.updated_at),
      ...topics.items.map((item) => item.last_active_at),
      ...timeline.items.map((item) => item.created_at),
      ...projects.items.map((item) => item.updated_at),
    ]),
    truncated: {
      profile: profile.truncated,
      topics: topics.truncated,
      timeline: timeline.truncated,
      projects: projects.truncated,
    },
  }
}

function readBoundedPages<T>(readPage: (limit: number, offset: number) => T[]): {
  items: T[]
  truncated: boolean
} {
  const items: T[] = []
  while (items.length < SNAPSHOT_ITEM_LIMIT) {
    const limit = Math.min(PAGE_SIZE, SNAPSHOT_ITEM_LIMIT - items.length)
    const page = readPage(limit, items.length)
    items.push(...page)
    if (page.length < limit) return { items, truncated: false }
  }
  return { items, truncated: readPage(1, SNAPSHOT_ITEM_LIMIT).length > 0 }
}

function latestTimestamp(values: string[]): string | null {
  let latest: { value: string; milliseconds: number } | null = null
  for (const value of values) {
    const milliseconds = Date.parse(value)
    if (!Number.isFinite(milliseconds)) continue
    if (!latest || milliseconds > latest.milliseconds) latest = { value, milliseconds }
  }
  return latest?.value ?? null
}

function formatProfileValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.map(String).join(", ")
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed)
    return String(parsed)
  } catch {
    return value
  }
}
