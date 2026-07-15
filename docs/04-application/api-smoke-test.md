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
  eventId: string
}
```

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
  status: "ok",
  uptime: number,
  events_today: number,
  background_tasks: {
    pending: number
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
- Call `GET /health` to verify process and database counters.
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

The contract test starts the API on `127.0.0.1:3103`, verifies `/health`, `/api/chat` happy/error paths, `/api/events`, `/api/status`, read-only `/api/memory*` routes, `OPTIONS`, and `404`, then deletes its smoke rows and closes the server.
