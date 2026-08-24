const tag = `cc-${Date.now().toString(36)}`
const port = Number(process.env.API_PORT) || 3115

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  await verifyInvalidRange(port)
  const customTag = await createTag(port)
  const timed = await createTimedEvent(port, customTag.id)
  const allDay = await createAllDayEvent(port)
  await verifyBulkCreate(port)
  await verifyRange(port, timed.id, allDay.id)
  const updated = await updateTimedEvent(port, timed)
  await verifyVersionConflict(port, timed)
  const renamedTag = await updateTag(port, customTag)
  const reassignedVersion = await deleteTagAndReassign(port, renamedTag, updated)
  await deleteEvents(port, updated.id, reassignedVersion, allDay)
  verifySoftDeletes(timed.id, allDay.id, customTag.id)
  console.log("calendar contract ok")
} finally {
  cleanup()
  await stopApiServer(server)
}

interface ApiTag {
  id: string
  label: string
  tone: string
  version: number
}

interface ApiEvent {
  id: string
  title: string
  tagId: string
  seriesId: string | null
  version: number
  schedule: { kind: string; startDate?: string; endDate?: string; startsAt?: string; endsAt?: string; timeZone?: string }
}

async function verifyInvalidRange(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/calendar?from=2099-02-30&to=2099-03-01`)
  assert(response.status === 400, `invalid calendar range expected 400, got ${response.status}`)
}

async function createTag(portNumber: number): Promise<ApiTag> {
  const body = await sendJson<{ tag: ApiTag }>(portNumber, "POST", "/api/calendar/tags", {
    label: tag,
    tone: "blue",
  }, 201)
  assert(body.tag.label === tag, "calendar tag label mismatch")
  assert(body.tag.version === 1, "new calendar tag version must be 1")
  return body.tag
}

async function createTimedEvent(portNumber: number, tagId: string): Promise<ApiEvent> {
  const body = await sendJson<{ event: ApiEvent }>(portNumber, "POST", "/api/calendar/events", {
    title: `${tag} timed`,
    notes: "portable timed event",
    tagId,
    completed: false,
    schedule: {
      kind: "timed",
      startsAt: "2088-06-15T09:00:00+08:00",
      endsAt: "2088-06-15T10:00:00+08:00",
      timeZone: "Asia/Shanghai",
    },
  }, 201)
  assert(body.event.schedule.kind === "timed", "timed schedule kind mismatch")
  assert(body.event.version === 1, "new timed event version must be 1")
  return body.event
}

async function createAllDayEvent(portNumber: number): Promise<ApiEvent> {
  const body = await sendJson<{ event: ApiEvent }>(portNumber, "POST", "/api/calendar/events", {
    title: `${tag} all day`,
    notes: "portable all-day event",
    tagId: "focus",
    completed: false,
    schedule: { kind: "allDay", startDate: "2088-06-16", endDate: "2088-06-17" },
  }, 201)
  assert(body.event.schedule.kind === "allDay", "all-day schedule kind mismatch")
  return body.event
}

async function verifyBulkCreate(portNumber: number): Promise<void> {
  const values = [3, 10, 17].map((day) => ({
    title: `${tag} weekly batch`,
    notes: "weekly recurrence",
    tagId: "focus",
    completed: false,
    schedule: {
      kind: "timed",
      startsAt: `2088-07-${String(day).padStart(2, "0")}T09:00:00+08:00`,
      endsAt: `2088-07-${String(day).padStart(2, "0")}T10:00:00+08:00`,
      timeZone: "Asia/Shanghai",
    },
  }))
  const body = await sendJson<{ events: ApiEvent[] }>(
    portNumber,
    "POST",
    "/api/calendar/events/bulk",
    { events: values },
    201,
  )
  assert(body.events.length === 3, "bulk calendar create must return every event")
  assert(body.events.every((event) => event.version === 1), "bulk calendar events must start at version 1")
  assert(Boolean(body.events[0].seriesId), "bulk calendar events must expose a series id")
  assert(body.events.every((event) => event.seriesId === body.events[0].seriesId), "bulk calendar events must share one series id")

  const deleted = await sendJson<{ deletedCount: number; deletedIds: string[] }>(
    portNumber,
    "DELETE",
    `/api/calendar/events/${body.events[1].id}`,
    { version: body.events[1].version, scope: "future" },
  )
  assert(deleted.deletedCount === 2, "future series deletion must remove the selected and later events")
  assert(deleted.deletedIds.includes(body.events[1].id) && deleted.deletedIds.includes(body.events[2].id), "future series deletion returned unexpected ids")
  const activeSeries = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM calendar_events WHERE series_id = ? AND deleted_at IS NULL",
    [body.events[0].seriesId],
  )
  assert(activeSeries?.count === 1, "future series deletion must preserve earlier events")

  const rejectedTitle = `${tag} rejected batch`
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/calendar/events/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        { ...values[0], title: rejectedTitle },
        {
          ...values[1],
          title: rejectedTitle,
          schedule: { ...values[1].schedule, endsAt: values[1].schedule.startsAt },
        },
      ],
    }),
  })
  assert(response.status === 400, `invalid bulk calendar create expected 400, got ${response.status}`)
  const rejected = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM calendar_events WHERE title = ?", [rejectedTitle])
  assert(rejected?.count === 0, "invalid bulk calendar create must roll back every event")
}

async function verifyRange(portNumber: number, timedId: string, allDayId: string): Promise<void> {
  const body = await getJson<{ events: ApiEvent[]; tags: ApiTag[]; timeZone: string }>(
    portNumber,
    "/api/calendar?from=2088-06-15&to=2088-06-16",
  )
  assert(body.events.some((event) => event.id === timedId), "calendar range must include timed event")
  assert(body.events.some((event) => event.id === allDayId), "calendar range must include all-day event")
  assert(body.tags.some((item) => item.id === "focus"), "default calendar tags must be seeded")
  assert(body.timeZone === "Asia/Shanghai", "calendar response must expose server time zone")

  const empty = await getJson<{ events: ApiEvent[] }>(
    portNumber,
    "/api/calendar?from=2088-07-01&to=2088-07-02",
  )
  assert(!empty.events.some((event) => event.id === timedId || event.id === allDayId), "range filtering must exclude unrelated events")
}

async function updateTimedEvent(portNumber: number, event: ApiEvent): Promise<ApiEvent> {
  const body = await sendJson<{ event: ApiEvent }>(
    portNumber,
    "PATCH",
    `/api/calendar/events/${event.id}`,
    { version: event.version, title: `${tag} updated` },
  )
  assert(body.event.version === 2, "calendar update must increment version")
  assert(body.event.title.endsWith("updated"), "calendar event title update mismatch")
  return body.event
}

async function verifyVersionConflict(portNumber: number, stale: ApiEvent): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/calendar/events/${stale.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: stale.version, title: `${tag} stale write` }),
  })
  assert(response.status === 409, `stale calendar write expected 409, got ${response.status}`)
}

async function updateTag(portNumber: number, calendarTag: ApiTag): Promise<ApiTag> {
  const body = await sendJson<{ tag: ApiTag }>(
    portNumber,
    "PATCH",
    `/api/calendar/tags/${calendarTag.id}`,
    { version: calendarTag.version, label: `${tag}-v2`, tone: "amber" },
  )
  assert(body.tag.version === 2, "calendar tag update must increment version")
  assert(body.tag.tone === "amber", "calendar tag tone update mismatch")
  return body.tag
}

async function deleteTagAndReassign(portNumber: number, calendarTag: ApiTag, event: ApiEvent): Promise<number> {
  const result = await sendJson<{ deleted: true; movedEventCount: number }>(
    portNumber,
    "DELETE",
    `/api/calendar/tags/${calendarTag.id}`,
    { version: calendarTag.version, fallbackTagId: "focus" },
  )
  assert(result.deleted && result.movedEventCount === 1, "tag deletion must reassign one active event")
  const row = queryOne<{ tag_id: string; version: number }>("SELECT tag_id, version FROM calendar_events WHERE id = ?", [event.id])
  assert(row?.tag_id === "focus", "deleted tag event must move to fallback tag")
  assert(row.version === event.version + 1, "tag reassignment must increment event version")
  return row.version
}

async function deleteEvents(portNumber: number, timedId: string, timedVersion: number, allDay: ApiEvent): Promise<void> {
  await sendJson(portNumber, "DELETE", `/api/calendar/events/${timedId}`, { version: timedVersion })
  await sendJson(portNumber, "DELETE", `/api/calendar/events/${allDay.id}`, { version: allDay.version })
  const body = await getJson<{ events: ApiEvent[] }>(portNumber, "/api/calendar?from=2088-06-15&to=2088-06-16")
  assert(body.events.length === 0, "soft-deleted calendar events must not appear in ranges")
}

function verifySoftDeletes(timedId: string, allDayId: string, tagId: string): void {
  const events = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM calendar_events WHERE id IN (?, ?) AND deleted_at IS NOT NULL",
    [timedId, allDayId],
  )
  const deletedTag = queryOne<{ deleted_at: string | null }>("SELECT deleted_at FROM calendar_tags WHERE id = ?", [tagId])
  assert(events?.count === 2, "calendar events must be retained as soft deletes")
  assert(Boolean(deletedTag?.deleted_at), "calendar tag must be retained as a soft delete")
}

async function getJson<T>(portNumber: number, path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${portNumber}${path}`)
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

async function sendJson<T = Record<string, unknown>>(
  portNumber: number,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  value: unknown,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${portNumber}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  })
  if (response.status !== expectedStatus) throw new Error(`${path} failed: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${portNumber}/health`)).ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("calendar contract server did not become healthy")
}

function cleanup(): void {
  run("DELETE FROM calendar_events WHERE title LIKE ?", [`${tag}%`])
  run("DELETE FROM calendar_tags WHERE label LIKE ?", [`${tag}%`])
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
