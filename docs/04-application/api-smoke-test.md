# API contract and smoke test boundary

This API layer can support smoke tests without calling a real LLM when the test stays inside startup, health, and event-read boundaries.

## Current HTTP Contract

### `GET /health`

Response `200`:

```ts
{
  status: "ok",
  uptime: number,
  events_today: number
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
{ error: "text is required" }  // 400
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

### Shared behavior

- `OPTIONS` returns `204` with CORS headers.
- Unknown routes return `404 { error: "not found" }`.

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

The contract test starts the API on `127.0.0.1:3103`, verifies `/health`, `/api/chat` happy/error paths, `/api/events`, `/api/status`, `OPTIONS`, and `404`, then deletes its smoke rows and closes the server.
