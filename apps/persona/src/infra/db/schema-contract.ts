import Database from "better-sqlite3"
import { readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const databasePath = join(tmpdir(), `persona-schema-${process.pid}-${Date.now()}.db`)
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf-8")
const db = new Database(databasePath)

try {
  db.pragma("foreign_keys = ON")
  db.exec(schema)

  db.prepare(
    `INSERT INTO events (id, source, type, payload, timestamp, metadata)
     VALUES (?, 'web', 'message', '{}', datetime('now'), '{}')`,
  ).run("00000000-0000-4000-8000-000000000001")
  db.prepare(
    `INSERT INTO profile (id, key, value, source_event_id)
     VALUES (?, 'search_contract', '"fresh schema searchable value"', ?)`,
  ).run(
    "00000000-0000-4000-8000-000000000006",
    "00000000-0000-4000-8000-000000000001",
  )
  const indexedProfile = db.prepare(
    `SELECT entity_id, state FROM memory_search
     WHERE memory_search MATCH '"searchable"' AND entity_type = 'profile'`,
  ).get() as { entity_id?: string; state?: string } | undefined
  assert(
    indexedProfile?.entity_id === "00000000-0000-4000-8000-000000000006" && indexedProfile.state === "active",
    "fresh schema Profile trigger must populate Memory search",
  )
  db.prepare("UPDATE profile SET state = 'suppressed' WHERE id = ?").run(
    "00000000-0000-4000-8000-000000000006",
  )
  const suppressedIndex = db.prepare(
    "SELECT state FROM memory_search WHERE entity_type = 'profile' AND entity_id = ?",
  ).get("00000000-0000-4000-8000-000000000006") as { state?: string } | undefined
  assert(suppressedIndex?.state === "suppressed", "Profile state trigger must update Memory search")
  db.prepare("DELETE FROM profile WHERE id = ?").run("00000000-0000-4000-8000-000000000006")
  assert(
    !db.prepare("SELECT 1 FROM memory_search WHERE entity_id = ?").get("00000000-0000-4000-8000-000000000006"),
    "Profile delete trigger must remove Memory search row",
  )
  db.prepare(
    `INSERT INTO analysis_jobs (id, source_event_id)
     VALUES (?, ?)`,
  ).run(
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000001",
  )

  for (const errorCode of ["", "analysis_error", "memory_error", "interrupted"]) {
    db.prepare("UPDATE analysis_jobs SET error_code = ? WHERE id = ?").run(
      errorCode,
      "00000000-0000-4000-8000-000000000002",
    )
  }
  assertConstraintRejects(
    () => db.prepare("UPDATE analysis_jobs SET error_code = 'generation_error'").run(),
    "Analysis jobs must reject Daily Summary error codes",
  )

  db.prepare(
    `INSERT INTO conversation_jobs (id, source_event_id)
     VALUES (?, ?)`,
  ).run(
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000001",
  )
  for (const errorCode of ["", "companion_error", "reply_error", "state_error", "interrupted"]) {
    db.prepare("UPDATE conversation_jobs SET error_code = ? WHERE id = ?").run(
      errorCode,
      "00000000-0000-4000-8000-000000000003",
    )
  }
  assertConstraintRejects(
    () => db.prepare("UPDATE conversation_jobs SET error_code = 'analysis_error'").run(),
    "Conversation jobs must reject Analysis error codes",
  )

  db.prepare(
    `INSERT INTO memory_proposals (
       id, source_event_id, proposal_type, proposal_key, proposed_value, confidence
     ) VALUES (?, ?, 'profile', 'contract_key', '"contract_value"', 0.8)`,
  ).run(
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000001",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE memory_proposals SET status = 'accepted'").run(),
    "Terminal Memory proposals must require complete review provenance",
  )
  db.prepare(
    `INSERT INTO events (id, source, type, payload, timestamp, metadata)
     VALUES (?, 'web', 'memory_proposal_accepted', '{}', datetime('now'), '{}')`,
  ).run("00000000-0000-4000-8000-000000000005")
  db.prepare(
    `UPDATE memory_proposals
     SET status = 'accepted', review_event_id = ?, review_reason = 'contract review',
         reviewed_at = datetime('now')
     WHERE id = ?`,
  ).run(
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000004",
  )
  db.prepare("UPDATE memory_proposals SET status = 'rejected' WHERE id = ?").run(
    "00000000-0000-4000-8000-000000000004",
  )
  db.prepare(
    `UPDATE memory_proposals
     SET status = 'pending', review_event_id = NULL, review_reason = '', reviewed_at = NULL
     WHERE id = ?`,
  ).run("00000000-0000-4000-8000-000000000004")
  assertConstraintRejects(
    () => db.prepare("UPDATE memory_proposals SET status = 'running'").run(),
    "Memory proposals must reject execution job statuses",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE memory_proposals SET confidence = 1.1").run(),
    "Memory proposal confidence must remain bounded",
  )

  db.prepare("INSERT INTO daily_summary_runs (date) VALUES ('2099-01-01')").run()
  for (const errorCode of ["", "generation_error", "archive_error", "state_error", "interrupted"]) {
    db.prepare("UPDATE daily_summary_runs SET error_code = ? WHERE date = '2099-01-01'").run(errorCode)
  }
  assertConstraintRejects(
    () => db.prepare("UPDATE daily_summary_runs SET error_code = 'analysis_error'").run(),
    "Daily Summary runs must reject Analysis error codes",
  )

  const integrity = db.pragma("integrity_check", { simple: true })
  assert(integrity === "ok", `fresh schema integrity check failed: ${String(integrity)}`)
  console.log("database schema contract ok")
} finally {
  db.close()
  rmSync(databasePath, { force: true })
}

function assertConstraintRejects(action: () => unknown, message: string): void {
  try {
    action()
  } catch {
    return
  }
  throw new Error(message)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
