import {
  exportManagedMarkdownDocument,
  ObsidianArchiveUnavailableError,
  type ManagedMarkdownExportResult,
} from "./managed-markdown-exporter.js"
export {
  ObsidianArchiveConflictError,
  ObsidianArchiveUnavailableError,
} from "./managed-markdown-exporter.js"

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

export type ObsidianDailyNoteExportResult = ManagedMarkdownExportResult

export function exportDailyNoteToObsidian(
  note: ObsidianDailyNoteDocument,
  options: ObsidianDailyNoteExportOptions,
): ObsidianDailyNoteExportResult {
  const block = renderDailyNoteManagedBlock(note)
  return exportManagedMarkdownDocument({
    vaultPath: options.vaultPath,
    relativeDirectory: options.relativeDirectory,
    fileName: dailyNoteFileName(note.date),
    managedBlockStart: MANAGED_BLOCK_START,
    managedBlockEnd: MANAGED_BLOCK_END,
    managedBlock: block,
    newFileContent: renderNewDailyNoteFile(note, block),
  })
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

function dailyNoteFileName(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ObsidianArchiveUnavailableError("Daily Note date is invalid")
  }
  return `${date}.md`
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
