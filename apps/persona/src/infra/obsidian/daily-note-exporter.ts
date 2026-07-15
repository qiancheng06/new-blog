import { randomUUID } from "crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "path"

const MANAGED_BLOCK_START = "<!-- PERSONA:DAILY_NOTE -->"
const MANAGED_BLOCK_END = "<!-- /PERSONA:DAILY_NOTE -->"

export interface ObsidianDailyNoteDocument {
  id: string
  date: string
  summary: string
  highlights: string[]
  topicDistribution: Record<string, number>
  sourceEventId: string | null
  updatedAt: string
}

export interface ObsidianDailyNoteExportOptions {
  vaultPath: string
  relativeDirectory: string
}

export interface ObsidianDailyNoteExportResult {
  relativePath: string
  status: "created" | "updated" | "unchanged"
}

export class ObsidianArchiveUnavailableError extends Error {}

export class ObsidianArchiveConflictError extends Error {}

export function exportDailyNoteToObsidian(
  note: ObsidianDailyNoteDocument,
  options: ObsidianDailyNoteExportOptions,
): ObsidianDailyNoteExportResult {
  const vaultRoot = resolveVaultRoot(options.vaultPath)
  const outputDirectory = resolveOutputDirectory(vaultRoot, options.relativeDirectory)
  const targetPath = join(outputDirectory, dailyNoteFileName(note.date))
  const relativePath = relative(vaultRoot, targetPath).split(sep).join("/")
  const block = renderDailyNoteManagedBlock(note)
  const existing = readExistingFile(targetPath)
  const nextContent = existing === null
    ? renderNewDailyNoteFile(note, block)
    : replaceManagedBlock(existing, block)

  if (existing === nextContent) {
    return { relativePath, status: "unchanged" }
  }

  writeAtomically(targetPath, nextContent)
  return {
    relativePath,
    status: existing === null ? "created" : "updated",
  }
}

export function renderDailyNoteManagedBlock(note: ObsidianDailyNoteDocument, eol = "\n"): string {
  const summary = sanitizeManagedText(note.summary).trim() || "No summary recorded."
  const highlights = note.highlights.length > 0
    ? note.highlights.map((item) => `- ${sanitizeListText(item)}`)
    : ["- None recorded."]
  const topics = Object.entries(note.topicDistribution)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `- ${sanitizeListText(name)}: ${count}`)

  return [
    MANAGED_BLOCK_START,
    "## Summary",
    "",
    summary,
    "",
    "## Highlights",
    "",
    ...highlights,
    "",
    "## Topics",
    "",
    ...(topics.length > 0 ? topics : ["- None recorded."]),
    "",
    `Updated: ${sanitizeListText(note.updatedAt)}`,
    `Source Event: ${sanitizeListText(note.sourceEventId ?? "none")}`,
    MANAGED_BLOCK_END,
  ].join(eol)
}

function resolveVaultRoot(value: string): string {
  const configured = value.trim()
  if (!configured) throw new ObsidianArchiveUnavailableError("Obsidian vault is not configured")

  try {
    const root = realpathSync(configured)
    if (!lstatSync(root).isDirectory()) {
      throw new ObsidianArchiveUnavailableError("Obsidian vault is not a directory")
    }
    const projectRoot = realpathSync(process.cwd())
    if (isWithin(projectRoot, root)) {
      throw new ObsidianArchiveUnavailableError("Obsidian vault must be outside the repository")
    }
    return root
  } catch (err) {
    if (err instanceof ObsidianArchiveUnavailableError) throw err
    throw new ObsidianArchiveUnavailableError("Obsidian vault is unavailable")
  }
}

function resolveOutputDirectory(vaultRoot: string, value: string): string {
  const segments = parseRelativeDirectory(value)
  try {
    let current = vaultRoot
    for (const segment of segments) {
      const next = join(current, segment)
      if (!existsSync(next)) mkdirSync(next)
      const canonicalNext = realpathSync(next)
      if (!lstatSync(canonicalNext).isDirectory() || !isWithin(vaultRoot, canonicalNext)) {
        throw new ObsidianArchiveUnavailableError("Daily Note directory escapes the Obsidian vault")
      }
      current = canonicalNext
    }
    return current
  } catch (err) {
    if (err instanceof ObsidianArchiveUnavailableError) throw err
    throw new ObsidianArchiveUnavailableError("Daily Note directory is unavailable")
  }
}

function parseRelativeDirectory(value: string): string[] {
  const configured = value.trim()
  if (!configured || isAbsolute(configured) || /^[A-Za-z]:[\\/]/.test(configured)) {
    throw new ObsidianArchiveUnavailableError("Daily Note directory must be relative")
  }
  const segments = configured.split(/[\\/]+/)
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ObsidianArchiveUnavailableError("Daily Note directory contains an unsafe segment")
  }
  return segments
}

function readExistingFile(targetPath: string): string | null {
  if (!existsSync(targetPath)) return null

  try {
    const stat = lstatSync(targetPath)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ObsidianArchiveConflictError("Daily Note target is not a regular file")
    }
    return readFileSync(targetPath, "utf-8")
  } catch (err) {
    if (err instanceof ObsidianArchiveConflictError) throw err
    throw new ObsidianArchiveUnavailableError("Daily Note target cannot be read")
  }
}

function renderNewDailyNoteFile(note: ObsidianDailyNoteDocument, block: string): string {
  return [
    "---",
    "type: persona-daily-note",
    `date: ${note.date}`,
    `persona_note_id: ${note.id}`,
    "---",
    "",
    `# Daily Note ${note.date}`,
    "",
    block,
    "",
  ].join("\n")
}

function replaceManagedBlock(existing: string, block: string): string {
  const starts = findOccurrences(existing, MANAGED_BLOCK_START)
  const ends = findOccurrences(existing, MANAGED_BLOCK_END)
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new ObsidianArchiveConflictError("Daily Note file has no unique Persona managed block")
  }

  const eol = existing.includes("\r\n") ? "\r\n" : "\n"
  const normalizedBlock = block.replace(/\n/g, eol)
  const end = ends[0] + MANAGED_BLOCK_END.length
  return `${existing.slice(0, starts[0])}${normalizedBlock}${existing.slice(end)}`
}

function writeAtomically(targetPath: string, content: string): void {
  const temporaryPath = join(
    dirname(targetPath),
    `.${noteFileName(targetPath)}.${randomUUID()}.tmp`,
  )

  try {
    writeFileSync(temporaryPath, content, { encoding: "utf-8", flag: "wx" })
    renameSync(temporaryPath, targetPath)
  } catch {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw new ObsidianArchiveUnavailableError("Daily Note archive write failed")
  }
}

function dailyNoteFileName(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ObsidianArchiveUnavailableError("Daily Note date is invalid")
  }
  return `${date}.md`
}

function noteFileName(targetPath: string): string {
  return targetPath.slice(Math.max(targetPath.lastIndexOf("/"), targetPath.lastIndexOf("\\")) + 1)
}

function sanitizeManagedText(value: string): string {
  return value
    .replaceAll(MANAGED_BLOCK_START, "PERSONA DAILY NOTE")
    .replaceAll(MANAGED_BLOCK_END, "/PERSONA DAILY NOTE")
    .replace(/\0/g, "")
}

function sanitizeListText(value: string): string {
  return sanitizeManagedText(value).replace(/\s+/g, " ").trim()
}

function findOccurrences(value: string, token: string): number[] {
  const indexes: number[] = []
  let cursor = 0
  while (cursor < value.length) {
    const index = value.indexOf(token, cursor)
    if (index < 0) break
    indexes.push(index)
    cursor = index + token.length
  }
  return indexes
}

function isWithin(parent: string, target: string): boolean {
  const pathFromParent = relative(parent, target)
  return pathFromParent === "" || (
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  )
}
