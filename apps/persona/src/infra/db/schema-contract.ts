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
