# Infra

Infra covers external dependencies, runtime environment, and adapters.

## Responsibilities

- Database connection and schema initialization.
- LLM provider adapters.
- Telegram API adapters.
- Obsidian filesystem paths and sync runtime.
- Configuration, deployment, logging, and health checks.
- Runtime signals that back Application health/status APIs.

## Out of Scope

- Business rules.
- Memory semantics.
- Companion expression strategy.
- Workspace content model changes.
- Prompt or business context assembly inside LLM providers.
- Workspace observability panel UI or metric interpretation.

## Event Read Boundary

SQLite stores complete immutable Events for internal processing and audit, but
Infra rows are not an HTTP contract. Application exposes an allowlisted Event
Feed projection that omits raw payload, metadata, and Telegram chat/user/message
identifiers. Feed search only considers bounded user-readable text, summary, or
reason fields; private identifiers are neither returned nor searchable. Events
with explicit non-user visibility have no public preview or searchable content.
Conversation History follows the same rule while joining input/reply Events to
durable Conversation jobs; it exposes only bounded visible text, timestamps,
job status, and bounded error codes.

## LLM Boundary

`apps/persona/src/infra/llm/deepseek.ts` is a provider adapter. It should only translate already-built messages into DeepSeek API requests, send them, and parse provider responses.

Prompt and context assembly belongs to the AI runtime prompt layer, currently `apps/persona/src/ai-runtime/prompts/prompt-builder.ts`. The provider must not add domain labels such as recent conversation, memory context, user intent, or analysis instructions.

The DeepSeek adapter parses Analysis responses as JSON and validates the full
runtime shape before returning it to AI Runtime. Validation failures report only
schema paths; provider output and user content are not included in errors.

Set `LLM_PROVIDER=mock` for no-network smoke tests. The mock provider returns a deterministic Companion reply and Memory patch while preserving the same `callCompanion` / `callAnalysis` interface used by the real DeepSeek provider.

Daily Summary date boundaries use `PERSONA_TIME_ZONE`, an IANA time zone that
defaults to `Asia/Shanghai`. The provider receives only the bounded context for
the selected local date. Mock mode returns a deterministic Daily Note without a
network call.

`PERSONA_DAILY_SUMMARY_ENABLED` defaults to `true` and
`PERSONA_DAILY_SUMMARY_TIME` defaults to `00:05`. The full Persona runtime uses
that local time to finalize the previous date. Set the enabled flag to `false`
when a process should expose only manual Daily Summary APIs.

## Local Backend Entrypoints

- `npm run dev:backend` starts the real local Persona runtime on port 3001, including API and Telegram bot wiring.
- `npm run dev:backend:mock` starts the same API surface on `http://127.0.0.1:3001` with `LLM_PROVIDER=mock` and Telegram disabled. Use this for local Workspace demos when the chat panel and status panel should work without calling a real model.
- `npm run dev:mock` starts or reuses both local demo services: Workspace at `http://127.0.0.1:5173/` and Persona mock API at `http://127.0.0.1:3001`.
- `apps/workspace/start-blog.bat` is a Windows convenience launcher for the same mock demo flow. It waits for both the Workspace dev server and Persona mock API before opening the dashboard.
- If port 3001 is already occupied by an old backend process, stop that process or window before restarting `dev:backend` / `dev:backend:mock`. A stale backend can also show up as `http://127.0.0.1:3001/api/status` returning 404.

## Real-Mode Readiness

Run the no-network infra contract before changing real-mode startup behavior:

```bash
npm.cmd run check:infra
```

Run the human-facing runtime diagnostic before starting real mode:

```bash
npm.cmd run diagnose:runtime
```

It prints redacted readiness status for provider config, Telegram config, local
SQLite presence, schema presence, and Obsidian vault path shape. It does not
call DeepSeek, call Telegram, start long-running services, import the DB pool,
or initialize the database.

Real DeepSeek mode uses `LLM_PROVIDER=deepseek` and requires `OPENAI_API_KEY`.
The variable name is kept for compatibility, but the current adapter sends it as
the bearer token to `https://api.deepseek.com/v1/chat/completions`.

`TELEGRAM_TOKEN` is optional. When it is empty, Persona starts the API and skips
Telegram. When Telegram startup is enabled, empty or placeholder tokens fail
preflight before the bot starts. Runtime Telegram polling errors are logged with
`[telegram startup error]` or `[telegram bot error]` and should not be treated as
Workspace API contract changes.

When Telegram is enabled, `TELEGRAM_ALLOWED_CHAT_IDS` must contain one or more
trusted numeric chat IDs separated by commas. Updates from every other chat are
discarded before an Event is created. The allowlist is fail-closed: an empty
list never means public access.

Authorized Telegram messages use a deterministic Event id derived from
`chat_id + message_id`. Polling redelivery therefore remains idempotent across
process restarts. Duplicate deliveries are acknowledged without another model
call or Telegram reply; conflicting content for an existing identity is logged
through the normal handler error path.

The Persona API binds to `API_HOST=127.0.0.1` by default. Browser access is
limited to `PERSONA_ALLOWED_ORIGINS`; the default list contains the local
Workspace development origins on ports 5173 and 5174. A non-loopback host must
be an explicit deployment choice behind upstream authentication.

`SIGINT`, `SIGTERM`, and programmatic `runtime.stop()` use the same graceful
shutdown path. Persona stops accepting API and Telegram input, then waits up to
25 seconds for tracked Analysis/Memory background work to settle. `/health` is
the stable process liveness probe; `/ready` checks the SQLite schema and LLM
configuration; `/api/status` adds optional component degradation and operational
counters. These endpoints expose only bounded states and counts. Task inputs,
configured paths, private content, provider output, secrets, and raw errors are
never included.

Telegram and Obsidian are optional. A failed Telegram polling lifecycle, an
unavailable configured vault, failed automatic Daily Summary run, or failed
Persona Snapshot run, or failed Conversation/Analysis jobs marks `/api/status`
as `degraded` while `/ready` remains successful. Database or LLM configuration
failure makes `/ready` return `503`.

Automatic Daily Summary generation is tracked as graceful-shutdown background
work. It is single-flight per date and marks a Daily Note finalized only after a
successful full-day generation. If Obsidian archiving then fails, retries resume
from the archive stage without another model call. The `daily_summary_runs`
state machine survives restarts, recovers interrupted attempts, and processes
the oldest incomplete date first. Retry delays grow from 15 minutes to a maximum
of 6 hours. Runtime status exposes only dates, counts, and bounded states; it
never includes raw errors or note content. Unfinished runs adopt the current
archive setting at startup, so disabling Obsidian releases an archive-only
failure.

Automatic Persona Snapshot export uses `PERSONA_OBSIDIAN_SNAPSHOT_ENABLED` and
`PERSONA_OBSIDIAN_SNAPSHOT_TIME` (default `00:15` in `PERSONA_TIME_ZONE`). When
the enabled flag is omitted, a configured Vault enables the scheduler and an
empty Vault keeps it disabled. An explicit `true` requires
`OBSIDIAN_VAULT_PATH`. `persona_snapshot_runs` persists one idempotent state
machine per local schedule date, recovers interrupted attempts, retries the
oldest incomplete date with the same 15-minute-to-6-hour bounded backoff, and
stores only status, dates, attempt count, bounded error code, and successful
audit Event id. The scheduler is tracked during graceful shutdown. Manual
Snapshot exports remain independent and do not satisfy or mutate schedule rows.

Conversation execution state also survives restarts. Input Event creation and
job creation commit together. Companion reply Event creation and the job's
`succeeded` transition also commit together. Startup converts pending/running
jobs to failed `interrupted` state; Web idempotency replay or the audited retry
API can start a new attempt. Job rows expose only bounded status, counts, error
codes, and Event ids. They never persist prompts, replies, provider output, raw
errors, or browser idempotency keys.

Todo capture uses the same durable Event boundary. A Web or Telegram `todo`
Event and its `todos` projection commit together, while completion, cancellation,
and reopening append audit Events and update the projection atomically. Telegram
redelivery reuses the source Event and projection. Runtime startup idempotently
restores missing projections for valid historical `todo` Events and reports only
aggregate restored/skipped counts. `/api/status` exposes only
aggregate Todo counts; prompt context exposes only bounded open titles and due
dates, never Todo ids or terminal items.

Note, Idea, and Journal captures use immutable Events without a separate mutable
table. Web idempotency keys use a namespace distinct from chat requests. Event
insertion and pending Analysis job creation are atomic; the no-reply Analysis
attempt then uses the existing ordered Memory commit and recovery machinery.
Capture list/detail APIs expose text and bounded job state, never raw payload,
Telegram chat/user/message identifiers, provider output, or errors.

Project capture follows the same Event/projection pattern. Runtime startup
backfills valid historical Project Events before Todo backfill so relationships
can be restored safely. Project lifecycle and detail changes are atomic with
their audit Events. `/api/status` exposes aggregate lifecycle counts; private
Prompt context includes only bounded active names, summaries, and topic labels.
Project and Todo remain outside the FTS Memory index.

Working State is a single SQLite projection for current Project, active topic
labels, unresolved questions, and the stable S1 mode. Reason-required API
updates append an audit Event and update the singleton atomically. Project
completion/archive clears a matching current Project in the same Project
transaction. `/api/status` exposes only mode, relationship presence, and
aggregate topic/question counts; Prompt context contains no internal ids.
Working State remains outside Profile and the FTS Memory index.

Analysis job state survives process restarts. On startup, jobs left pending or
running are marked failed with the bounded `interrupted` code and can be retried
through the audited Application API. Health/status expose aggregate job counts;
neither diagnostics nor job APIs include prompts, messages, provider responses,
or raw errors. Analysis completion logs expose counts only, not model content.

Analysis Profile updates marked `cooling_required` are stored in
`memory_proposals`, not discarded or copied into active Profile. Runtime status
exposes only the pending proposal count. Proposal review is a synchronous local
transaction: acceptance writes an audit Event, Profile value, and terminal
proposal state together; rejection writes the audit Event and terminal state
without changing Profile.

Memory retrieval uses SQLite FTS5 with the trigram tokenizer. `memory_search` is
a rebuildable projection over Profile, Topics, Timeline, and Daily Notes. Schema
triggers synchronize writes and `initializeDb()` reconstructs the index on each
runtime start, including upgrades from databases created before search existed.
Database readiness requires the virtual table. Prompt retrieval falls back to
recent Memory when an index query fails, while `/api/memory/search` remains an
explicit diagnostic surface.

Default AI gates must not call real DeepSeek or Telegram services. Use
`LLM_PROVIDER=mock` for local demos and tests that should be deterministic and
offline.

For human-run real network verification, use
[`../07-product/real-mode-evaluation.md`](../07-product/real-mode-evaluation.md).
It covers DeepSeek quality, Telegram end-to-end behavior, Workspace real-backend
checks, rollback, and evidence capture.

After human real-mode tests, use `npm.cmd run cleanup:real-mode -- --tag <id>`
to preview tagged evaluation data. Add `--apply` only after review; automatic
cleanup deletes source-linked timeline rows only and reports Events/Profile/Topics
for manual governance review.

## Obsidian Vault Path

Workspace sync and VitePress read the external Obsidian vault from `OBSIDIAN_VAULT_PATH`.

Set it in the repository root `.env`:

```text
OBSIDIAN_VAULT_PATH=C:\Users\33831\OneDrive\obsidian\obsidian
```

The current fallback keeps the original local path for this machine, but new machines and AI workers should treat `.env` / `.env.example` as the source of truth. The vault remains outside the repo and must not be committed.

Persona archives generated Daily Notes below `PERSONA_DAILY_NOTE_DIR`, which
defaults to `persona/daily-notes`. The value must be a relative directory and
may not contain `.` or `..` segments. Both the vault and the final canonical
directory must remain outside the repository and inside the configured vault;
symbolic-link or junction escapes are rejected.

Persona Snapshot uses `PERSONA_OBSIDIAN_SNAPSHOT_DIR`, defaulting to
`persona/snapshots`, and writes the deterministic `Persona OS.md`. It shares the
same canonical path checks and atomic writer as Daily Note export.

Each archive uses the deterministic filename `YYYY-MM-DD.md` and an atomic
temporary-file rename. Persona owns only the block between
`<!-- PERSONA:DAILY_NOTE -->` and `<!-- /PERSONA:DAILY_NOTE -->`. Persona
Snapshot similarly owns only `<!-- PERSONA:SNAPSHOT -->` through
`<!-- /PERSONA:SNAPSHOT -->`. Later exports replace the matching unique block
and preserve user-authored Markdown around it. An
existing same-name file without exactly one valid managed block is treated as a
conflict and is not changed.

## Related Code

- `apps/persona/src/infra/db/pool.ts`
- `apps/persona/src/infra/db/schema.sql`
- `apps/persona/src/infra/config/index.ts`
- `apps/persona/src/infra/llm/deepseek.ts`
- `apps/persona/src/interface/telegram/bot.ts`
- `apps/workspace/scripts/sync-projects.js`
- `apps/workspace/scripts/watch.js`
- `apps/workspace/.vitepress/config.ts`
- `docs/05-infra/deployment.md`

## AI Change Checklist

- Current backend storage is SQLite, not PostgreSQL.
- `OPENAI_API_KEY` is currently used for DeepSeek API calls.
- `npm.cmd run check:infra` must stay no-network; it validates config shape and real-mode preflight behavior only.
- `npm.cmd run diagnose:runtime` must stay no-network and must not print raw secrets or private data.
- Real DeepSeek and Telegram checks belong in `docs/07-product/real-mode-evaluation.md`, not the default AI gate.
- Local Obsidian paths must be configured through `OBSIDIAN_VAULT_PATH`; do not add new hard-coded user paths to Workspace scripts or VitePress config.
- Do not add new infrastructure dependencies unless the task explicitly requires them.
- LLM provider or model parameter changes must be synchronized with Persona runtime behavior.
- Health, logging, and runtime counters exposed to Workspace must go through Application read APIs; do not let Workspace read `data/`, `.env`, provider logs, or database files directly.
