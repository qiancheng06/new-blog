import type DatabaseConstructor from "better-sqlite3"

export function migrateProjectTodoSchema(db: DatabaseConstructor.Database): void {
  ensureColumn(db, "projects", "source_event_id", "TEXT REFERENCES events(id) ON DELETE SET NULL")
  ensureColumn(db, "projects", "state_event_id", "TEXT REFERENCES events(id) ON DELETE SET NULL")
  ensureColumn(db, "projects", "state_reason", "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "projects", "created_at", "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "projects", "completed_at", "TEXT")
  ensureColumn(db, "projects", "archived_at", "TEXT")
  ensureColumn(db, "todos", "project_id", "TEXT REFERENCES projects(id) ON DELETE SET NULL")
  ensureColumn(db, "todos", "project_event_id", "TEXT REFERENCES events(id) ON DELETE SET NULL")
  ensureColumn(db, "todos", "project_reason", "TEXT NOT NULL DEFAULT ''")

  db.exec("UPDATE projects SET created_at = updated_at WHERE created_at = '';")
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_source_event ON projects(source_event_id);")
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_status_updated ON projects(status, updated_at DESC);")
  db.exec("CREATE INDEX IF NOT EXISTS idx_todos_project_status ON todos(project_id, status, due_date ASC);")
}

function ensureColumn(
  db: DatabaseConstructor.Database,
  tableName: "projects" | "todos",
  columnName: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  if (columns.some((column) => column.name === columnName)) return
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`)
}
