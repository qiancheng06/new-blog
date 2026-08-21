import Database from "better-sqlite3"
import { readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { migrateProjectTodoSchema } from "./project-todo-migration.js"

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

  db.prepare(
    `INSERT INTO events (id, source, type, payload, timestamp, metadata)
     VALUES (?, 'web', 'project', '{}', datetime('now'), '{}')`,
  ).run("00000000-0000-4000-8000-000000000009")
  db.prepare(
    `INSERT INTO projects (id, source_event_id, name, topics, summary)
     VALUES (?, ?, 'schema contract Project', '["architecture"]', 'Project constraint fixture')`,
  ).run(
    "00000000-0000-4000-8000-000000000010",
    "00000000-0000-4000-8000-000000000009",
  )
  const initialWorkingState = db.prepare(
    "SELECT id, current_project_id, active_topics, current_questions, mode FROM working_state",
  ).get() as {
    id?: string
    current_project_id?: string | null
    active_topics?: string
    current_questions?: string
    mode?: string
  } | undefined
  assert(
    initialWorkingState?.id === "primary" &&
    initialWorkingState.current_project_id === null &&
    initialWorkingState.active_topics === "[]" &&
    initialWorkingState.current_questions === "[]" &&
    initialWorkingState.mode === "S1",
    "fresh schema must create the default Working State singleton",
  )
  assertConstraintRejects(
    () => db.prepare("INSERT INTO working_state (id) VALUES ('secondary')").run(),
    "Working State must remain a singleton",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE working_state SET mode = 'S5'").run(),
    "Working State must reject unknown modes",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE working_state SET active_topics = 'not-json'").run(),
    "Working State topics must remain a JSON array",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE working_state SET current_questions = '{}'").run(),
    "Working State questions must remain a JSON array",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE working_state SET current_project_id = 'missing-project'").run(),
    "Working State current Project must retain referential integrity",
  )
  db.prepare(
    `UPDATE working_state
     SET current_project_id = ?, active_topics = '["architecture"]',
         current_questions = '["What closes the MVP?"]'`,
  ).run("00000000-0000-4000-8000-000000000010")
  const selectedProject = db.prepare(
    "SELECT current_project_id FROM working_state WHERE id = 'primary'",
  ).get() as { current_project_id?: string } | undefined
  assert(
    selectedProject?.current_project_id === "00000000-0000-4000-8000-000000000010",
    "Working State must reference a Project",
  )
  db.prepare(
    `UPDATE working_state
     SET current_project_id = NULL, active_topics = '[]', current_questions = '[]'`,
  ).run()
  assertConstraintRejects(
    () => db.prepare("UPDATE projects SET status = 'running'").run(),
    "Projects must reject unknown statuses",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE projects SET topics = 'not-json'").run(),
    "Project topics must remain a JSON array",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE projects SET status = 'done'").run(),
    "Completed Projects must require a completion timestamp",
  )
  db.prepare(
    `UPDATE projects
     SET status = 'done', state_event_id = ?, state_reason = 'schema contract',
         completed_at = datetime('now')
     WHERE id = ?`,
  ).run(
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000010",
  )

  db.prepare(
    `INSERT INTO events (id, source, type, payload, timestamp, metadata)
     VALUES (?, 'web', 'todo', '{}', datetime('now'), '{}')`,
  ).run("00000000-0000-4000-8000-000000000007")
  db.prepare(
    `INSERT INTO todos (id, source_event_id, project_id, title, due_date)
     VALUES (?, ?, ?, 'schema contract Todo', '2099-04-01')`,
  ).run(
    "00000000-0000-4000-8000-000000000008",
    "00000000-0000-4000-8000-000000000007",
    "00000000-0000-4000-8000-000000000010",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE todos SET status = 'running'").run(),
    "Todos must reject unknown statuses",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE todos SET status = 'done'").run(),
    "Completed Todos must require a completion timestamp",
  )
  db.prepare(
    `UPDATE todos
     SET status = 'done', state_event_id = ?, state_reason = 'schema contract',
         completed_at = datetime('now')
     WHERE id = ?`,
  ).run(
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000008",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE todos SET due_date = '2099/04/01'").run(),
    "Todo due dates must use the ISO date shape",
  )

  db.prepare("INSERT INTO daily_summary_runs (date) VALUES ('2099-01-01')").run()
  for (const errorCode of ["", "generation_error", "archive_error", "state_error", "interrupted"]) {
    db.prepare("UPDATE daily_summary_runs SET error_code = ? WHERE date = '2099-01-01'").run(errorCode)
  }
  assertConstraintRejects(
    () => db.prepare("UPDATE daily_summary_runs SET error_code = 'analysis_error'").run(),
    "Daily Summary runs must reject Analysis error codes",
  )

  db.prepare("INSERT INTO persona_snapshot_runs (date) VALUES ('2099-01-02')").run()
  for (const errorCode of ["", "archive_error", "archive_unavailable", "archive_conflict", "state_error", "interrupted"]) {
    db.prepare("UPDATE persona_snapshot_runs SET error_code = ? WHERE date = '2099-01-02'").run(errorCode)
  }
  assertConstraintRejects(
    () => db.prepare("UPDATE persona_snapshot_runs SET error_code = 'generation_error'").run(),
    "Persona Snapshot runs must reject Daily Summary error codes",
  )
  assertConstraintRejects(
    () => db.prepare("UPDATE persona_snapshot_runs SET status = 'archived'").run(),
    "Persona Snapshot runs must reject unknown statuses",
  )

  verifyLegacyProjectTodoMigration(schema)

  const integrity = db.pragma("integrity_check", { simple: true })
  assert(integrity === "ok", `fresh schema integrity check failed: ${String(integrity)}`)
  console.log("database schema contract ok")
} finally {
  db.close()
  rmSync(databasePath, { force: true })
}

function verifyLegacyProjectTodoMigration(currentSchema: string): void {
  const legacy = new Database(":memory:")
  try {
    legacy.pragma("foreign_keys = ON")
    legacy.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        topics TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        state_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
        state_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        cancelled_at TEXT
      );
      INSERT INTO events (id, source, type, payload, timestamp)
      VALUES ('legacy-event', 'web', 'todo', '{}', datetime('now'));
      INSERT INTO projects (id, name, updated_at)
      VALUES ('legacy-project', 'Legacy Project', '2026-01-02 03:04:05');
      INSERT INTO todos (id, source_event_id, title)
      VALUES ('legacy-todo', 'legacy-event', 'Legacy Todo');
    `)

    legacy.exec(currentSchema)
    migrateProjectTodoSchema(legacy)

    const projectColumns = new Set(
      (legacy.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>).map((column) => column.name),
    )
    const todoColumns = new Set(
      (legacy.prepare("PRAGMA table_info(todos)").all() as Array<{ name: string }>).map((column) => column.name),
    )
    for (const column of ["source_event_id", "state_event_id", "state_reason", "created_at", "completed_at", "archived_at"]) {
      assert(projectColumns.has(column), `legacy Project migration missing ${column}`)
    }
    for (const column of ["project_id", "project_event_id", "project_reason"]) {
      assert(todoColumns.has(column), `legacy Todo migration missing ${column}`)
    }
    const project = legacy.prepare("SELECT created_at FROM projects WHERE id = 'legacy-project'").get() as {
      created_at?: string
    }
    assert(project.created_at === "2026-01-02 03:04:05", "legacy Project migration must backfill created_at")
    legacy.prepare("UPDATE todos SET project_id = 'legacy-project' WHERE id = 'legacy-todo'").run()
    const linked = legacy.prepare("SELECT project_id FROM todos WHERE id = 'legacy-todo'").get() as {
      project_id?: string
    }
    assert(linked.project_id === "legacy-project", "legacy Todo migration must support Project relationships")
    assert(
      legacy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_todos_project_status'").get(),
      "legacy Todo migration must create relationship index",
    )
  } finally {
    legacy.close()
  }
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
