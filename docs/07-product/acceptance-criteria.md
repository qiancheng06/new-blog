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
- No-network API smoke test for `/api/chat -> Event -> Prompt Builder -> mock reply -> async Memory patch`.
- No-network API contract test for `/health`, `/api/chat`, `/api/events`, `/api/status`, `OPTIONS`, and `404`.
- Persona prompt fixture test for Companion visibility boundaries, private Memory handling, recent-history filtering, and deterministic hidden Analysis output.
- Infra config contract test for no-network real-mode preflight behavior.
- Runtime diagnostics contract test for redacted, no-network real-mode readiness output.
- Real-mode cleanup contract test for tagged evaluation data preview and safe timeline-only cleanup.
- Workspace entrypoint contract test for the served `http://127.0.0.1:5173/` primary UI path and legacy HTML boundaries.
- Workspace sync script; `No changes detected` is an acceptable passing result.
- Repository structure check for required app/docs directories, key moved files, allowed docs top-level domains, and stale root entries.
- Current-doc stale reference scan for old root paths and outdated local URLs.

Use individual commands only for focused diagnosis:

- `npm.cmd run build:backend` for Persona backend type/build failures.
- `npm.cmd run smoke:api` for no-network API and Memory write/read failures.
- `npm.cmd run contract:api` for Application API request/response shape failures.
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
- `npm.cmd run watch` for filesystem watcher behavior; requires a long-running local process and access to watched paths.
- Obsidian vault checks for real vault path existence, OneDrive availability, content completeness, and save-to-sync behavior.
- Browser interaction checks for VitePress pages, Workspace dashboard links, chat panel, and status panel.

When these are not run, record them as residual risk instead of blocking the
default gate.

## Current Stage Done

The current architecture stage is considered done when:

- `docs/00-overview/README.md` remains the AI loading entry.
- Workspace code lives under `apps/workspace/`.
- Persona backend code lives under `apps/persona/src/`.
- SQLite runtime data stays under repository-root `data/`.
- Interface/API layers enter Persona behavior through Application, not direct Memory or Infra calls.
- Memory write/read loop is covered by `smoke:api`.
- LLM provider supports real DeepSeek mode and no-network mock mode.
- Workspace status/chat UI uses Application APIs only.

## Not Yet Product Complete

These remain future product-level gates:

- Real DeepSeek conversation quality evaluation.
- Telegram end-to-end runtime verification.
- Long-running reliability test.
- User-editable Memory/Profile management.
- Daily summary and Obsidian write-back loop.
