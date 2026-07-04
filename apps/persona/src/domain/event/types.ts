import { z } from "zod"

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
})
export type TelegramPayload = z.infer<typeof TelegramPayload>

export type TelegramEventType = "message" | "note" | "todo" | "idea" | "journal"

export function createTelegramEvent(payload: TelegramPayload, type: TelegramEventType = "message"): Event {
  return {
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

export interface WorkspacePayload {
  text: string
  page?: string
  evaluationRunId?: string
}

export function createWorkspaceEvent(payload: WorkspacePayload): Event {
  const metadata = payload.evaluationRunId?.trim()
    ? { purpose: "real_mode_evaluation", run_id: payload.evaluationRunId.trim() }
    : {}

  return {
    source: "web",
    type: "message",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata,
  }
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
