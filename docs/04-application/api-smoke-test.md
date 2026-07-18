# API contract and smoke test boundary

This API layer can support smoke tests without calling a real LLM when the test stays inside startup, health, and event-read boundaries.

## Current HTTP Contract

### `GET /health`

Response `200`:

```ts
{
  status: "ok",
  uptime: number,
  events_today: number,
  background_tasks: {
    pending: number
  },
  analysis_jobs: {
    pending: number,
    running: number,
    succeeded: number,
    failed: number
  }
}
```

### `POST /api/chat`

Request:

```ts
{
  text: string,
  page?: string
}
```

Success response `200`:

```ts
{
  reply: string,
  eventId: string,
  replyEventId: string
}
```

`eventId` identifies the immutable user input Event. `replyEventId` identifies the
linked `system/companion_reply` output Event whose `in_reply_to` points back to the
input Event.

### `POST /api/daily-summaries`

Generate or refresh one Daily Note. The date is interpreted in
`PERSONA_TIME_ZONE`; when omitted it defaults to the current date in that zone.

```ts
{ date?: "YYYY-MM-DD" }
```

Success response `200`:

```ts
{
  note: {
    id: string,
    date: string,
    summary: string,
    highlights: string[],
    topicDistribution: Record<string, number>,
    sourceEventId: string,
    archivePath: string | null,
    archiveEventId: string | null,
    archivedAt: string | null,
    createdAt: string,
    updatedAt: string
  },
  summaryEventId: string,
  eventCount: number
}
```

Generation reads only the bounded user/Companion event window for that local
date. It atomically appends a `system/summary_ready` Event and upserts the unique
Daily Note. Refreshing a date preserves the Note id and appends a new audit Event.

### `GET /api/daily-summaries`

Returns `{ items: DailyNote[] }` ordered by date descending. Optional query
parameters are `limit` and `offset`.

### `GET /api/daily-summaries/:date`

Returns `{ note: DailyNote }` for an exact `YYYY-MM-DD` date, or `404` when no
Daily Note exists.

### `POST /api/daily-summaries/:date/archive`

Archives an existing Daily Note into the configured Obsidian vault. Send an
empty JSON object with `Content-Type: application/json`:

```ts
{}
```

Success response `200`:

```ts
{
  note: DailyNote,
  archiveEventId: string,
  relativePath: string,
  status: "created" | "updated" | "unchanged"
}
```

`/health` is the process liveness probe. It remains `200` with the stable legacy
shape even when a dependency check fails; dependency readiness belongs to
`/ready`.

### `GET /ready`

Returns `200` with `status: "ready"` when SQLite schema access and the selected
LLM configuration are available. It returns `503` with `status: "not_ready"`
when either core component fails. Telegram, Obsidian, failed Analysis jobs, and
pending background work remain visible but do not block readiness.

```ts
{
  status: "ready" | "not_ready",
  components: RuntimeComponents
}
```

The operation writes only Persona's managed Markdown block, preserves content
outside that block, appends a `system/daily_note_exported` audit Event, and then
records the relative path and audit Event id on the Daily Note projection. A
file with the same name but no unique managed block returns `409` and is never
overwritten. A missing, inaccessible, or unsafe vault returns `503`.

Error responses:

```ts
{ error: "invalid json" }      // 400
{ error: "json object required" } // 400
{ error: "text is required" }  // 400
{ error: "request body too large" } // 413
{ error: "content-type must be application/json" } // 415
{
  reply: string,
  error: "processing failed"
}                              // 500
```

### `GET /api/status`

Response `200`:

```ts
{
  status: "ok" | "degraded" | "not_ready",
  ready: boolean,
  components: RuntimeComponents,
  uptime: number,
  events_today: number,
  background_tasks: {
    pending: number
  },
  analysis_jobs: {
    pending: number,
    running: number,
    succeeded: number,
    failed: number
  },
  memory: {
    topics: number,
    profile: number,
    timelineEvents: number
  },
  recent_events: Array<{
    id: string,
    source: string,
    type: string,
    timestamp: string,
    preview: string
  }>
}
```

`RuntimeComponents` contains only bounded states and counts: database, LLM
provider/mode, Telegram lifecycle, Obsidian availability, Analysis job counts,
and pending background task count. It never includes configured paths, tokens,
prompts, message content, provider output, or raw errors. Optional component
failure changes the overall status to `degraded` without changing `ready`.

### `GET /api/analysis-jobs`

Returns privacy-safe Analysis execution state without source text or provider
output. Optional query parameters are `status`, `limit`, and `offset`; status is
one of `pending`, `running`, `succeeded`, or `failed`.

```ts
{
  items: Array<{
    id: string,
    sourceEventId: string,
    status: "pending" | "running" | "succeeded" | "failed",
    attemptCount: number,
    errorCode: "analysis_error" | "memory_error" | "interrupted" | null,
    retryEventId: string | null,
    createdAt: string,
    startedAt: string | null,
    finishedAt: string | null,
    updatedAt: string
  }>,
  limit: number,
  offset: number
}
```

### `POST /api/analysis-jobs/:id/retry`

Retries one failed Analysis job. Send `{}` as JSON. The response is `202` with
`{ job, retryEventId }`; the model call and Memory commit remain asynchronous.
The request first appends an `analysis_retry_requested` audit Event. Missing
jobs return `404`, while pending, running, or succeeded jobs return `409`.

Successful Memory projection writes and the job's `succeeded` transition commit
atomically. A retry never reapplies a succeeded job, and an older source Event
cannot overwrite Profile state whose provenance Event is newer.

### `GET /api/memory`

Read-only Memory overview for trusted Workspace/debug panels. Query params:

```ts
{
  topicLimit?: number,
  profileLimit?: number,
  timelineLimit?: number
}
```

Response `200`:

```ts
{
  stats: {
    topics: number,
    profile: number,
    timelineEvents: number
  },
  topics: TopicRow[],
  profile: ProfileRow[],
  timelineEvents: TimelineEventRow[]
}
```

### `GET /api/memory/topics`

Query params:

```ts
{
  limit?: number,
  offset?: number,
  name?: string,
  state?: "active" | "archived" | "suppressed" | "all"
}
```

Response `200`:

```ts
{
  items: TopicRow[],
  limit: number,
  offset: number
}
```

### `GET /api/memory/profile`

Query params:

```ts
{
  limit?: number,
  offset?: number,
  key?: string,
  state?: "active" | "archived" | "suppressed" | "all"
}
```

Response `200`:

```ts
{
  items: ProfileRow[],
  limit: number,
  offset: number
}
```

`ProfileRow.value` is returned as the stored JSON string. Parsing and editing are
future UI/view-model concerns.

### `GET /api/memory/timeline`

Query params:

```ts
{
  limit?: number,
  offset?: number,
  type?: "insight" | "shift" | "milestone",
  date?: string,
  sourceEventId?: string
}
```

Response `200`:

```ts
{
  items: TimelineEventRow[],
  limit: number,
  offset: number
}
```

### `GET /api/memory/sources`

Response `200`:

```ts
{
  profileWithSource: number,
  profileMissingSource: number,
  timelineWithSource: number,
  timelineMissingSource: number
}
```

### `POST /api/memory/profile/corrections`

Governed Profile correction. This is the only current Memory management write
operation exposed to Workspace. It records an Event before updating Profile.

Request:

```ts
{
  key: string,
  value: unknown,
  reason?: string
}
```

Success response `200`:

```ts
{
  eventId: string,
  profile: ProfileRow
}
```

Error responses:

```ts
{ error: "invalid json" }      // 400
{ error: "key is required" }   // 400
```

The resulting Event has `type = "memory_profile_correction"` and
`metadata.purpose = "memory_governance"`. The returned Profile row must have
`source_event_id === eventId`.

### `POST /api/memory/profile/state`

Governed Profile projection state transition. This hides, archives, or restores
Profile rows without deleting source Events.

Request:

```ts
{
  id: string,
  state: "active" | "archived" | "suppressed",
  reason: string
}
```

Success response `200`:

```ts
{
  eventId: string,
  profile: ProfileRow
}
```

Errors:

```ts
{ error: "invalid json" }      // 400
{ error: "id is required" }    // 400
{ error: "state is invalid" }  // 400
{ error: "reason is required" }// 400
{ error: "profile not found" } // 404
```

### `POST /api/memory/topics/state`

Governed Topic projection state transition. This hides, archives, or restores
Topic projection rows without deleting source Events.

Request and response match `POST /api/memory/profile/state`, but the success
body returns `topic`.

### Shared behavior

- The API binds to `127.0.0.1` unless `API_HOST` is explicitly configured.
- `OPTIONS` returns `204` only for configured `PERSONA_ALLOWED_ORIGINS` and
  returns `403` for an unknown browser origin.
- Unknown routes return `404 { error: "not found" }`.
- POST bodies must be JSON objects with `Content-Type: application/json` and
  may not exceed 64 KiB.
- Daily Note archive writes are confined to the configured external Obsidian
  vault and reject unmanaged same-name files instead of overwriting them.
- Memory list limits are normalized by the Application layer and capped at 100.
- Memory APIs are read-only and must not mutate Events, Profile, Topics, or
  Timeline rows.
- `POST /api/memory/profile/corrections` is the only exception; it is a governed
  Application write path and must first append an Event.
- `POST /api/memory/profile/state` and `POST /api/memory/topics/state` are
  governed projection-state write paths. They append governance Events before
  changing row state. The Event and projection change commit atomically.

## Safe paths

- Import `createApiServer`, `startApiServer`, and `stopApiServer` from `apps/persona/src/interface/api/server.ts`.
- Bind to port `0` or a test-specific port through `startApiServer({ port: 0 })`.
- Call `GET /health` to verify process liveness.
- Call `GET /ready` to verify core database and LLM configuration readiness.
- Call `GET /api/events` to verify read-side routing.
- Close the returned server with `stopApiServer(server)` or `server.close()`.

## Main runtime boundary

`apps/persona/src/main/index.ts` still auto-starts by default for normal application use. Smoke tests that only want to import the main module can set:

```bash
PERSONA_MAIN_AUTOSTART=0
```

Tests that need the real startup path can call `startPersonaRuntime({ api: { port: 0 }, telegram: false })` and then `runtime.stop()`.

For normal local Workspace use, the Companion chat panel expects the Application API at `http://127.0.0.1:3001`, with `GET /health` for status and `POST /api/chat` for chat messages.

## LLM boundary

`POST /api/chat` calls the conversation flow. With the default LLM provider this can reach the real DeepSeek API. Use one of these options for a no-real-LLM smoke test:

- Do not call `POST /api/chat`; test only `/health` and `/api/events`.
- Set `LLM_PROVIDER=mock` before calling `/api/chat`.

Do not depend on missing API keys to block a real network call. The explicit mock provider is the safer test contract.

## Current commands

Run the full no-real-LLM HTTP smoke test from the repository root:

```bash
npm.cmd run smoke:api
```

The command starts the API on `127.0.0.1:3101`, posts to `/api/chat`, verifies the mock reply, waits for the asynchronous Memory patch, deletes its smoke rows, and closes the server.

Run the stricter HTTP contract test:

```bash
npm.cmd run contract:api
```

The contract test starts the API on `127.0.0.1:3103`, verifies `/health`,
`/ready`, `/api/chat` happy/error paths, `/api/events`, `/api/status`, read-only
`/api/memory*` routes, `OPTIONS`, and `404`, then deletes its smoke rows and
closes the server.
