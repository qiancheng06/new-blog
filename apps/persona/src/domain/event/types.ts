import { createHash } from "crypto"
import { z } from "zod"

const TELEGRAM_EVENT_NAMESPACE = Buffer.from("a82228d5fc664f4983ef70fbc9006e10", "hex")
const WORKSPACE_EVENT_NAMESPACE = Buffer.from("1aa87ef80f9d4d778c807f5479026caf", "hex")

export const EventSource = z.enum(["telegram", "system", "web"])
export type EventSource = z.infer<typeof EventSource>

export const EventSchema = z.object({
  id: z.string().uuid().optional(),
  source: EventSource,
  type: z.string(),
  payload: z.record(z.unknown()),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).default({}),
})
export type Event = z.infer<typeof EventSchema>

export const TelegramPayload = z.object({
  chat_id: z.number(),
  user_id: z.number(),
  text: z.string(),
  message_id: z.number(),
  reply_to: z.number().optional(),
  due_date: z.string().optional(),
})
export type TelegramPayload = z.infer<typeof TelegramPayload>

export type TelegramEventType = "message" | "note" | "todo" | "idea" | "journal"

export function createTelegramEvent(payload: TelegramPayload, type: TelegramEventType = "message"): Event {
  return {
    id: createTelegramEventId(payload.chat_id, payload.message_id),
    source: "telegram",
    type,
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {},
  }
}

export const SystemEventType = z.enum(["tick", "alert", "summary_ready"])
export type SystemEventType = z.infer<typeof SystemEventType>

export function createSystemEvent(type: SystemEventType, payload: Record<string, unknown> = {}): Event {
  return {
    source: "system",
    type,
    payload,
    timestamp: new Date().toISOString(),
    metadata: {},
  }
}

export interface DailySummaryReadyPayload {
  daily_note_id: string
  date: string
  event_count: number
}

export function createDailySummaryReadyEvent(payload: DailySummaryReadyPayload): Event {
  return {
    source: "system",
    type: "summary_ready",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: "daily_summary",
      visibility: "user",
    },
  }
}

export interface DailyNoteExportedPayload {
  daily_note_id: string
  date: string
  relative_path: string
  status: "created" | "updated" | "unchanged"
}

export function createDailyNoteExportedEvent(payload: DailyNoteExportedPayload): Event {
  return {
    source: "system",
    type: "daily_note_exported",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: "long_term_archive",
      visibility: "user",
    },
  }
}

export interface AnalysisRetryRequestedPayload {
  analysis_job_id: string
  source_event_id: string
}

export function createAnalysisRetryRequestedEvent(payload: AnalysisRetryRequestedPayload): Event {
  return {
    source: "web",
    type: "analysis_retry_requested",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: "analysis_recovery",
      visibility: "user",
    },
  }
}

export interface ConversationRetryRequestedPayload {
  conversation_job_id: string
  source_event_id: string
  reason: "manual" | "idempotent_replay"
}

export function createConversationRetryRequestedEvent(payload: ConversationRetryRequestedPayload): Event {
  return {
    source: "web",
    type: "conversation_retry_requested",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: "conversation_recovery",
      visibility: "user",
    },
  }
}

export function createTelegramEventId(chatId: number, messageId: number): string {
  const hash = createHash("sha1")
    .update(TELEGRAM_EVENT_NAMESPACE)
    .update(`${chatId}:${messageId}`, "utf-8")
    .digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface CompanionReplyPayload {
  text: string
  in_reply_to: string
}

export function createCompanionReplyEvent(
  payload: CompanionReplyPayload,
  sourceMetadata: Record<string, unknown> = {},
): Event {
  const runId = typeof sourceMetadata.run_id === "string" ? sourceMetadata.run_id.trim() : ""
  return {
    source: "system",
    type: "companion_reply",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: "conversation_output",
      visibility: "user",
      in_reply_to: payload.in_reply_to,
      ...(runId ? { run_id: runId } : {}),
    },
  }
}

export interface WorkspacePayload {
  text: string
  page?: string
  evaluationRunId?: string
}

export function createWorkspaceEvent(payload: WorkspacePayload, options: { requestId?: string } = {}): Event {
  const metadata = payload.evaluationRunId?.trim()
    ? { purpose: "real_mode_evaluation", run_id: payload.evaluationRunId.trim() }
    : {}

  return {
    id: options.requestId ? createWorkspaceEventId(options.requestId) : undefined,
    source: "web",
    type: "message",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createWorkspaceEventId(requestId: string): string {
  const hash = createHash("sha1")
    .update(WORKSPACE_EVENT_NAMESPACE)
    .update(requestId, "utf-8")
    .digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface MemoryProfileCorrectionPayload {
  key: string
  value: unknown
  reason?: string
}

export function createMemoryProfileCorrectionEvent(payload: MemoryProfileCorrectionPayload): Event {
  return {
    source: "web",
    type: "memory_profile_correction",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: { purpose: "memory_governance" },
  }
}

export interface WebTodoPayload {
  text: string
  due_date?: string
}

export function createWebTodoEvent(payload: WebTodoPayload): Event {
  return {
    source: "web",
    type: "todo",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: { purpose: "todo_management", visibility: "user" },
  }
}

export interface TodoStateChangePayload {
  todo_id: string
  source_event_id: string
  status: "open" | "done" | "cancelled"
  reason: string
}

export function createTodoStateChangeEvent(payload: TodoStateChangePayload): Event {
  const type = payload.status === "done"
    ? "todo_completed"
    : payload.status === "cancelled"
      ? "todo_cancelled"
      : "todo_reopened"
  return {
    source: "web",
    type,
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: { purpose: "todo_management", visibility: "user" },
  }
}

export interface MemoryProposalReviewPayload {
  proposal_id: string
  source_event_id: string
  proposal_key: string
  decision: "accept" | "reject"
  reason: string
}

export function createMemoryProposalReviewEvent(payload: MemoryProposalReviewPayload): Event {
  return {
    source: "web",
    type: payload.decision === "accept" ? "memory_proposal_accepted" : "memory_proposal_rejected",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: "memory_governance",
      visibility: "user",
    },
  }
}

export type MemoryProjectionState = "active" | "archived" | "suppressed"

export interface MemoryStateChangePayload {
  target_id: string
  target_key?: string
  reason: string
  mode: "archive" | "suppress" | "restore"
}

export function createMemoryProfileStateEvent(payload: MemoryStateChangePayload): Event {
  return {
    source: "web",
    type: payload.mode === "restore" ? "memory_profile_restore" : "memory_profile_suppression",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: { purpose: "memory_governance" },
  }
}

export function createMemoryTopicStateEvent(payload: MemoryStateChangePayload): Event {
  return {
    source: "web",
    type: payload.mode === "restore" ? "memory_topic_restore" : "memory_topic_suppression",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: { purpose: "memory_governance" },
  }
}
