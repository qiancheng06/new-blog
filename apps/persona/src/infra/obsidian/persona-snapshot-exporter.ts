import {
  exportManagedMarkdownDocument,
  type ManagedMarkdownExportResult,
} from "./managed-markdown-exporter.js"

const MANAGED_BLOCK_START = "<!-- PERSONA:SNAPSHOT -->"
const MANAGED_BLOCK_END = "<!-- /PERSONA:SNAPSHOT -->"
const SNAPSHOT_FILE_NAME = "Persona OS.md"

export interface PersonaSnapshotDocument {
  profile: Array<{ key: string; value: string; updatedAt: string }>
  topics: Array<{
    name: string
    summary: string
    messageCount: number
    lastActiveAt: string
  }>
  timeline: Array<{ date: string; type: string; summary: string }>
  projects: Array<{
    name: string
    status: string
    summary: string
    topics: string[]
    updatedAt: string
  }>
  dataUpdatedThrough: string | null
  truncated: {
    profile: boolean
    topics: boolean
    timeline: boolean
    projects: boolean
  }
}

export interface PersonaSnapshotExportOptions {
  vaultPath: string
  relativeDirectory: string
}

export type PersonaSnapshotExportResult = ManagedMarkdownExportResult

export function exportPersonaSnapshotToObsidian(
  snapshot: PersonaSnapshotDocument,
  options: PersonaSnapshotExportOptions,
): PersonaSnapshotExportResult {
  const block = renderPersonaSnapshotManagedBlock(snapshot)
  return exportManagedMarkdownDocument({
    vaultPath: options.vaultPath,
    relativeDirectory: options.relativeDirectory,
    fileName: SNAPSHOT_FILE_NAME,
    managedBlockStart: MANAGED_BLOCK_START,
    managedBlockEnd: MANAGED_BLOCK_END,
    managedBlock: block,
    newFileContent: renderNewSnapshotFile(block),
  })
}

export function renderPersonaSnapshotManagedBlock(snapshot: PersonaSnapshotDocument, eol = "\n"): string {
  return [
    MANAGED_BLOCK_START,
    "## Profile",
    "",
    ...renderProfile(snapshot),
    "",
    "## Topics",
    "",
    ...renderTopics(snapshot),
    "",
    "## Timeline",
    "",
    ...renderTimeline(snapshot),
    "",
    "## Projects",
    "",
    ...renderProjects(snapshot),
    "",
    `Data updated through: ${sanitizeInline(snapshot.dataUpdatedThrough ?? "none", 128)}`,
    MANAGED_BLOCK_END,
  ].join(eol)
}

function renderNewSnapshotFile(block: string): string {
  return [
    "---",
    "type: persona-os-snapshot",
    "persona_snapshot_version: 1",
    "---",
    "",
    "# Persona OS",
    "",
    block,
    "",
  ].join("\n")
}

function renderProfile(snapshot: PersonaSnapshotDocument): string[] {
  const lines = snapshot.profile
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item) => (
      `- **${escapeMarkdown(item.key, 256)}**: ${escapeMarkdown(item.value, 4_000)}; ` +
      `updated: ${escapeMarkdown(item.updatedAt, 128)}`
    ))
  return appendTruncationNotice(lines, snapshot.truncated.profile)
}

function renderTopics(snapshot: PersonaSnapshotDocument): string[] {
  const lines = snapshot.topics.map((topic) => {
    const details = [
      topic.summary ? escapeMarkdown(topic.summary, 4_000) : "No summary recorded.",
      `messages: ${Math.max(0, Math.floor(topic.messageCount))}`,
      `last active: ${escapeMarkdown(topic.lastActiveAt, 128)}`,
    ].join("; ")
    return `- **${escapeMarkdown(topic.name, 256)}**: ${details}`
  })
  return appendTruncationNotice(lines, snapshot.truncated.topics)
}

function renderTimeline(snapshot: PersonaSnapshotDocument): string[] {
  const lines = snapshot.timeline.map((item) => (
    `- ${escapeMarkdown(item.date, 64)} [${escapeMarkdown(item.type, 64)}] ${escapeMarkdown(item.summary, 4_000)}`
  ))
  return appendTruncationNotice(lines, snapshot.truncated.timeline)
}

function renderProjects(snapshot: PersonaSnapshotDocument): string[] {
  const lines = snapshot.projects.map((project) => {
    const details = [
      project.summary ? escapeMarkdown(project.summary, 4_000) : "No summary recorded.",
      project.topics.length > 0 ? `topics: ${project.topics.map((topic) => escapeMarkdown(topic, 256)).join(", ")}` : "",
      `updated: ${escapeMarkdown(project.updatedAt, 128)}`,
    ].filter(Boolean).join("; ")
    return `- **${escapeMarkdown(project.name, 256)}** [${escapeMarkdown(project.status, 64)}]: ${details}`
  })
  return appendTruncationNotice(lines, snapshot.truncated.projects)
}

function appendTruncationNotice(lines: string[], truncated: boolean): string[] {
  const output = lines.length > 0 ? lines : ["- None recorded."]
  return truncated ? [...output, "- Additional records omitted by the bounded snapshot."] : output
}

function escapeMarkdown(value: string, maxLength: number): string {
  return sanitizeInline(value, maxLength).replace(/([\\`*_{}\[\]<>])/g, "\\$1")
}

function sanitizeInline(value: string, maxLength: number): string {
  return value
    .replaceAll(MANAGED_BLOCK_START, "PERSONA SNAPSHOT")
    .replaceAll(MANAGED_BLOCK_END, "/PERSONA SNAPSHOT")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}
