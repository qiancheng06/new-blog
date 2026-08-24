import DatabaseConstructor from "better-sqlite3"
import { join, dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { readFileSync, existsSync, mkdirSync } from "fs"
import { migrateProjectTodoSchema } from "./project-todo-migration.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

const rootDir = resolveProjectRoot(__dirname)
const schemaPath = resolveSchemaPath()
const dbDir = resolve(rootDir, process.env.PERSONA_DATA_DIR?.trim() || "data")

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })

const dbPath = join(dbDir, "persona-os.db")
const _db: DatabaseConstructor.Database = new DatabaseConstructor(dbPath)

_db.pragma("journal_mode = WAL")
_db.pragma("foreign_keys = ON")

export function query<T = any>(sql: string, params?: unknown[]): T[] {
  const stmt = _db.prepare(sql)
  return (params ? stmt.all(...params) : stmt.all()) as T[]
}

export function queryOne<T = any>(sql: string, params?: unknown[]): T | null {
  const stmt = _db.prepare(sql)
  const row = params ? stmt.get(...params) : stmt.get()
  return (row as T) ?? null
}

export function run(sql: string, params?: unknown[]): DatabaseConstructor.RunResult {
  const stmt = _db.prepare(sql)
  return params ? stmt.run(...params) : stmt.run()
}

export function withTransaction<T>(work: () => T): T {
  return _db.transaction(work)()
}

export function withImmediateTransaction<T>(work: () => T): T {
  return _db.transaction(work).immediate()
}

export function initializeDb(): void {
  const sql = readFileSync(schemaPath, "utf-8")

  _db.exec(sql)

  migrateProjectionState()
  migrateProjectTodoSchema(_db)
  migrateDailyNotes()
  migrateCalendarSchema()
  rebuildMemorySearchIndex()

  console.log("database initialized")
}

function migrateProjectionState(): void {
  ensureColumn("profile", "state", "TEXT NOT NULL DEFAULT 'active'")
  ensureColumn("profile", "state_event_id", "TEXT REFERENCES events(id)")
  ensureColumn("profile", "state_reason", "TEXT NOT NULL DEFAULT ''")
  ensureColumn("profile", "state_updated_at", "TEXT")
  ensureColumn("topics", "state", "TEXT NOT NULL DEFAULT 'active'")
  ensureColumn("topics", "state_event_id", "TEXT REFERENCES events(id)")
  ensureColumn("topics", "state_reason", "TEXT NOT NULL DEFAULT ''")
  ensureColumn("topics", "state_updated_at", "TEXT")

  _db.exec("CREATE INDEX IF NOT EXISTS idx_profile_state_updated ON profile(state, updated_at DESC);")
  _db.exec("CREATE INDEX IF NOT EXISTS idx_topics_state_active ON topics(state, last_active_at DESC);")
}

function migrateDailyNotes(): void {
  ensureColumn("daily_notes", "source_event_id", "TEXT REFERENCES events(id)")
  ensureColumn("daily_notes", "updated_at", "TEXT NOT NULL DEFAULT ''")
  ensureColumn("daily_notes", "archive_path", "TEXT")
  ensureColumn("daily_notes", "archive_event_id", "TEXT REFERENCES events(id)")
  ensureColumn("daily_notes", "archived_at", "TEXT")
  ensureColumn("daily_notes", "finalized_at", "TEXT")
  _db.exec("UPDATE daily_notes SET updated_at = created_at WHERE updated_at = '';")
  _db.exec("CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date DESC);")
}

function migrateCalendarSchema(): void {
  ensureColumn("calendar_events", "series_id", "TEXT")
  ensureColumn("calendar_events", "occurrence_date", "TEXT")
  _db.exec("CREATE INDEX IF NOT EXISTS idx_calendar_events_series ON calendar_events(series_id, occurrence_date, deleted_at);")
}

function rebuildMemorySearchIndex(): void {
  _db.transaction(() => {
    _db.exec("DELETE FROM memory_search;")
    _db.exec(
      `INSERT INTO memory_search (
         entity_type, entity_id, title, body, state, source_event_id, memory_date
       )
       SELECT 'topic', id, name, summary, state, NULL, last_active_at FROM topics`,
    )
    _db.exec(
      `INSERT INTO memory_search (
         entity_type, entity_id, title, body, state, source_event_id, memory_date
       )
       SELECT 'profile', id, key, value, state, source_event_id, updated_at FROM profile`,
    )
    _db.exec(
      `INSERT INTO memory_search (
         entity_type, entity_id, title, body, state, source_event_id, memory_date
       )
       SELECT 'timeline', id, type, summary, 'active', source_event_id, date FROM timeline_events`,
    )
    _db.exec(
      `INSERT INTO memory_search (
         entity_type, entity_id, title, body, state, source_event_id, memory_date
       )
       SELECT 'daily_note', id, date,
              summary || char(10) || highlights || char(10) || topic_distribution,
              'active', source_event_id, date
       FROM daily_notes`,
    )
  })()
}

function ensureColumn(
  tableName: "profile" | "topics" | "daily_notes" | "calendar_events",
  columnName: string,
  definition: string,
): void {
  const columns = _db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  if (columns.some((column) => column.name === columnName)) return
  _db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`)
}

function resolveSchemaPath(): string {
  const candidates = [
    join(__dirname, "schema.sql"),
    join(rootDir, "apps", "persona", "src", "infra", "db", "schema.sql"),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) throw new Error(`Cannot find schema.sql. Checked: ${candidates.join(", ")}`)
  return found
}

function resolveProjectRoot(startDir: string): string {
  let current = startDir

  while (true) {
    const packagePath = join(current, "package.json")
    const personaSrcPath = join(current, "apps", "persona", "src")

    if (existsSync(packagePath) && existsSync(personaSrcPath)) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Cannot find project root from ${startDir}`)
    }
    current = parent
  }
}
