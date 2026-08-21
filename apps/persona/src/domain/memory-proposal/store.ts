import { randomUUID } from "crypto"
import { query, queryOne, run } from "../../infra/db/pool.js"
import type { ProfileUpdate } from "../memory/types.js"

export type MemoryProposalStatus = "pending" | "accepted" | "rejected"
export type MemoryProposalDecision = "accept" | "reject"

export interface MemoryProposalRow {
  id: string
  source_event_id: string
  proposal_type: "profile"
  proposal_key: string
  proposed_value: string
  confidence: number
  status: MemoryProposalStatus
  review_event_id: string | null
  review_reason: string
  created_at: string
  reviewed_at: string | null
  updated_at: string
}

export interface MemoryProposalListOptions {
  status?: MemoryProposalStatus
  sourceEventId?: string
  limit?: number
  offset?: number
}

export interface MemoryProposalStats {
  pending: number
  accepted: number
  rejected: number
}

export function createCoolingProfileProposals(
  updates: ProfileUpdate[],
  sourceEventId: string | undefined,
): MemoryProposalRow[] {
  const candidates = updates
    .filter((update) => update.cooling_required === true)
    .map(normalizeCandidate)
    .filter((candidate): candidate is NormalizedCandidate => candidate !== null)

  if (candidates.length === 0) return []
  if (!sourceEventId) throw new Error("cooling memory proposals require a source Event")

  const rows: MemoryProposalRow[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const identity = `${candidate.key}\u0000${candidate.value}`
    if (seen.has(identity)) continue
    seen.add(identity)

    run(
      `INSERT INTO memory_proposals (
         id, source_event_id, proposal_type, proposal_key, proposed_value, confidence
       ) VALUES (?, ?, 'profile', ?, ?, ?)
       ON CONFLICT (source_event_id, proposal_type, proposal_key, proposed_value) DO NOTHING`,
      [randomUUID(), sourceEventId, candidate.key, candidate.value, candidate.confidence],
    )
    const row = queryOne<MemoryProposalRow>(
      `SELECT * FROM memory_proposals
       WHERE source_event_id = ? AND proposal_type = 'profile'
         AND proposal_key = ? AND proposed_value = ?`,
      [sourceEventId, candidate.key, candidate.value],
    )
    if (!row) throw new Error("memory proposal was not persisted")
    rows.push(row)
  }
  return rows
}

export function getMemoryProposalById(id: string): MemoryProposalRow | null {
  return queryOne<MemoryProposalRow>("SELECT * FROM memory_proposals WHERE id = ?", [id])
}

export function listMemoryProposals(options: MemoryProposalListOptions = {}): MemoryProposalRow[] {
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    where.push("status = ?")
    params.push(options.status)
  }
  if (options.sourceEventId?.trim()) {
    where.push("source_event_id = ?")
    params.push(options.sourceEventId.trim())
  }
  params.push(normalizeLimit(options.limit ?? 20), normalizeOffset(options.offset ?? 0))

  return query<MemoryProposalRow>(
    `SELECT * FROM memory_proposals
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, rowid DESC
     LIMIT ? OFFSET ?`,
    params,
  )
}

export function getMemoryProposalStats(): MemoryProposalStats {
  const stats: MemoryProposalStats = { pending: 0, accepted: 0, rejected: 0 }
  for (const row of query<{ status: MemoryProposalStatus; count: number }>(
    "SELECT status, COUNT(*) AS count FROM memory_proposals GROUP BY status",
  )) {
    stats[row.status] = Number(row.count)
  }
  return stats
}

export function markMemoryProposalReviewed(options: {
  id: string
  status: Exclude<MemoryProposalStatus, "pending">
  reviewEventId: string
  reason: string
}): MemoryProposalRow | null {
  const result = run(
    `UPDATE memory_proposals
     SET status = ?, review_event_id = ?, review_reason = ?,
         reviewed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    [options.status, options.reviewEventId, options.reason, options.id],
  )
  return result.changes === 1 ? getMemoryProposalById(options.id) : null
}

interface NormalizedCandidate {
  key: string
  value: string
  confidence: number
}

function normalizeCandidate(update: ProfileUpdate): NormalizedCandidate | null {
  const key = update.key.trim()
  if (!key) return null
  const value = JSON.stringify(update.value)
  if (value === undefined) throw new Error("memory proposal value must be JSON serializable")
  if (!Number.isFinite(update.confidence) || update.confidence < 0 || update.confidence > 1) {
    throw new Error("memory proposal confidence must be between 0 and 1")
  }
  return { key, value, confidence: update.confidence }
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 20
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
