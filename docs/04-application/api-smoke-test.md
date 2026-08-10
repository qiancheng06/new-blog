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

`/health` is the process liveness probe. It remains `200` with the stable legacy
shape even when a dependency check fails; dependency readiness belongs to
`/ready`.

### `GET /ready`

Returns `200` with `status: "ready"` when SQLite schema access and the selected
LLM configuration are available. It returns `503` with `status: "not_ready"`
when either core component fails. Telegram, Obsidian, Daily Summary scheduling,
failed Analysis jobs, and pending background work remain visible but do not
block readiness.

```ts
{
  status: "ready" | "not_ready",
  components: RuntimeComponents
}
```

### `POST /api/chat`

Request:

```ts
{
  text: string,
  page?: string,
  requestId?: string
}
```

`requestId` is an opaque 1-128 character idempotency key using letters,
numbers, `.`, `_`, `:`, or `-`. Browsers may send the same value through the
`Idempotency-Key` header instead. When both are present they must match.

Success response `200`:

```ts
{
  reply: string,
  eventId: string,
  replyEventId: string,
  duplicate: boolean,
  conversationJobId: string,
  conversationJobStatus: "succeeded"
}
```

`eventId` identifies the immutable user input Event. `replyEventId` identifies the
linked `system/companion_reply` output Event whose `in_reply_to` points back to the
input Event.

The first accepted request persists the input Event and Conversation job in one
transaction. Concurrent requests with the same key share one Companion call.
A completed replay returns the stored reply without another model call or reply
Event. Reusing a key with different input returns `409`. A failed response
returns bounded `eventId` and `conversationJobId` recovery identifiers without
provider errors; replaying the same key creates an audited retry attempt.

```ts
{ error: "idempotency key conflict" } // 409
{
  reply: string,
  error: "processing failed",
  eventId: string,
  conversationJobId: string
} // 500, retryable with the same request key or job retry API
```

### Event Feed APIs

`GET /api/events` returns a privacy-safe Event projection ordered by Event time
descending. Optional query parameters are `source=telegram|system|web`, `type`,
`q`, `since`, `before`, `limit`, and `offset`.

```ts
{
  items: Array<{
    id: string,
    source: "telegram" | "system" | "web",
    type: string,
    timestamp: string,
    createdAt: string,
    preview: string,
    purpose: string | null,
    visibility: string | null
  }>,
  events: EventFeedRecord[],
  limit: number,
  offset: number
}
```

`events` is a compatibility alias of `items`. `GET /api/events/:id` returns
`{ event: EventFeedRecord }`, or `404` when the Event does not exist. Invalid
sources, types, or time ranges return `400`; pagination is normalized to a
non-negative offset and a limit between 1 and 100.

The feed never returns raw `payload` or `metadata`. Telegram `chat_id`,
`user_id`, and `message_id` values are neither exposed nor searchable. Search
is restricted to bounded user-readable `text`, `summary`, and `reason` fields.
An Event with an explicit non-`user` visibility remains classifiable in the
feed, but its preview is empty and its content does not participate in search.

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
    finalizedAt: string | null,
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
Manual generation leaves `finalizedAt` empty. The runtime scheduler finalizes the
previous local date after its configured close time.

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
  conversation_jobs: {
    pending: number,
    running: number,
    succeeded: number,
    failed: number
  },
  memory: {
    topics: number,
    profile: number,
    timelineEvents: number,
    pendingProposals: number
  },
  todos: {
    open: number,
    done: number,
    cancelled: number,
    overdue: number,
    dueToday: number
  },
  projects: {
    active: number,
    paused: number,
    done: number,
    archived: number
  },
  captures: {
    notes: number,
    ideas: number,
    journals: number
  },
  working_state: {
    mode: "S1",
    hasCurrentProject: boolean,
    activeTopicCount: number,
    currentQuestionCount: number
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
provider/mode, Telegram lifecycle, Obsidian availability, Daily Summary
scheduler state, Conversation/Analysis job counts, and pending background task count. The
Daily Summary component exposes only status, target/completed dates, next run
time, failure count, and aggregate persisted run counts. It never includes
configured paths, tokens, prompts, message content, provider output, or raw
errors. Optional component failure changes the overall status to `degraded`
without changing `ready`.

### Capture APIs

Capture is an immutable `note`, `idea`, or `journal` Event. It has no editable
projection and never produces a Companion reply.

`POST /api/captures` accepts Web input:

```ts
// request
{
  type: "note" | "idea" | "journal",
  text: string,
  requestId?: string
}

// response 202 for a new Capture; 200 for an idempotent replay
{
  duplicate: boolean,
  capture: {
    id: string,
    source: "web" | "telegram",
    type: "note" | "idea" | "journal",
    text: string,
    timestamp: string,
    createdAt: string,
    analysis: {
      jobId: string,
      status: "pending" | "running" | "succeeded" | "failed",
      errorCode: string | null
    }
  }
}
```

`Idempotency-Key` may replace `requestId`; when both are supplied they must
match. Reusing a key with changed type or text returns `409`. The source Event
and pending Analysis job commit atomically. Analysis runs without a Conversation
job or `companion_reply`, and successful Memory writes retain the Capture Event
as provenance. Failed jobs use the existing Analysis retry API.

`GET /api/captures` returns `{ items, limit, offset }`. Optional query parameters
are `type=note|idea|journal|all`, `source=web|telegram|all`, `q`, `limit`, and
`offset`. `GET /api/captures/:id` returns one Capture or `404`. These read models
never expose raw Event payload, Telegram chat/user/message identifiers, prompts,
or provider output.

Telegram `/n`/`/note`, `/i`/`/idea`, and `/j`/`/journal` reuse this reply-free
Analysis path. Todo and Project commands do not.

### Working State APIs

`GET /api/working-state` returns the persisted singleton:

```ts
{
  workingState: {
    id: "primary",
    current_project_id: string | null,
    active_topics: string[],
    current_questions: string[],
    mode: "S1",
    state_event_id: string | null,
    state_reason: string,
    updated_at: string
  }
}
```

`POST /api/working-state` applies a partial reason-required update:

```ts
// request; at least one state field is required
{
  currentProjectId?: string | null,
  activeTopics?: string[],
  currentQuestions?: string[],
  mode?: "S1",
  reason: string
}

// response 200
{ eventId: string, workingState: WorkingState }
```

The selected Project must be active or paused. Missing Projects return `404`;
terminal Projects and unchanged values return `409`. S2/S3/S4 are deliberately
disabled and return `400`. Accepted changes append `working_state_updated` and
update the singleton atomically.

Working State enters bounded private Companion and Analysis context with Project
name, topic labels, questions, and S1 mode, never internal ids. It remains
outside Profile, long-term Memory, and `memory_search`.

### Project lifecycle APIs

Project is a user-managed Workspace entity represented inside Persona by an
immutable creation Event plus a mutable runtime projection. It is working
context, not an automatically inferred Memory record.

`POST /api/projects` creates an active Project:

```ts
// request
{ name: string, summary?: string, topics?: string[] }

// response 201
{ eventId: string, project: Project }
```

`GET /api/projects` returns `{ items, limit, offset }` and accepts `status`,
`topic`, `limit`, and `offset`. `GET /api/projects/:id` returns one Project.
Names are case-insensitively unique.

`POST /api/projects/:id/details` changes name, summary, or topics and requires a
human reason. `POST /api/projects/:id/state` accepts `active`, `paused`, `done`,
or `archived` plus a reason. Completing or archiving a Project with open linked
Todos returns `409`; done/archived Projects may only return to `active`.
Accepted changes append `project_details_updated`, `project_paused`,
`project_completed`, `project_archived`, or `project_reactivated` Events in the
same transaction as the projection update.

Completing or archiving the current Working State Project also appends
`working_state_project_cleared` and clears `current_project_id` in that same
transaction. The response then includes `workingStateEventId`; unrelated
Project transitions omit it.

Telegram `/p` and `/project` create Projects through the same idempotent Event
boundary. Runtime startup restores missing projections from valid historical
Project Events before restoring Todo projections. Only active Project names,
summaries, and topic labels enter bounded private Prompt context; ids and
non-active Projects are excluded.

### Todo lifecycle APIs

Todo is a user-managed Workspace entity, not a Memory projection. Creation is
represented by an immutable `todo` Event and a mutable `todos` row. Both writes
commit in one transaction, including Todo commands received from Telegram.

`POST /api/todos` creates a Todo:

```ts
// request
{ title: string, dueDate?: "YYYY-MM-DD" | null, projectId?: string | null }

// response 201
{ eventId: string, todo: Todo }
```

`GET /api/todos` returns `{ items, limit, offset }`. Optional query parameters
are `status=open|done|cancelled|all`, `projectId`, `dueBefore=YYYY-MM-DD`,
`dueAfter=YYYY-MM-DD`, `limit`, and `offset`. `GET /api/todos/:id` returns one
Todo or `404`.

`POST /api/todos/:id/state` applies a reason-required state transition:

```ts
// request
{ status: "open" | "done" | "cancelled", reason: string }

// response 200
{ eventId: string, todo: Todo }
```

Allowed transitions are `open -> done|cancelled` and
`done|cancelled -> open`. Repeating the current state or requesting another
terminal state returns `409`. Every accepted transition appends one of
`todo_completed`, `todo_cancelled`, or `todo_reopened` before updating the
projection in the same transaction.

`POST /api/todos/:id/project` assigns or unassigns a Todo with
`{ projectId: string | null, reason: string }`. Open Todos may belong only to
active or paused Projects. Reopening a Todo inside a done/archived Project and
creating a new open Todo there both return `409`. Linked Todo Prompt context
uses the Project name, never its internal id.

Telegram `/t` and `/todo` commands use the same projection path and remain
idempotent across redelivery. A valid final `@YYYY-MM-DD` token becomes the due
date, for example `/todo submit report @2026-08-01`; invalid date suffixes stay
in the title.

Only open Todos enter the private Companion and Analysis context. The bounded
context contains title and optional due date, never internal ids. Completed and
cancelled Todos are excluded. This contextual use does not make Todo part of
long-term Memory or its search index.

### `GET /api/conversation-jobs`

Returns privacy-safe Companion execution state. Optional query parameters are
`status`, `limit`, and `offset`; status is `pending`, `running`, `succeeded`, or
`failed`.

```ts
{
  items: Array<{
    id: string,
    sourceEventId: string,
    status: "pending" | "running" | "succeeded" | "failed",
    attemptCount: number,
    errorCode: "companion_error" | "reply_error" | "state_error" | "interrupted" | null,
    replyEventId: string | null,
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

### `POST /api/conversation-jobs/:id/retry`

Retries one failed job synchronously and appends a
`conversation_retry_requested` audit Event before the new attempt. Send `{}` as
JSON. Success returns the job, retry Event id, stored reply, input Event id, and
reply Event id. Missing jobs return `404`; non-failed jobs return `409`.

Conversation jobs never store prompts, reply text, provider output, or raw
errors. Reply text remains in the governed `companion_reply` Event. Startup
marks interrupted pending/running jobs failed with the bounded `interrupted`
code so they can be explicitly recovered.

## Automatic Daily Summary

The full Persona runtime automatically closes the previous local date at
`PERSONA_DAILY_SUMMARY_TIME` (default `00:05`) when
`PERSONA_DAILY_SUMMARY_ENABLED` is true. It generates and finalizes the note,
then archives it when an Obsidian vault is configured. A finalized note is not
generated again. If generation succeeded but archive failed, the retry resumes
at archive without another model call. Run state is persisted per local date;
startup recovers interrupted attempts and processes the oldest incomplete date
first. Failures use bounded exponential retry, and graceful shutdown cancels
future timers while draining the active task. Unfinished runs adopt the current
Obsidian archive setting after restart, so disabling the optional integration
can release a previous archive failure.

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
    timelineEvents: number,
    pendingProposals: number
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

### `GET /api/memory/search`

Searches governed Memory projections using exact substring and FTS5/trigram
retrieval. Query params:

```ts
{
  q: string,       // required, 1-500 characters
  limit?: number   // default 10, maximum 50
}
```

Response `200`:

```ts
{
  items: Array<{
    entityType: "profile" | "topic" | "timeline" | "daily_note",
    entityId: string,
    title: string,
    text: string,
    sourceEventId: string | null,
    date: string | null
  }>,
  limit: number
}
```

Only active Profile/Topic rows are returned. Pending/rejected proposals are not
indexed. Missing or oversized queries return `400`.

### `GET /api/memory/proposals`

Lists cooled Profile candidates without promoting them into AI context.

```ts
{
  status?: "pending" | "accepted" | "rejected",
  sourceEventId?: string,
  limit?: number,
  offset?: number
}
```

Response `200`:

```ts
{
  items: MemoryProposalRow[],
  limit: number,
  offset: number
}
```

### `POST /api/memory/proposals/:id/review`

Accepts or rejects one pending proposal exactly once.

```ts
{
  decision: "accept" | "reject",
  reason: string
}
```

Success response `200`:

```ts
{
  eventId: string,
  proposal: MemoryProposalRow,
  profile: ProfileRow | null
}
```

Acceptance returns the written Profile row; rejection returns `profile: null`.
The review Event, proposal transition, and optional Profile upsert commit in one
transaction. Errors are `400` for invalid input, `404` for an unknown proposal,
and `409` after the proposal has already been reviewed.

### `POST /api/memory/profile/corrections`

Governed Profile correction. It records an Event before updating Profile.

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
- Trusted browser preflight allows `Content-Type` and `Idempotency-Key`.
- Unknown routes return `404 { error: "not found" }`.
- POST bodies must be JSON objects with `Content-Type: application/json` and
  may not exceed 64 KiB.
- Telegram redelivery remains acknowledge-only and never sends a second reply;
  Web replay recovery is enabled only when an idempotency key is present.
- Daily Note archive writes are confined to the configured external Obsidian
  vault and reject unmanaged same-name files instead of overwriting them.
- Memory list limits are normalized by the Application layer and capped at 100.
- Memory GET APIs are read-only and must not mutate Events, Profile, Topics,
  Timeline rows, or proposals.
- `POST /api/memory/profile/corrections` and proposal review are governed
  Application write paths and must append an Event.
- `POST /api/memory/profile/state` and `POST /api/memory/topics/state` are
  governed projection-state write paths. They append governance Events before
  changing row state. The Event and projection change commit atomically.
- Pending or rejected proposals never enter Profile or Companion context.
- Search reads only the derived index through Application/Memory APIs. Direct
  FTS access is not a supported interface.

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
`/ready`, `/api/chat` happy/error paths, privacy-safe Event Feed list/detail,
filtering, search and pagination, `/api/status`, read-only
`/api/memory*` routes, Capture reads/writes, Working State and Project/Todo lifecycle routes,
`OPTIONS`, and `404`, then
deletes its smoke rows and closes the server.

Run the focused Todo lifecycle, Telegram projection, prompt-boundary, and
transaction rollback contract with:

```bash
npm.cmd run contract:todos
```

Run the focused Project lifecycle, Todo relationship, Telegram projection,
Prompt-boundary, migration, and rollback contract with:

```bash
npm.cmd run contract:projects
```

Run the focused persisted Working State, Prompt boundary, Project terminal
linkage, and rollback contract with:

```bash
npm.cmd run contract:working-state
```

Run the focused immutable Capture, Telegram/Web idempotency, reply-free Analysis,
Memory provenance, safe read-model, and rollback contract with:

```bash
npm.cmd run contract:captures
```
