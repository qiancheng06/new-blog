import { createCleanupTestTag, inspectRealModeTestData, applyCleanup, normalizeTag } from "./cleanup-real-mode-tests.js"

const { initializeDb, queryOne, run } = await import("../../infra/db/pool.js")
const { insertEvent } = await import("../event/store.js")
const { applyMemoryPatch } = await import("./store.js")

initializeDb()

const tag = createCleanupTestTag()
const payloadTaggedEvent = insertEvent({
  source: "web",
  type: "message",
  payload: { text: `real-mode cleanup contract ${tag}` },
  timestamp: new Date().toISOString(),
  metadata: { evaluation_tag: tag },
})
const metadataTaggedEvent = insertEvent({
  source: "telegram",
  type: "message",
  payload: { text: "real-mode cleanup contract metadata-only event" },
  timestamp: new Date().toISOString(),
  metadata: { purpose: "real_mode_evaluation", run_id: tag },
})

try {
  assertThrows(() => normalizeTag("short"), "short cleanup tags should be rejected")
  assertThrows(() => normalizeTag("invalid tag with spaces"), "cleanup tags with spaces should be rejected")
  assert(normalizeTag(`  ${tag}  `) === tag, "cleanup tag should trim surrounding whitespace")

  applyMemoryPatch(
    {
      profile_updates: [
        {
          key: `cleanup_contract_profile_${tag}`,
          value: { tag, purpose: "cleanup-contract" },
          confidence: 0.9,
        },
      ],
      topic_updates: [
        {
          name: tag,
          summary: `Possible topic from ${tag}; cleanup tool must not auto-delete topics.`,
        },
      ],
      timeline_events: [
        {
          date: "2026-07-03",
          type: "insight",
          summary: `Cleanup contract timeline ${tag}`,
        },
      ],
    },
    { sourceEventId: payloadTaggedEvent.id },
  )
  applyMemoryPatch(
    {
      profile_updates: [
        {
          key: `cleanup_contract_metadata_profile_${tag}`,
          value: { tag, purpose: "cleanup-contract-metadata" },
          confidence: 0.9,
        },
      ],
      topic_updates: [],
      timeline_events: [
        {
          date: "2026-07-03",
          type: "milestone",
          summary: `Cleanup contract metadata timeline ${tag}`,
        },
      ],
    },
    { sourceEventId: metadataTaggedEvent.id },
  )

  const preview = inspectRealModeTestData(tag)
  assert(preview.counts.events === 2, "preview must find payload and metadata tagged events")
  assert(preview.eventIds.includes(payloadTaggedEvent.id), "preview must include payload tagged event")
  assert(preview.eventIds.includes(metadataTaggedEvent.id), "preview must include metadata run_id tagged event")
  assert(preview.counts.profile === 2, "preview must find profile rows from tagged events")
  assert(preview.counts.timelineEvents === 2, "preview must find timeline rows from tagged events")
  assert(preview.counts.possibleTopics === 1, "preview must report possible topic")

  assert(queryOne("SELECT id FROM events WHERE id = ?", [payloadTaggedEvent.id]), "dry-run must not delete payload event")
  assert(queryOne("SELECT id FROM events WHERE id = ?", [metadataTaggedEvent.id]), "dry-run must not delete metadata event")

  applyCleanup(preview)

  assert(!queryOne("SELECT id FROM timeline_events WHERE source_event_id = ?", [payloadTaggedEvent.id]), "payload timeline should be cleaned")
  assert(!queryOne("SELECT id FROM timeline_events WHERE source_event_id = ?", [metadataTaggedEvent.id]), "metadata timeline should be cleaned")
  assert(queryOne("SELECT id FROM profile WHERE source_event_id = ?", [payloadTaggedEvent.id]), "payload profile should require review, not auto-delete")
  assert(queryOne("SELECT id FROM profile WHERE source_event_id = ?", [metadataTaggedEvent.id]), "metadata profile should require review, not auto-delete")
  assert(queryOne("SELECT id FROM events WHERE id = ?", [payloadTaggedEvent.id]), "payload event should require review, not auto-delete")
  assert(queryOne("SELECT id FROM events WHERE id = ?", [metadataTaggedEvent.id]), "metadata event should require review, not auto-delete")
  assert(queryOne("SELECT id FROM topics WHERE name = ?", [tag]), "topic should not be auto-deleted")

  console.log("real-mode cleanup contract ok")
} finally {
  run("DELETE FROM timeline_events WHERE source_event_id IN (?, ?)", [payloadTaggedEvent.id, metadataTaggedEvent.id])
  run("DELETE FROM profile WHERE source_event_id IN (?, ?)", [payloadTaggedEvent.id, metadataTaggedEvent.id])
  run("DELETE FROM events WHERE id IN (?, ?)", [payloadTaggedEvent.id, metadataTaggedEvent.id])
  run("DELETE FROM topics WHERE name = ?", [tag])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertThrows(fn: () => unknown, message: string): void {
  try {
    fn()
  } catch {
    return
  }
  throw new Error(message)
}

export {}
