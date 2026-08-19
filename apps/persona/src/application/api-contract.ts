import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http"

const contractTag = `codex-api-contract-${Date.now()}`
const port = Number(process.env.API_PORT) || 3103
const fakeProviderPort = port + 1

process.env.LLM_PROVIDER = "mock"
process.env.API_PORT = String(port)
process.env.TELEGRAM_TOKEN = ""

const { initializeDb, queryOne, run } = await import("../infra/db/pool.js")
const { startApiServer, stopApiServer } = await import("../interface/api/server.js")

initializeDb()
const fakeProviderRequests: Array<{ body: Record<string, unknown>; authorization?: string }> = []
const fakeProvider = await startFakeProvider(fakeProviderPort, fakeProviderRequests)
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  await waitForHealth(port)
  await verifyOptions(port)
  await verifyHealth(port)
  await verifyNotFound(port)
  await verifyInvalidChat(port)
  await verifyValidChat(port)
  await verifyCustomProvider(port, fakeProviderPort, fakeProviderRequests)
  await verifyAiConnectionTest(port, fakeProviderPort, fakeProviderRequests)
  await verifyEvents(port)
  await verifyStatus(port)
  await verifyMemoryOverview(port)
  await verifyMemoryTopics(port)
  await verifyMemoryProfile(port)
  await verifyMemoryProfileCorrection(port)
  await verifyMemoryProjectionState(port)
  await verifyMemoryTimeline(port)
  await verifyMemorySources(port)
  console.log("api contract ok")
} finally {
  cleanupContractRows(contractTag)
  await stopApiServer(server)
  await closeServer(fakeProvider)
}

async function verifyOptions(portNumber: number): Promise<void> {
  const allowedOrigin = "http://127.0.0.1:5173"
  const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin },
  })
  assert(response.status === 204, `OPTIONS /api/chat expected 204, got ${response.status}`)
  assert(response.headers.get("access-control-allow-origin") === allowedOrigin, "OPTIONS should echo trusted Workspace origin")

  const rejected = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.example" },
  })
  assert(rejected.status === 403, `untrusted OPTIONS expected 403, got ${rejected.status}`)
  assert(rejected.headers.get("access-control-allow-origin") === null, "untrusted origin must not receive CORS access")
}

async function verifyHealth(portNumber: number): Promise<void> {
  const body = await getJson<{
    status?: string
    uptime?: number
    events_today?: number
    background_tasks?: { pending?: number }
  }>(`http://127.0.0.1:${portNumber}/health`)

  assert(body.status === "ok", "health.status must be ok")
  assert(typeof body.uptime === "number", "health.uptime must be number")
  assert(typeof body.events_today === "number", "health.events_today must be number")
  assert(typeof body.background_tasks?.pending === "number", "health.background_tasks.pending must be number")
}

async function verifyNotFound(portNumber: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${portNumber}/missing`)
  assert(response.status === 404, `missing route expected 404, got ${response.status}`)
  const body = await response.json() as { error?: string }
  assert(body.error === "not found", "missing route error must be not found")
}

async function verifyInvalidChat(portNumber: number): Promise<void> {
  const rejectedTag = `${contractTag}-rejected-body`

  const wrongContentType = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    body: JSON.stringify({ text: rejectedTag }),
  })
  assert(wrongContentType.status === 415, `wrong content type expected 415, got ${wrongContentType.status}`)
  assert(
    (await wrongContentType.json() as { error?: string }).error === "content-type must be application/json",
    "wrong content type error mismatch",
  )

  const invalidJson = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  })
  assert(invalidJson.status === 400, `invalid JSON expected 400, got ${invalidJson.status}`)
  assert((await invalidJson.json() as { error?: string }).error === "invalid json", "invalid JSON error mismatch")

  for (const invalidShape of [null, [], "text", 42]) {
    const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidShape),
    })
    assert(response.status === 400, `non-object JSON expected 400, got ${response.status}`)
    assert((await response.json() as { error?: string }).error === "json object required", "JSON object error mismatch")
  }

  const oversized = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${rejectedTag}${"x".repeat(70 * 1024)}` }),
  })
  assert(oversized.status === 413, `oversized JSON expected 413, got ${oversized.status}`)
  assert((await oversized.json() as { error?: string }).error === "request body too large", "oversized body error mismatch")

  const missingText = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  })
  assert(missingText.status === 400, `missing text expected 400, got ${missingText.status}`)
  assert((await missingText.json() as { error?: string }).error === "text is required", "missing text error mismatch")

  const invalidAiCases = [
    { label: "non-object ai", ai: null },
    { label: "temperature out of range", ai: { temperature: 2.1 } },
    { label: "fractional history limit", ai: { historyLimit: 1.5 } },
    { label: "insecure remote endpoint", ai: { endpoint: "http://example.com/v1/chat/completions", model: "example", apiKey: "secret" } },
    { label: "remote endpoint without key", ai: { endpoint: "https://example.com/v1/chat/completions", model: "example" } },
    { label: "oversized instructions", ai: { instructions: "x".repeat(1001) } },
  ]
  for (const invalidCase of invalidAiCases) {
    const response = await fetch(`http://127.0.0.1:${portNumber}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${rejectedTag}-${invalidCase.label}`, ai: invalidCase.ai }),
    })
    assert(response.status === 400, `${invalidCase.label} expected 400, got ${response.status}`)
  }

  const rejectedEvent = queryOne<{ id: string }>("SELECT id FROM events WHERE payload LIKE ?", [`%${rejectedTag}%`])
  assert(!rejectedEvent, "rejected request bodies must not create Events")
}

async function verifyValidChat(portNumber: number): Promise<void> {
  const evaluationRunId = `${contractTag}-eval`
  const body = await postJson<{
    reply?: string
    eventId?: string
    replyEventId?: string
  }>(`http://127.0.0.1:${portNumber}/api/chat`, {
    text: contractTag,
    page: "api-contract",
    evaluationRunId,
    ai: {
      temperature: 0.4,
      topP: 0.9,
      maxTokens: 512,
      historyLimit: 4,
      memoryEnabled: true,
      backgroundAnalysis: true,
      instructions: "Keep the reply concise.",
    },
  })

  assert(typeof body.reply === "string" && body.reply.includes(contractTag), "chat.reply must include mock tag")
  assert(typeof body.eventId === "string" && body.eventId.length > 0, "chat.eventId must be non-empty string")
  assert(typeof body.replyEventId === "string" && body.replyEventId.length > 0, "chat.replyEventId must be non-empty string")

  const event = queryOne<{ metadata: string }>("SELECT metadata FROM events WHERE id = ?", [body.eventId])
  assert(event, "chat event should exist")
  const metadata = JSON.parse(event.metadata) as { purpose?: string; run_id?: string }
  assert(metadata.purpose === "real_mode_evaluation", "evaluation metadata purpose mismatch")
  assert(metadata.run_id === evaluationRunId, "evaluation metadata run_id mismatch")

  const replyEvent = queryOne<{ source: string; type: string; payload: string; metadata: string }>(
    "SELECT source, type, payload, metadata FROM events WHERE id = ?",
    [body.replyEventId],
  )
  assert(replyEvent, "chat reply event should exist")
  assert(replyEvent.source === "system", "chat reply event source must be system")
  assert(replyEvent.type === "companion_reply", "chat reply event type must be companion_reply")
  const replyPayload = JSON.parse(replyEvent.payload) as { text?: string; in_reply_to?: string }
  assert(replyPayload.text === body.reply, "chat reply event text must equal the response reply")
  assert(replyPayload.in_reply_to === body.eventId, "chat reply event payload must link to the input event")
  const replyMetadata = JSON.parse(replyEvent.metadata) as {
    purpose?: string
    visibility?: string
    in_reply_to?: string
    run_id?: string
  }
  assert(replyMetadata.purpose === "conversation_output", "chat reply event purpose mismatch")
  assert(replyMetadata.visibility === "user", "chat reply event visibility mismatch")
  assert(replyMetadata.in_reply_to === body.eventId, "chat reply event metadata must link to the input event")
  assert(replyMetadata.run_id === evaluationRunId, "chat reply event run_id mismatch")
}

async function verifyCustomProvider(
  portNumber: number,
  providerPort: number,
  requests: Array<{ body: Record<string, unknown>; authorization?: string }>,
): Promise<void> {
  const customTag = `${contractTag}-custom-provider`
  const customKey = `${contractTag}-secret`
  const body = await postJson<{ reply?: string }>(`http://127.0.0.1:${portNumber}/api/chat`, {
    text: customTag,
    ai: {
      endpoint: `http://127.0.0.1:${providerPort}/v1/chat/completions`,
      model: "contract-model",
      apiKey: customKey,
      temperature: 1.2,
      topP: 0.75,
      maxTokens: 768,
      historyLimit: 0,
      memoryEnabled: false,
      backgroundAnalysis: false,
    },
  })

  assert(body.reply === `custom provider reply: ${customTag}`, "custom provider reply mismatch")
  assert(requests.length === 1, `custom provider expected one request, got ${requests.length}`)
  assert(requests[0].authorization === `Bearer ${customKey}`, "custom provider authorization mismatch")
  assert(requests[0].body.model === "contract-model", "custom provider model mismatch")
  assert(requests[0].body.temperature === 1.2, "custom provider temperature mismatch")
  assert(requests[0].body.top_p === 0.75, "custom provider top_p mismatch")
  assert(requests[0].body.max_tokens === 768, "custom provider max_tokens mismatch")

  const leakedSecret = queryOne<{ id: string }>("SELECT id FROM events WHERE payload LIKE ? OR metadata LIKE ?", [
    `%${customKey}%`,
    `%${customKey}%`,
  ])
  assert(!leakedSecret, "custom provider API key must not be persisted in Events")
}

async function verifyAiConnectionTest(
  portNumber: number,
  providerPort: number,
  requests: Array<{ body: Record<string, unknown>; authorization?: string }>,
): Promise<void> {
  const eventsBefore = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM events")?.count ?? 0
  const defaultResult = await postJson<{ reply?: string; latencyMs?: number }>(
    `http://127.0.0.1:${portNumber}/api/ai/test`,
    { ai: { temperature: 0.2, maxTokens: 128 } },
  )
  assert(defaultResult.reply === "[mock companion] Reply with OK.", "default AI connection test reply mismatch")
  assert(typeof defaultResult.latencyMs === "number", "default AI connection test latency missing")

  const testKey = `${contractTag}-test-key`
  const customResult = await postJson<{ reply?: string; latencyMs?: number }>(
    `http://127.0.0.1:${portNumber}/api/ai/test`,
    {
      ai: {
        endpoint: `http://127.0.0.1:${providerPort}/v1/chat/completions`,
        model: "test-model",
        apiKey: testKey,
        temperature: 0.1,
        maxTokens: 128,
      },
    },
  )
  assert(customResult.reply === "custom provider reply: Reply with OK.", "custom AI connection test reply mismatch")
  assert(typeof customResult.latencyMs === "number", "custom AI connection test latency missing")
  assert(requests.length === 2, `AI connection test expected two total provider requests, got ${requests.length}`)
  assert(requests[1].authorization === `Bearer ${testKey}`, "AI connection test authorization mismatch")
  assert(requests[1].body.model === "test-model", "AI connection test model mismatch")

  const eventsAfter = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM events")?.count ?? 0
  assert(eventsAfter === eventsBefore, "AI connection test must not persist probe messages")
  const leakedKey = queryOne<{ id: string }>("SELECT id FROM events WHERE payload LIKE ? OR metadata LIKE ?", [`%${testKey}%`, `%${testKey}%`])
  assert(!leakedKey, "AI connection test must not persist API keys")
}

async function startFakeProvider(
  providerPort: number,
  requests: Array<{ body: Record<string, unknown>; authorization?: string }>,
): Promise<Server> {
  const provider = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let raw = ""
    for await (const chunk of req) raw += chunk.toString()
    const body = JSON.parse(raw) as Record<string, unknown>
    requests.push({ body, authorization: req.headers.authorization })
    const messages = body.messages as Array<{ role?: string; content?: string }>
    const userText = [...messages].reverse().find((message) => message.role === "user")?.content ?? ""
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ choices: [{ message: { content: `custom provider reply: ${userText}` } }] }))
  })

  await new Promise<void>((resolve, reject) => {
    provider.once("error", reject)
    provider.listen(providerPort, "127.0.0.1", resolve)
  })
  return provider
}

function closeServer(serverToClose: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    serverToClose.close((error) => error ? reject(error) : resolve())
  })
}

async function verifyEvents(portNumber: number): Promise<void> {
  const body = await getJson<{ events?: unknown[] }>(`http://127.0.0.1:${portNumber}/api/events`)
  assert(Array.isArray(body.events), "events.events must be array")
}

async function verifyStatus(portNumber: number): Promise<void> {
  const body = await getJson<{
    status?: string
    uptime?: number
    events_today?: number
    background_tasks?: { pending?: number }
    memory?: { topics?: number; profile?: number; timelineEvents?: number }
    recent_events?: Array<{ id?: string; source?: string; type?: string; timestamp?: string; preview?: string }>
  }>(`http://127.0.0.1:${portNumber}/api/status`)

  assert(body.status === "ok", "status.status must be ok")
  assert(typeof body.uptime === "number", "status.uptime must be number")
  assert(typeof body.events_today === "number", "status.events_today must be number")
  assert(typeof body.background_tasks?.pending === "number", "status.background_tasks.pending must be number")
  assert(typeof body.memory?.topics === "number", "status.memory.topics must be number")
  assert(typeof body.memory?.profile === "number", "status.memory.profile must be number")
  assert(typeof body.memory?.timelineEvents === "number", "status.memory.timelineEvents must be number")
  assert(Array.isArray(body.recent_events), "status.recent_events must be array")

  for (const event of body.recent_events) {
    assert(typeof event.id === "string", "recent event id must be string")
    assert(typeof event.source === "string", "recent event source must be string")
    assert(typeof event.type === "string", "recent event type must be string")
    assert(typeof event.timestamp === "string", "recent event timestamp must be string")
    assert(typeof event.preview === "string", "recent event preview must be string")
  }
}

async function verifyMemoryOverview(portNumber: number): Promise<void> {
  const body = await getJson<{
    stats?: { topics?: number; profile?: number; timelineEvents?: number }
    topics?: unknown[]
    profile?: unknown[]
    timelineEvents?: unknown[]
  }>(`http://127.0.0.1:${portNumber}/api/memory?topicLimit=5&profileLimit=5&timelineLimit=5`)

  assert(typeof body.stats?.topics === "number", "memory.stats.topics must be number")
  assert(typeof body.stats.profile === "number", "memory.stats.profile must be number")
  assert(typeof body.stats.timelineEvents === "number", "memory.stats.timelineEvents must be number")
  assert(Array.isArray(body.topics), "memory.topics must be array")
  assert(Array.isArray(body.profile), "memory.profile must be array")
  assert(Array.isArray(body.timelineEvents), "memory.timelineEvents must be array")
}

async function verifyMemoryTopics(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{ id?: string; name?: string; summary?: string; message_count?: number }>
    limit?: number
    offset?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}&limit=999&offset=-1`)

  assert(body.limit === 100, "memory topics limit must be clamped to 100")
  assert(body.offset === 0, "memory topics offset must normalize to 0")
  assert(Array.isArray(body.items), "memory topics items must be array")
  assert(body.items.some((item) => item.name === contractTag), "memory topics should include contract topic")
}

async function verifyMemoryProfile(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{ id?: string; key?: string; value?: string; source_event_id?: string | null; updated_at?: string }>
    limit?: number
    offset?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile?key=last_mock_message&limit=20&offset=0`)

  assert(body.limit === 20, "memory profile limit mismatch")
  assert(body.offset === 0, "memory profile offset mismatch")
  assert(Array.isArray(body.items), "memory profile items must be array")
  const item = body.items.find((row) => row.key === "last_mock_message" && typeof row.value === "string" && row.value.includes(contractTag))
  assert(item, "memory profile should include last_mock_message contract row")
  assert(typeof item.id === "string", "memory profile item id must be string")
  assert(typeof item.updated_at === "string", "memory profile updated_at must be string")
}

async function verifyMemoryProfileCorrection(portNumber: number): Promise<void> {
  const invalidJson = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  })
  assert(invalidJson.status === 400, `invalid profile correction JSON expected 400, got ${invalidJson.status}`)

  const missingKey = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "   ", value: "ignored" }),
  })
  assert(missingKey.status === 400, `missing profile correction key expected 400, got ${missingKey.status}`)

  const key = `contract_profile_correction_${contractTag}`
  const body = await postJson<{
    eventId?: string
    profile?: { id?: string; key?: string; value?: string; source_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    key,
    value: { mode: "correction", tag: contractTag },
    reason: "api contract correction",
  })

  assert(typeof body.eventId === "string" && body.eventId.length > 0, "profile correction eventId must be string")
  assert(body.profile?.key === key, "profile correction key mismatch")
  assert(typeof body.profile.value === "string" && body.profile.value.includes(contractTag), "profile correction value mismatch")
  assert(body.profile.source_event_id === body.eventId, "profile correction source_event_id must point to correction event")

  const event = queryOne<{ type: string; payload: string; metadata: string }>("SELECT type, payload, metadata FROM events WHERE id = ?", [body.eventId])
  assert(event, "profile correction event should exist")
  assert(event.type === "memory_profile_correction", "profile correction event type mismatch")
  assert(event.payload.includes(key), "profile correction event payload should include key")
  const metadata = JSON.parse(event.metadata) as { purpose?: string }
  assert(metadata.purpose === "memory_governance", "profile correction event metadata purpose mismatch")
}

async function verifyMemoryProjectionState(portNumber: number): Promise<void> {
  const profileKey = `contract_state_profile_${contractTag}`
  const correction = await postJson<{
    eventId?: string
    profile?: { id?: string; key?: string; state?: string; source_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    key: profileKey,
    value: { tag: contractTag, state: "active" },
    reason: `state setup ${contractTag}`,
  })

  const profileId = correction.profile?.id
  assert(typeof profileId === "string", "state correction profile id must be string")
  assert(correction.profile?.state === "active", "new profile correction must be active")

  const invalidProfileState = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: profileId, state: "deleted", reason: "invalid" }),
  })
  assert(invalidProfileState.status === 400, `invalid profile state expected 400, got ${invalidProfileState.status}`)

  const missingProfile = await fetch(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000000", state: "suppressed", reason: "missing target" }),
  })
  assert(missingProfile.status === 404, `missing profile state target expected 404, got ${missingProfile.status}`)

  const suppressedProfile = await postJson<{
    eventId?: string
    profile?: { id?: string; key?: string; state?: string; state_event_id?: string | null; state_reason?: string }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    id: profileId,
    state: "suppressed",
    reason: `contract suppress ${contractTag}`,
  })

  assert(typeof suppressedProfile.eventId === "string", "suppressed profile eventId must be string")
  assert(suppressedProfile.profile?.state === "suppressed", "profile state should be suppressed")
  assert(suppressedProfile.profile.state_event_id === suppressedProfile.eventId, "profile state_event_id mismatch")

  const suppressedDefault = await getJson<{ items?: Array<{ id?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/profile?key=${encodeURIComponent(profileKey)}`
  )
  assert(Array.isArray(suppressedDefault.items), "suppressed default profile items must be array")
  assert(!suppressedDefault.items.some((item) => item.id === profileId), "suppressed profile must be hidden from default list")

  const suppressedList = await getJson<{ items?: Array<{ id?: string; state?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/profile?key=${encodeURIComponent(profileKey)}&state=suppressed`
  )
  assert(suppressedList.items?.some((item) => item.id === profileId && item.state === "suppressed"), "state=suppressed must include suppressed profile")

  await postJson(`http://127.0.0.1:${portNumber}/api/memory/profile/corrections`, {
    key: profileKey,
    value: { tag: contractTag, state: "updated while suppressed" },
    reason: `upsert should not revive ${contractTag}`,
  })
  const stillHidden = await getJson<{ items?: Array<{ id?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/profile?key=${encodeURIComponent(profileKey)}`
  )
  assert(!stillHidden.items?.some((item) => item.id === profileId), "profile correction must not revive suppressed profile")

  const restoredProfile = await postJson<{
    eventId?: string
    profile?: { id?: string; state?: string; state_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/profile/state`, {
    id: profileId,
    state: "active",
    reason: `contract restore ${contractTag}`,
  })
  assert(restoredProfile.profile?.state === "active", "restored profile must be active")
  assert(restoredProfile.profile.state_event_id === restoredProfile.eventId, "restored profile state_event_id mismatch")

  const topicList = await getJson<{ items?: Array<{ id?: string; name?: string; state?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}&state=all`
  )
  const topic = topicList.items?.find((item) => item.name === contractTag)
  assert(typeof topic?.id === "string", "state contract topic id must be string")

  const archivedTopic = await postJson<{
    eventId?: string
    topic?: { id?: string; state?: string; state_event_id?: string | null }
  }>(`http://127.0.0.1:${portNumber}/api/memory/topics/state`, {
    id: topic.id,
    state: "archived",
    reason: `contract archive topic ${contractTag}`,
  })
  assert(archivedTopic.topic?.state === "archived", "topic state should be archived")
  assert(archivedTopic.topic.state_event_id === archivedTopic.eventId, "topic state_event_id mismatch")

  const hiddenTopic = await getJson<{ items?: Array<{ id?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}`
  )
  assert(!hiddenTopic.items?.some((item) => item.id === topic.id), "archived topic must be hidden from default list")

  const archivedTopicList = await getJson<{ items?: Array<{ id?: string; state?: string }> }>(
    `http://127.0.0.1:${portNumber}/api/memory/topics?name=${encodeURIComponent(contractTag)}&state=archived`
  )
  assert(archivedTopicList.items?.some((item) => item.id === topic.id && item.state === "archived"), "state=archived must include archived topic")

  await postJson(`http://127.0.0.1:${portNumber}/api/memory/topics/state`, {
    id: topic.id,
    state: "active",
    reason: `contract restore topic ${contractTag}`,
  })

  const profileEvent = queryOne<{ type: string; metadata: string }>("SELECT type, metadata FROM events WHERE id = ?", [suppressedProfile.eventId])
  assert(profileEvent?.type === "memory_profile_suppression", "profile suppression event type mismatch")
  assert((JSON.parse(profileEvent.metadata) as { purpose?: string }).purpose === "memory_governance", "profile suppression metadata mismatch")

  const topicEvent = queryOne<{ type: string; metadata: string }>("SELECT type, metadata FROM events WHERE id = ?", [archivedTopic.eventId])
  assert(topicEvent?.type === "memory_topic_suppression", "topic archive event type mismatch")
  assert((JSON.parse(topicEvent.metadata) as { purpose?: string }).purpose === "memory_governance", "topic archive metadata mismatch")
}


async function verifyMemoryTimeline(portNumber: number): Promise<void> {
  const body = await getJson<{
    items?: Array<{ id?: string; date?: string; type?: string; summary?: string; source_event_id?: string | null }>
    limit?: number
    offset?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/timeline?type=insight&limit=20&offset=0`)

  assert(body.limit === 20, "memory timeline limit mismatch")
  assert(body.offset === 0, "memory timeline offset mismatch")
  assert(Array.isArray(body.items), "memory timeline items must be array")
  const item = body.items.find((row) => row.type === "insight" && typeof row.summary === "string" && row.summary.includes(contractTag))
  assert(item, "memory timeline should include contract insight row")
  assert(typeof item.id === "string", "memory timeline item id must be string")
  assert(typeof item.date === "string", "memory timeline item date must be string")
}

async function verifyMemorySources(portNumber: number): Promise<void> {
  const body = await getJson<{
    profileWithSource?: number
    profileMissingSource?: number
    timelineWithSource?: number
    timelineMissingSource?: number
  }>(`http://127.0.0.1:${portNumber}/api/memory/sources`)

  assert(typeof body.profileWithSource === "number", "memory sources profileWithSource must be number")
  assert(typeof body.profileMissingSource === "number", "memory sources profileMissingSource must be number")
  assert(typeof body.timelineWithSource === "number", "memory sources timelineWithSource must be number")
  assert(typeof body.timelineMissingSource === "number", "memory sources timelineMissingSource must be number")
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
  return await response.json() as T
}

async function postJson<T>(url: string, data: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`)
  }
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
    await delay(100)
  }
  throw new Error("api server did not become healthy")
}

function cleanupContractRows(tag: string): void {
  run("DELETE FROM timeline_events WHERE summary LIKE ?", [`%${tag}%`])
  run("DELETE FROM profile WHERE key = ? AND value LIKE ?", ["last_mock_message", `%${tag}%`])
  run("DELETE FROM profile WHERE key LIKE ?", [`contract_profile_correction_${tag}%`])
  run("DELETE FROM profile WHERE key LIKE ?", [`contract_state_profile_${tag}%`])
  run("DELETE FROM topics WHERE name LIKE ? OR summary LIKE ?", [`%${tag}%`, `%${tag}%`])
  run("DELETE FROM events WHERE payload LIKE ?", [`%${tag}%`])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export {}
