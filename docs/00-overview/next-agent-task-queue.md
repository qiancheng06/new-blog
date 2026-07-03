# Next Agent Task Queue

Use this queue after the monorepo/documentation checkpoint is reviewed. Each task has a bounded write scope so multiple AI agents can work without stepping on each other.

## Current Checkpoint

- Workspace app lives under `apps/workspace/`.
- Persona backend lives under `apps/persona/src/`.
- Active docs entrypoint is `docs/00-overview/README.md`.
- Default local gate is `npm.cmd run verify:local`.
- Full Workspace build may need local permission to read the external Obsidian vault.
- Do not start broad feature work until the large migration is reviewed and committed.

## Queue

| Priority | Owner | Task | Write Scope | Acceptance |
| --- | --- | --- | --- | --- |
| P0 | Governance Agent | Prepare checkpoint review: confirm moved files, root structure, and active docs entrypoints before staging or committing. | `docs/00-overview/**`, `docs/06-governance/**`, `docs/07-product/**` | `npm.cmd run verify:local` passes and `git status --short` has no unexpected root app files. |
| Done | Workspace Agent | Local startup UX: `npm.cmd run dev:mock` now starts/reuses Workspace plus Persona mock API, and `apps/workspace/start-blog.bat` uses the same flow. | `apps/workspace/start-blog.bat`, `apps/workspace/scripts/dev-demo.ts`, `README.md`, `docs/05-infra/**`, `docs/07-product/**` | Frontend loads at `http://127.0.0.1:5173/`; mock API status loads at `http://127.0.0.1:3001/api/status`. |
| P1 | Application Agent | Add a small runtime health contract doc/test for `/health`, `/api/chat`, and `/api/status`. | `apps/persona/src/interface/api/**`, `apps/persona/src/application/**`, `docs/04-application/**` | `npm.cmd run smoke:api` proves the API contract without network calls. |
| P2 | Memory Agent | Define next Memory management surface: read APIs, profile/topic inspection, and safe delete/archive behavior. | `apps/persona/src/domain/memory/**`, `docs/03-memory/**` | No schema change unless documented; `npm.cmd run build:backend` passes. |
| P2 | Persona Agent | Improve prompt evaluation fixtures for Companion tone and memory usage without changing provider adapters. | `apps/persona/src/ai-runtime/**`, `docs/02-persona/**` | Mock mode remains deterministic; `npm.cmd run smoke:api` passes. |
| P3 | Infra Agent | Plan real-mode readiness: `.env` validation, LLM error handling, Telegram startup failure behavior, and local process notes. | `apps/persona/src/infra/**`, `.env.example`, `docs/05-infra/**` | No real network call in default gate; `npm.cmd run verify:local` passes. |

## Coordination Rule

Do not run more than two implementation agents at once until the checkpoint is committed. The current worktree contains a large migration, so review and stabilization come before broad feature work.
