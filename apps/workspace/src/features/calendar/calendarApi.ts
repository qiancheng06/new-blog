import {
  deletePersonaJson,
  getPersonaJson,
  patchPersonaJson,
  postPersonaJson,
} from "@/shared/api/personaApi"

export type CalendarTone = "green" | "blue" | "amber" | "red" | "gray"

export interface CalendarApiTag {
  id: string
  label: string
  tone: CalendarTone
  sortOrder: number
  version: number
  createdAt: string
  updatedAt: string
}

export type CalendarApiSchedule =
  | { kind: "allDay"; startDate: string; endDate: string }
  | { kind: "timed"; startsAt: string; endsAt: string; timeZone: string }

export interface CalendarApiEvent {
  id: string
  title: string
  notes: string
  tagId: string
  completed: boolean
  schedule: CalendarApiSchedule
  version: number
  createdAt: string
  updatedAt: string
}

export interface CalendarEventWrite {
  title: string
  notes: string
  tagId: string
  completed: boolean
  schedule: CalendarApiSchedule
}

export function getCalendarRange(from: string, to: string): Promise<{
  events: CalendarApiEvent[]
  tags: CalendarApiTag[]
  timeZone: string
}> {
  return getPersonaJson(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export async function createServerCalendarEvent(value: CalendarEventWrite): Promise<CalendarApiEvent> {
  const result = await postPersonaJson<{ event: CalendarApiEvent }>("/api/calendar/events", value)
  return result.event
}

export async function updateServerCalendarEvent(
  id: string,
  version: number,
  value: CalendarEventWrite,
): Promise<CalendarApiEvent> {
  const result = await patchPersonaJson<{ event: CalendarApiEvent }>(
    `/api/calendar/events/${encodeURIComponent(id)}`,
    { ...value, version },
  )
  return result.event
}

export function deleteServerCalendarEvent(id: string, version: number): Promise<{ deleted: true }> {
  return deletePersonaJson(`/api/calendar/events/${encodeURIComponent(id)}`, { version })
}

export async function createServerCalendarTag(label: string, tone: CalendarTone): Promise<CalendarApiTag> {
  const result = await postPersonaJson<{ tag: CalendarApiTag }>("/api/calendar/tags", { label, tone })
  return result.tag
}

export async function updateServerCalendarTag(
  id: string,
  version: number,
  label: string,
  tone: CalendarTone,
): Promise<CalendarApiTag> {
  const result = await patchPersonaJson<{ tag: CalendarApiTag }>(
    `/api/calendar/tags/${encodeURIComponent(id)}`,
    { version, label, tone },
  )
  return result.tag
}

export function deleteServerCalendarTag(
  id: string,
  version: number,
  fallbackTagId: string,
): Promise<{ deleted: true; movedEventCount: number }> {
  return deletePersonaJson(`/api/calendar/tags/${encodeURIComponent(id)}`, { version, fallbackTagId })
}
