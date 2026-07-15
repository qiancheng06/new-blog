import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { randomUUID } from "crypto"
import { basename, join, resolve, sep } from "path"
import { tmpdir } from "os"

const contractTag = `codex-obsidian-archive-${Date.now()}`
const contractDate = createContractDate(Date.now())
const conflictDate = addOneDay(contractDate)
const port = Number(process.env.API_PORT) || 3113
const vaultPath = mkdtempSync(join(tmpdir(), "persona-vault-contract-"))
const externalPath = mkdtempSync(join(tmpdir(), "persona-vault-external-"))

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""
process.env.OBSIDIAN_VAULT_PATH = vaultPath
process.env.PERSONA_DAILY_NOTE_DIR = "persona/daily-notes"

const { initializeDb, query, queryOne, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { getDailyNoteByDate, upsertDailyNote } = await import("../domain/daily-note/store.js")
const {
  exportDailyNoteToObsidian,
  ObsidianArchiveUnavailableError,
} = await import("../infra/obsidian/daily-note-exporter.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
seedDailyNote(contractDate, `${contractTag} initial summary <!-- /PERSONA:DAILY_NOTE -->`)
seedDailyNote(conflictDate, `${contractTag} conflict summary`)
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  const targetPath = join(vaultPath, "persona", "daily-notes", `${contractDate}.md`)

  const created = await archive(port, contractDate)
  assert(created.status === "created", "first Daily Note archive must create the file")
  assert(created.relativePath === `persona/daily-notes/${contractDate}.md`, "archive relative path mismatch")
  assert(created.note.archivePath === created.relativePath, "Daily Note archive_path mismatch")
  assert(created.note.archiveEventId === created.archiveEventId, "Daily Note archive_event_id mismatch")
  assert(typeof created.note.archivedAt === "string" && created.note.archivedAt.length > 0, "Daily Note archived_at missing")

  const initialContent = readFileSync(targetPath, "utf-8")
  assert(initialContent.includes(`date: ${contractDate}`), "Daily Note frontmatter date missing")
  assert(initialContent.includes(contractTag), "Daily Note summary content missing")
  assert(!initialContent.includes("<!-- /PERSONA:DAILY_NOTE -->\n<!-- /PERSONA:DAILY_NOTE -->"), "managed marker injection was not sanitized")
  assert(countOccurrences(initialContent, "<!-- PERSONA:DAILY_NOTE -->") === 1, "Daily Note must contain one managed block start")
  assert(countOccurrences(initialContent, "<!-- /PERSONA:DAILY_NOTE -->") === 1, "Daily Note must contain one managed block end")
  verifyArchiveEvent(created.archiveEventId, "created", contractDate)

  const userSection = "## User Notes\n\nKeep this sentence outside the managed block.\n"
  writeFileSync(targetPath, `${initialContent}\n${userSection}`, "utf-8")
  seedDailyNote(contractDate, `${contractTag} refreshed summary`)
  const staleProjection = getDailyNoteByDate(contractDate)
  assert(staleProjection?.archive_path === null, "regenerating a Daily Note must clear archive_path")
  assert(staleProjection.archive_event_id === null, "regenerating a Daily Note must clear archive_event_id")

  const updated = await archive(port, contractDate)
  assert(updated.status === "updated", "second Daily Note archive must update the managed block")
  const updatedContent = readFileSync(targetPath, "utf-8")
  assert(updatedContent.includes(`${contractTag} refreshed summary`), "updated summary missing from archive")
  assert(updatedContent.includes(userSection.trim()), "user-authored content outside managed block must survive")
  assert(countOccurrences(updatedContent, "<!-- PERSONA:DAILY_NOTE -->") === 1, "updated file must keep one managed block")

  const unchanged = await archive(port, contractDate)
  assert(unchanged.status === "unchanged", "third Daily Note archive must be idempotent")
  assert(readFileSync(targetPath, "utf-8") === updatedContent, "unchanged archive must not rewrite file content")

  const archiveEvents = query<{ id: string }>(
    "SELECT id FROM events WHERE type = 'daily_note_exported' AND payload LIKE ?",
    [`%${contractDate}%`],
  )
  assert(archiveEvents.length === 3, "each successful archive request must append an audit Event")

  const conflictPath = join(vaultPath, "persona", "daily-notes", `${conflictDate}.md`)
  const userOwnedContent = "# User-owned Daily Note\n\nDo not overwrite.\n"
  writeFileSync(conflictPath, userOwnedContent, "utf-8")
  const conflict = await fetch(`http://127.0.0.1:${port}/api/daily-summaries/${conflictDate}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  assert(conflict.status === 409, `user-owned Daily Note expected 409, got ${conflict.status}`)
  assert(readFileSync(conflictPath, "utf-8") === userOwnedContent, "conflicting user file must remain unchanged")

  const temporaryFiles = readdirSync(join(vaultPath, "persona", "daily-notes"))
    .filter((name) => name.endsWith(".tmp"))
  assert(temporaryFiles.length === 0, "archive must not leave temporary files")
  verifyLinkedDirectoryEscapeIsRejected(vaultPath, externalPath)
  console.log("obsidian archive contract ok")
} finally {
  cleanupContractRows()
  await stopApiServer(server)
  removeContractDirectory(vaultPath, "persona-vault-contract-")
  removeContractDirectory(externalPath, "persona-vault-external-")
}

interface ArchiveResponse {
  note: {
    archivePath: string | null
    archiveEventId: string | null
    archivedAt: string | null
  }
  archiveEventId: string
  relativePath: string
  status: "created" | "updated" | "unchanged"
}

async function archive(portNumber: number, date: string): Promise<ArchiveResponse> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/daily-summaries/${date}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  if (!response.ok) throw new Error(`archive failed: ${response.status} ${await response.text()}`)
  return await response.json() as ArchiveResponse
}

function seedDailyNote(date: string, summary: string): void {
  const sourceEvent = insertEvent({
    source: "system",
    type: "summary_ready",
    payload: { text: contractTag, date },
    timestamp: new Date().toISOString(),
    metadata: { purpose: "daily_summary" },
  })
  upsertDailyNote({
    id: getDailyNoteByDate(date)?.id ?? randomUUID(),
    date,
    summary,
    highlights: [`${contractTag} highlight`],
    topicDistribution: { architecture: 2, memory: 1 },
    sourceEventId: sourceEvent.id,
  })
}

function verifyArchiveEvent(eventId: string, status: string, date: string): void {
  const event = queryOne<{ source: string; type: string; payload: string; metadata: string }>(
    "SELECT source, type, payload, metadata FROM events WHERE id = ?",
    [eventId],
  )
  assert(event?.source === "system", "archive Event source mismatch")
  assert(event.type === "daily_note_exported", "archive Event type mismatch")
  const payload = JSON.parse(event.payload) as { date?: string; status?: string; relative_path?: string }
  assert(payload.date === date, "archive Event date mismatch")
  assert(payload.status === status, "archive Event status mismatch")
  assert(payload.relative_path === `persona/daily-notes/${date}.md`, "archive Event relative path mismatch")
  const metadata = JSON.parse(event.metadata) as { purpose?: string; visibility?: string }
  assert(metadata.purpose === "long_term_archive", "archive Event purpose mismatch")
  assert(metadata.visibility === "user", "archive Event visibility mismatch")
}

function verifyLinkedDirectoryEscapeIsRejected(vault: string, external: string): void {
  const linkPath = join(vault, "linked")
  symlinkSync(external, linkPath, process.platform === "win32" ? "junction" : "dir")
  let rejected = false
  try {
    exportDailyNoteToObsidian({
      id: randomUUID(),
      date: addOneDay(conflictDate),
      summary: contractTag,
      highlights: [],
      topicDistribution: {},
      sourceEventId: null,
      updatedAt: new Date().toISOString(),
    }, {
      vaultPath: vault,
      relativeDirectory: "linked/daily-notes",
    })
  } catch (err) {
    rejected = err instanceof ObsidianArchiveUnavailableError
  }
  assert(rejected, "linked directory escape must be rejected")
  assert(!existsSync(join(external, "daily-notes")), "linked directory escape must not create outside the vault")
}

function cleanupContractRows(): void {
  run("DELETE FROM daily_notes WHERE date IN (?, ?)", [contractDate, conflictDate])
  run("DELETE FROM events WHERE payload LIKE ? OR payload LIKE ?", [`%${contractDate}%`, `%${conflictDate}%`])
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  throw new Error("Obsidian archive contract server did not become healthy")
}

function removeContractDirectory(path: string, expectedPrefix: string): void {
  const tempRoot = `${resolve(tmpdir())}${sep}`
  const resolvedPath = resolve(path)
  if (!resolvedPath.startsWith(tempRoot) || !basename(resolvedPath).startsWith(expectedPrefix)) {
    throw new Error("refusing to remove unexpected archive contract path")
  }
  rmSync(resolvedPath, { recursive: true, force: true })
}

function createContractDate(seed: number): string {
  const year = 2070 + seed % 10
  const month = 1 + Math.floor(seed / 10) % 12
  const day = 1 + Math.floor(seed / 120) % 27
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function addOneDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

function countOccurrences(value: string, token: string): number {
  return value.split(token).length - 1
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
