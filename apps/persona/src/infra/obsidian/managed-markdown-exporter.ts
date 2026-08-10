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

export interface ManagedMarkdownExportOptions {
  vaultPath: string
  relativeDirectory: string
  fileName: string
  managedBlockStart: string
  managedBlockEnd: string
  managedBlock: string
  newFileContent: string
}

export interface ManagedMarkdownExportResult {
  relativePath: string
  status: "created" | "updated" | "unchanged"
}

export class ObsidianArchiveUnavailableError extends Error {}

export class ObsidianArchiveConflictError extends Error {}

export function exportManagedMarkdownDocument(
  options: ManagedMarkdownExportOptions,
): ManagedMarkdownExportResult {
  validateManagedDocumentOptions(options)
  const vaultRoot = resolveVaultRoot(options.vaultPath)
  const outputDirectory = resolveOutputDirectory(vaultRoot, options.relativeDirectory)
  const targetPath = join(outputDirectory, options.fileName)
  const relativePath = relative(vaultRoot, targetPath).split(sep).join("/")
  const existing = readExistingFile(targetPath)
  const nextContent = existing === null
    ? options.newFileContent
    : replaceManagedBlock(
      existing,
      options.managedBlock,
      options.managedBlockStart,
      options.managedBlockEnd,
    )

  if (existing === nextContent) return { relativePath, status: "unchanged" }

  writeAtomically(targetPath, nextContent)
  return {
    relativePath,
    status: existing === null ? "created" : "updated",
  }
}

function validateManagedDocumentOptions(options: ManagedMarkdownExportOptions): void {
  if (
    !options.fileName ||
    options.fileName === "." ||
    options.fileName === ".." ||
    options.fileName.trim() !== options.fileName ||
    options.fileName.endsWith(".") ||
    !options.fileName.toLowerCase().endsWith(".md") ||
    /[<>:"/\\|?*\0]/.test(options.fileName)
  ) {
    throw new ObsidianArchiveUnavailableError("Obsidian target filename is invalid")
  }
  if (
    !options.managedBlockStart ||
    !options.managedBlockEnd ||
    countOccurrences(options.managedBlock, options.managedBlockStart) !== 1 ||
    countOccurrences(options.managedBlock, options.managedBlockEnd) !== 1 ||
    options.managedBlock.indexOf(options.managedBlockStart) >= options.managedBlock.indexOf(options.managedBlockEnd)
  ) {
    throw new ObsidianArchiveUnavailableError("Obsidian managed block is invalid")
  }
  if (
    !options.newFileContent.includes(options.managedBlock) ||
    countOccurrences(options.newFileContent, options.managedBlockStart) !== 1 ||
    countOccurrences(options.newFileContent, options.managedBlockEnd) !== 1
  ) {
    throw new ObsidianArchiveUnavailableError("Obsidian initial document is invalid")
  }
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
        throw new ObsidianArchiveUnavailableError("Obsidian output directory escapes the vault")
      }
      current = canonicalNext
    }
    return current
  } catch (err) {
    if (err instanceof ObsidianArchiveUnavailableError) throw err
    throw new ObsidianArchiveUnavailableError("Obsidian output directory is unavailable")
  }
}

function parseRelativeDirectory(value: string): string[] {
  const configured = value.trim()
  if (!configured || isAbsolute(configured) || /^[A-Za-z]:[\\/]/.test(configured)) {
    throw new ObsidianArchiveUnavailableError("Obsidian output directory must be relative")
  }
  const segments = configured.split(/[\\/]+/)
  if (segments.some((segment) => (
    !segment || segment === "." || segment === ".." || /[<>:"|?*\0]/.test(segment)
  ))) {
    throw new ObsidianArchiveUnavailableError("Obsidian output directory contains an unsafe segment")
  }
  return segments
}

function readExistingFile(targetPath: string): string | null {
  if (!existsSync(targetPath)) return null

  try {
    const stat = lstatSync(targetPath)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ObsidianArchiveConflictError("Obsidian target is not a regular file")
    }
    return readFileSync(targetPath, "utf-8")
  } catch (err) {
    if (err instanceof ObsidianArchiveConflictError) throw err
    throw new ObsidianArchiveUnavailableError("Obsidian target cannot be read")
  }
}

function replaceManagedBlock(existing: string, block: string, startToken: string, endToken: string): string {
  const starts = findOccurrences(existing, startToken)
  const ends = findOccurrences(existing, endToken)
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new ObsidianArchiveConflictError("Obsidian file has no unique Persona managed block")
  }

  const eol = existing.includes("\r\n") ? "\r\n" : "\n"
  const normalizedBlock = block.replace(/\r?\n/g, eol)
  const end = ends[0] + endToken.length
  return `${existing.slice(0, starts[0])}${normalizedBlock}${existing.slice(end)}`
}

function writeAtomically(targetPath: string, content: string): void {
  const temporaryPath = join(dirname(targetPath), `.${noteFileName(targetPath)}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporaryPath, content, { encoding: "utf-8", flag: "wx" })
    renameSync(temporaryPath, targetPath)
  } catch {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw new ObsidianArchiveUnavailableError("Obsidian archive write failed")
  }
}

function noteFileName(targetPath: string): string {
  return targetPath.slice(Math.max(targetPath.lastIndexOf("/"), targetPath.lastIndexOf("\\")) + 1)
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

function countOccurrences(value: string, token: string): number {
  return findOccurrences(value, token).length
}

function isWithin(parent: string, target: string): boolean {
  const pathFromParent = relative(parent, target)
  return pathFromParent === "" || (
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  )
}
