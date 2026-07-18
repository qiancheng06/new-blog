export interface ProfileUpdate {
  key: string
  value: unknown
  confidence: number
  cooling_required?: boolean
}

export interface TopicUpdate {
  name: string
  summary?: string
}

export interface TimelineEventPatch {
  date: string
  type: "insight" | "shift" | "milestone"
  summary: string
}

export interface MemoryPatch {
  profile_updates: ProfileUpdate[]
  topic_updates: TopicUpdate[]
  timeline_events: TimelineEventPatch[]
}

export interface MemoryPatchWriteOptions {
  sourceEventId?: string
  allowStaleProfile?: boolean
}
