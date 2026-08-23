import Database from "better-sqlite3"
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

const sourcePath = "/app/data/persona-os.db"
const backupDir = "/app/backups"
const retentionDays = readPositiveInteger(process.env.PERSONA_BACKUP_RETENTION_DAYS, 30)
const label = sanitizeLabel(process.env.PERSONA_BACKUP_LABEL || "daily")

if (!existsSync(sourcePath)) {
  throw new Error(`SQLite source does not exist: ${sourcePath}`)
}
mkdirSync(backupDir, { recursive: true })
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
const finalPath = join(backupDir, `persona-${timestamp}-${label}.sqlite`)
const temporaryPath = `${finalPath}.partial`

const db = new Database(sourcePath, { readonly: true, fileMustExist: true })
try {
  await db.backup(temporaryPath)
} finally {
  db.close()
}
renameSync(temporaryPath, finalPath)

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
for (const name of readdirSync(backupDir)) {
  if (!/^persona-.*\.sqlite$/.test(name)) continue
  const path = join(backupDir, name)
  if (statSync(path).mtimeMs < cutoff) rmSync(path)
}

console.log(`SQLite backup created: ${finalPath}`)

function readPositiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function sanitizeLabel(value) {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  return sanitized || "manual"
}
