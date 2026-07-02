import DatabaseConstructor from "better-sqlite3"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { readFileSync, existsSync, mkdirSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))

const rootDir = resolveProjectRoot(__dirname)
const schemaPath = resolveSchemaPath()
const dbDir = join(rootDir, "data")

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

export function run(sql: string, params?: unknown[]): void {
  const stmt = _db.prepare(sql)
  if (params) stmt.run(...params)
  else stmt.run()
}

export function initializeDb(): void {
  const sql = readFileSync(schemaPath, "utf-8")

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"))

  for (const stmt of statements) {
    _db.exec(stmt + ";")
  }

  console.log("database initialized")
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
