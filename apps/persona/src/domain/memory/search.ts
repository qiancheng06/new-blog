import { query } from "../../infra/db/pool.js"

export type MemorySearchEntityType = "profile" | "topic" | "timeline" | "daily_note"

export interface MemorySearchResult {
  entityType: MemorySearchEntityType
  entityId: string
  title: string
  text: string
  sourceEventId: string | null
  date: string | null
}

export interface MemorySearchOptions {
  limit?: number
}

interface MemorySearchRow {
  entity_type: MemorySearchEntityType
  entity_id: string
  title: string
  body: string
  source_event_id: string | null
  memory_date: string | null
}

const MAX_QUERY_LENGTH = 500
const MAX_RESULT_TEXT_LENGTH = 2_000

export function searchMemory(searchText: string, options: MemorySearchOptions = {}): MemorySearchResult[] {
  const normalized = normalizeSearchText(searchText)
  if (!normalized) return []
  const limit = normalizeLimit(options.limit ?? 10)
  const rows = new Map<string, MemorySearchRow>()
  const expression = buildFtsExpression(normalized)

  if (expression) appendUnique(rows, searchFts(expression, normalized, limit * 2))
  if (rows.size < limit) appendUnique(rows, searchExact(normalized, limit))

  return [...rows.values()].slice(0, limit).map(toSearchResult)
}

export function normalizeMemorySearchQuery(searchText: string): string {
  return normalizeSearchText(searchText)
}

function searchExact(searchText: string, limit: number): MemorySearchRow[] {
  return query<MemorySearchRow>(
    `SELECT entity_type, entity_id, title, body, source_event_id, memory_date
     FROM memory_search
     WHERE state = 'active'
       AND (instr(lower(title), lower(?)) > 0 OR instr(lower(body), lower(?)) > 0)
     ORDER BY
       CASE WHEN instr(lower(title), lower(?)) > 0 THEN 0 ELSE 1 END,
       memory_date DESC, rowid DESC
     LIMIT ?`,
    [searchText, searchText, searchText, limit],
  )
}

function searchFts(expression: string, searchText: string, limit: number): MemorySearchRow[] {
  return query<MemorySearchRow>(
    `SELECT entity_type, entity_id, title, body, source_event_id, memory_date
     FROM memory_search
     WHERE memory_search MATCH ? AND state = 'active'
     ORDER BY
       CASE
         WHEN instr(lower(title), lower(?)) > 0 THEN 0
         WHEN instr(lower(body), lower(?)) > 0 THEN 1
         ELSE 2
       END,
       bm25(memory_search, 0.0, 0.0, 4.0, 1.0, 0.0, 0.0, 0.0),
       memory_date DESC
     LIMIT ?`,
    [expression, searchText, searchText, limit],
  )
}

function buildFtsExpression(searchText: string): string {
  const terms = new Set<string>()
  const hanRuns = searchText.match(/\p{Script=Han}+/gu) ?? []
  for (const run of hanRuns) {
    const characters = [...run]
    if (characters.length < 3) continue
    for (let index = 0; index <= characters.length - 3 && terms.size < 12; index += 1) {
      terms.add(characters.slice(index, index + 3).join(""))
    }
  }

  const withoutHan = searchText.replace(/\p{Script=Han}+/gu, " ")
  for (const match of withoutHan.matchAll(/[\p{L}\p{N}]+/gu)) {
    if ([...match[0]].length >= 3) terms.add(match[0])
    if (terms.size >= 12) break
  }

  return [...terms].map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ")
}

function appendUnique(target: Map<string, MemorySearchRow>, rows: MemorySearchRow[]): void {
  for (const row of rows) {
    const key = `${row.entity_type}:${row.entity_id}`
    if (!target.has(key)) target.set(key, row)
  }
}

function toSearchResult(row: MemorySearchRow): MemorySearchResult {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    text: row.body.slice(0, MAX_RESULT_TEXT_LENGTH),
    sourceEventId: row.source_event_id,
    date: row.memory_date,
  }
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH)
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 10
  return Math.min(50, Math.max(1, Math.floor(value)))
}
