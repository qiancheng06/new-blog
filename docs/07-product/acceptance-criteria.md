# Acceptance Criteria

This file records the current engineering acceptance gates for the modular
monorepo stage. It is not the final product success metric; it is the checklist
that proves the current Workspace + Persona OS baseline is safe for multi-agent
development.

## Default Local Gate

Before handing off or merging ordinary code/document changes, run:

```bash
npm.cmd run verify:local
```

This gate must pass without calling real LLM or Telegram services. It covers:

- Persona backend TypeScript build.
- Fresh SQLite schema contract that executes `schema.sql` in an empty temporary
  database and verifies task-specific error-code, proposal-state, and confidence
  constraints.
- No-network API smoke test for `/api/chat -> Event -> Prompt Builder -> mock reply -> async Memory patch`.
- No-network API contract test for `/health`, `/ready`, `/api/chat`, `/api/events`, `/api/status`, `OPTIONS`, and `404`.
- No-network Telegram contract test for command text-to-Event mapping, command
  no-reply boundaries, and real-mode evaluation metadata labeling.
- No-network Todo lifecycle contract for Web and Telegram capture, deterministic
  redelivery, due-date validation, audited state transitions, prompt visibility,
  and source Event/projection transaction rollback.
- No-network Project lifecycle contract for creation/detail/state audits,
  Project-Todo integrity, Telegram redelivery, private Prompt visibility,
  historical backfill, and transaction rollback.
- No-network runtime burst contract test for repeated mock `/api/chat` requests,
  health/status availability, and async Memory patch completion.
- No-network Persona runtime startup contract test for the formal runtime
  entrypoint, liveness/readiness, pending-work observability, and graceful
  `stop()` draining behavior.
- No-network automatic Daily Summary contract for per-date single-flight,
  finalization, archive-stage recovery, retry state, timezone scheduling, and
  graceful scheduler stop.
- No-network Conversation job contract for Web idempotent replay, concurrent
  single-flight, audited manual retry, stored reply reuse, and startup recovery.
- No-network real-mode docs contract test for required P16 checklist/template
  sections, evidence boundaries, and secret-safety statements.
- Persona prompt fixture test for Companion visibility boundaries, private Memory handling, recent-history filtering, and deterministic hidden Analysis output.
- Infra config contract test for no-network real-mode preflight behavior.
- API loopback/CORS and Telegram trusted-chat boundaries are fail-closed by
  default and covered by no-network contracts.
- JSON write routes reject unsupported media types, non-object JSON, and bodies
  larger than 64 KiB before creating Events or changing Memory.
- Analysis JSON is runtime-validated before use; each Memory patch and each
  governance Event/projection change is atomic and covered by rollback tests.
- `cooling_required` Profile updates persist as reviewable proposals and remain
  outside active Profile/Companion context until an audited acceptance; review
  rollback and one-time decisions are covered by no-network contracts.
- Query-aware Memory retrieval covers Profile, Topic, Timeline, and Daily Note
  projections; Chinese trigram/short-query behavior, source-driven index rebuild,
  state filtering, proposal isolation, and Prompt ordering have a no-network
  contract.
- Runtime diagnostics contract test for redacted, no-network real-mode readiness output.
- Real-mode cleanup contract test for tagged evaluation data preview and safe timeline-only cleanup.
- Workspace entrypoint contract test for the served `http://127.0.0.1:5173/` primary UI path and legacy HTML boundaries.
- Workspace sync script; `No changes detected` is an acceptable passing result.
- Repository structure check for required app/docs directories, key moved files, allowed docs top-level domains, and stale root entries.
- Current-doc stale reference scan for old root paths and outdated local URLs.

Use individual commands only for focused diagnosis:

- `npm.cmd run build:backend` for Persona backend type/build failures.
- `npm.cmd run contract:db-schema` for fresh-install schema and constraint failures.
- `npm.cmd run smoke:api` for no-network API and Memory write/read failures.
- `npm.cmd run contract:api` for Application API request/response shape failures.
- `npm.cmd run contract:memory-search` for FTS synchronization, query-aware
  Prompt retrieval, Chinese matching, state filtering, and proposal isolation.
- `npm.cmd run contract:conversation-jobs` for Companion execution recovery,
  Web idempotency, and retry audit failures.
- `npm.cmd run contract:telegram` for Telegram command mapping, no-reply boundary,
  and evaluation run labeling failures.
- `npm.cmd run contract:todos` for Todo projection, lifecycle, private prompt
  context, Telegram idempotency, and atomic rollback failures.
- `npm.cmd run contract:projects` for Project lifecycle, Todo relationship,
  migration, private Prompt context, and atomic rollback failures.
- `npm.cmd run contract:runtime-burst` for repeated mock API request loops,
  health/status regressions, and async Memory patch timing failures.
- `npm.cmd run contract:runtime-startup` for formal Persona runtime entrypoint
  startup, health readiness, and shutdown regressions.
- `npm.cmd run contract:daily-summary-scheduler` for automatic previous-day
  finalization, idempotency, archive recovery, and schedule regressions.
- `npm.cmd run contract:real-mode-docs` for real-mode checklist/template drift
  that could hide a P16 gate or weaken evidence boundaries.
- `npm.cmd run fixture:persona` for Persona prompt boundary and mock Analysis fixture failures.
- `npm.cmd run check:infra` for `.env`, provider, API port, and real-mode preflight failures.
- `npm.cmd run contract:runtime` for runtime diagnostics redaction and no-network contract failures.
- `npm.cmd run contract:cleanup` for real-mode evaluation cleanup safety failures.
- `npm.cmd run cleanup:real-mode -- --tag <evaluation-run-id>` for human dry-run cleanup review after real-mode evaluation.
- `npm.cmd run diagnose:runtime` for a human-readable local readiness report before real-mode evaluation.
- `npm.cmd run check:workspace` for Workspace entrypoint and legacy standalone HTML boundary failures.
- `npm.cmd run sync` for Workspace data parsing and embedding failures.

## Full Local Gate

Run this when Workspace/VitePress rendering, Obsidian content, or deployment
output changes:

```bash
npm.cmd run build
```

This may require local filesystem access to the external Obsidian vault. It is
not part of the default AI gate because sandboxed agents may not have that
permission.

Do not treat external vault availability as a repository-level invariant. The
vault may live in OneDrive or another user-local path, so a missing vault is a
local environment risk unless the task specifically changes sync behavior.

## Runtime Demo Gate

For a local demo without real model calls:

```bash
npm.cmd run dev:mock
```

Expected result:

- VitePress routes under `http://127.0.0.1:5173/` load.
- Workspace chat panel connects to `http://127.0.0.1:3001/api/chat`.
- Workspace Persona OS status panel reads `http://127.0.0.1:3001/api/status`.
- Messages produce a mock Companion reply and a Memory patch.

Focused diagnosis can still run `npm.cmd run dev` and `npm.cmd run dev:backend:mock` in separate terminals.

These runtime checks require local ports, a browser, and a long-running process.
They are acceptance evidence for interactive changes, but they are not part of
the default handoff gate.

## Permissioned Local Gates

Run these only when the task explicitly needs the user's machine state:

- `npm.cmd run dev:backend` for real Telegram/LLM wiring; requires `.env`, network access, and available local ports.
- `npm.cmd run dev:backend` should fail fast when `LLM_PROVIDER=deepseek` lacks a real `OPENAI_API_KEY`, or when Telegram startup is enabled with an empty/placeholder token.
- Use [real-mode-evaluation.md](real-mode-evaluation.md) for the human-run DeepSeek quality, Telegram end-to-end, Workspace real-backend, and rollback checklist.
- Record the result with [real-mode-evaluation-result-template.md](real-mode-evaluation-result-template.md), redacting secrets and private chat content.
- `npm.cmd run watch` for filesystem watcher behavior; requires a long-running local process and access to watched paths.
- Obsidian vault checks for real vault path existence, OneDrive availability, content completeness, and save-to-sync behavior.
- Browser interaction checks for VitePress pages, Workspace dashboard links, chat panel, and status panel.

When these are not run, record them as residual risk instead of blocking the
default gate.

`contract:runtime-burst` is a no-network preflight for runtime reliability. It
does not replace a long-running real-mode soak test because it uses the mock LLM
provider, a short local request burst, and no Telegram polling.

## Current Stage Done

The current architecture stage is considered done when:

- The P8 checkpoint review exists at `docs/06-governance/checkpoint-review-packet.md`.
- `docs/00-overview/README.md` remains the AI loading entry.
- Workspace code lives under `apps/workspace/`.
- Persona backend code lives under `apps/persona/src/`.
- SQLite runtime data stays under repository-root `data/`.
- Interface/API layers enter Persona behavior through Application, not direct Memory or Infra calls.
- Memory write/read loop is covered by `smoke:api`.
- LLM provider supports real DeepSeek mode and no-network mock mode.
- Workspace status/chat UI uses Application APIs only.
- Workspace Memory/Profile panel reads Application memory APIs only and does not
  use legacy HTML or direct SQLite access.

## Not Yet Product Complete

These remain future product-level gates:

- Real DeepSeek conversation quality evaluation.
- Telegram end-to-end runtime verification.
- Long-running reliability test.
- Workspace proposal-review/search UI and future semantic embedding ranking.
