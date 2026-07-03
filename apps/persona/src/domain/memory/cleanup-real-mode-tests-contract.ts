import { createCleanupTestTag, inspectRealModeTestData, applyCleanup } from "./cleanup-real-mode-tests.js"

const { initializeDb, queryOne, run } = await import("../../infra/db/pool.js")
const { insertEvent } = await import("../event/store.js")
const { applyMemoryPatch } = await import("./store.js")

initializeDb()

const tag = createCleanupTestTag()
const event = insertEvent({
  source: "web",
  type: "message",
  payload: { text: `real-mode cleanup contract ${tag}` },
  timestamp: new Date().toISOString(),
  metadata: { evaluation_tag: tag },
})

try {
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
    { sourceEventId: event.id },
  )

  const preview = inspectRealModeTestData(tag)
  assert(preview.counts.events === 1, "preview must find tagged event")
  assert(preview.counts.profile === 1, "preview must find profile from tagged event")
  assert(preview.counts.timelineEvents === 1, "preview must find timeline from tagged event")
  assert(preview.counts.possibleTopics === 1, "preview must report possible topic")

  assert(queryOne("SELECT id FROM events WHERE id = ?", [event.id]), "dry-run must not delete event")

  applyCleanup(preview)

  assert(!queryOne("SELECT id FROM timeline_events WHERE source_event_id = ?", [event.id]), "timeline should be cleaned")
  assert(queryOne("SELECT id FROM profile WHERE source_event_id = ?", [event.id]), "profile should require review, not auto-delete")
  assert(queryOne("SELECT id FROM events WHERE id = ?", [event.id]), "event should require review, not auto-delete")
  assert(queryOne("SELECT id FROM topics WHERE name = ?", [tag]), "topic should not be auto-deleted")

  console.log("real-mode cleanup contract ok")
} finally {
  run("DELETE FROM timeline_events WHERE source_event_id = ?", [event.id])
  run("DELETE FROM profile WHERE source_event_id = ?", [event.id])
  run("DELETE FROM events WHERE id = ?", [event.id])
  run("DELETE FROM topics WHERE name = ?", [tag])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
