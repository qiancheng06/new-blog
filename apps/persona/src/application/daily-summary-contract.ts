const contractTag = `codex-daily-summary-${Date.now()}`
const contractDate = createContractDate(Date.now())
const port = Number(process.env.API_PORT) || 3109

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""
process.env.PERSONA_TIME_ZONE = "Asia/Shanghai"

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { insertEvent } = await import("../domain/event/store.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
seedSourceEvents()
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  await verifyInvalidDate(port)
  const first = await verifyGeneration(port)
  await verifyReadRoutes(port, first.note.id)
  await verifyIdempotentRefresh(port, first.note.id, first.summaryEventId)
  verifySourceEventsRemainImmutable()
  console.log("daily summary contract ok")
} finally {
  cleanupContractRows()
  await stopApiServer(server)
}

interface GenerationResponse {
  note: {
    id: string
    date: string
    summary: string
    highlights: string[]
    topicDistribution: Record<string, number>
    sourceEventId: string | null
    finalizedAt: string | null
    createdAt: string
    updatedAt: string
  }
  summaryEventId: string
  eventCount: number
}

async function verifyInvalidDate(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/daily-summaries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2099-02-30" }),
  })
  assert(response.status === 400, `invalid daily summary date expected 400, got ${response.status}`)
  assert(
    (await response.json() as { error?: string }).error === "date must be a real calendar date",
    "invalid daily summary date error mismatch",
  )
}

async function verifyGeneration(portNumber: number): Promise<GenerationResponse> {
  const body = await postJson<GenerationResponse>(portNumber, "/api/daily-summaries", { date: contractDate })
  assert(body.note.date === contractDate, "generated Daily Note date mismatch")
  assert(body.note.summary.includes(contractTag), "mock Daily Note summary must include source content")
  assert(body.note.highlights.some((item) => item.includes(contractTag)), "Daily Note highlights must include source content")
  assert(body.note.topicDistribution.conversation === 3, "Daily Note topic distribution mismatch")
  assert(body.eventCount === 3, "Daily Summary must count two user Events and one Companion reply")
  assert(body.note.sourceEventId === body.summaryEventId, "Daily Note must reference its summary_ready Event")
  assert(body.note.finalizedAt === null, "manual Daily Summary generation must remain unfinalized")
  assert(body.note.createdAt.length > 0 && body.note.updatedAt.length > 0, "Daily Note timestamps must be populated")

  const event = queryOne<{ source: string; type: string; payload: string; metadata: string }>(
    "SELECT source, type, payload, metadata FROM events WHERE id = ?",
    [body.summaryEventId],
  )
  assert(event?.source === "system", "Daily Summary Event source mismatch")
  assert(event.type === "summary_ready", "Daily Summary Event type mismatch")
  const payload = JSON.parse(event.payload) as { daily_note_id?: string; date?: string; event_count?: number }
  assert(payload.daily_note_id === body.note.id, "summary_ready Event must reference Daily Note")
  assert(payload.date === contractDate, "summary_ready Event date mismatch")
  assert(payload.event_count === 3, "summary_ready Event count mismatch")
  const metadata = JSON.parse(event.metadata) as { purpose?: string; visibility?: string }
  assert(metadata.purpose === "daily_summary", "summary_ready Event purpose mismatch")
  assert(metadata.visibility === "user", "summary_ready Event visibility mismatch")
  return body
}

async function verifyReadRoutes(portNumber: number, noteId: string): Promise<void> {
  const byDate = await getJson<{ note?: GenerationResponse["note"] }>(
    portNumber,
    `/api/daily-summaries/${contractDate}`,
  )
  assert(byDate.note?.id === noteId, "Daily Summary date route must return generated Note")

  const list = await getJson<{ items?: GenerationResponse["note"][] }>(
    portNumber,
    "/api/daily-summaries?limit=100",
  )
  assert(list.items?.some((note) => note.id === noteId), "Daily Summary list must include generated Note")

  const missing = await fetch(`http://127.0.0.1:${portNumber}/api/daily-summaries/2070-01-01`)
  assert(missing.status === 404, `missing Daily Summary expected 404, got ${missing.status}`)
}

async function verifyIdempotentRefresh(
  portNumber: number,
  noteId: string,
  firstSummaryEventId: string,
): Promise<void> {
  const second = await postJson<GenerationResponse>(portNumber, "/api/daily-summaries", { date: contractDate })
  assert(second.note.id === noteId, "Daily Summary refresh must preserve Daily Note id")
  assert(second.summaryEventId !== firstSummaryEventId, "Daily Summary refresh must append a new audit Event")
  assert(second.note.sourceEventId === second.summaryEventId, "refreshed Daily Note must reference latest summary Event")
  assert(second.note.finalizedAt === null, "manual Daily Summary refresh must remain unfinalized")

  const noteCount = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_notes WHERE date = ?", [contractDate])
  assert(noteCount?.count === 1, "Daily Summary refresh must keep one Daily Note per date")
  const eventCount = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM events WHERE type = 'summary_ready' AND payload LIKE ?",
    [`%${contractDate}%`],
  )
  assert(eventCount?.count === 2, "Daily Summary refresh must retain both summary_ready Events")
}

function verifySourceEventsRemainImmutable(): void {
  const sourceCount = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM events WHERE payload LIKE ? AND type != 'summary_ready'",
    [`%${contractTag}%`],
  )
  assert(sourceCount?.count === 3, "Daily Summary generation must not rewrite or delete source Events")
}

function seedSourceEvents(): void {
  insertEvent({
    source: "web",
    type: "message",
    payload: { text: `${contractTag} architecture work` },
    timestamp: `${contractDate}T02:00:00.000Z`,
    metadata: {},
  })
  insertEvent({
    source: "system",
    type: "companion_reply",
    payload: { text: `${contractTag} previous reply`, in_reply_to: "contract-input" },
    timestamp: `${contractDate}T02:01:00.000Z`,
    metadata: { purpose: "conversation_output" },
  })
  insertEvent({
    source: "telegram",
    type: "idea",
    payload: { text: `${contractTag} daily note idea` },
    timestamp: `${contractDate}T03:00:00.000Z`,
    metadata: {},
  })
}

function cleanupContractRows(): void {
  run("DELETE FROM daily_notes WHERE date = ?", [contractDate])
  run("DELETE FROM events WHERE (type = 'summary_ready' AND payload LIKE ?) OR payload LIKE ?", [
    `%${contractDate}%`,
    `%${contractTag}%`,
  ])
}

async function postJson<T>(portNumber: number, path: string, value: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${portNumber}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  })
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

async function getJson<T>(portNumber: number, path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${portNumber}${path}`)
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

async function waitForHealth(portNumber: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("daily summary contract server did not become healthy")
}

function createContractDate(seed: number): string {
  const year = 2080 + seed % 10
  const month = 1 + Math.floor(seed / 10) % 12
  const day = 1 + Math.floor(seed / 120) % 28
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
