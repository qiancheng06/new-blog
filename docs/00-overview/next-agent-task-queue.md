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
| Done | Application Agent | API contract doc/test for `/health`, `/api/chat`, `/api/events`, `/api/status`, `OPTIONS`, and `404`. | `apps/persona/src/interface/api/**`, `apps/persona/src/application/**`, `docs/04-application/**` | `npm.cmd run contract:api` and `npm.cmd run verify:local` prove the API contract without network calls. |
| Done | Memory Agent | Read-only Memory inspection surface: stats, list APIs, source integrity counts, and safe delete/archive boundary documented as Later. | `apps/persona/src/domain/memory/**`, `docs/03-memory/**` | No schema change; `npm.cmd run inspect:memory` and `npm.cmd run verify:local` pass. |
| Done | Persona Agent | Prompt fixture now covers Companion visibility boundaries, private Memory usage, recent-history filtering, and deterministic hidden Analysis output without changing provider adapters. | `apps/persona/src/ai-runtime/**`, `docs/02-persona/**` | `npm.cmd run fixture:persona` and `npm.cmd run verify:local` pass. |
| Done | Infra Agent | Real-mode readiness guardrails: `.env` validation, DeepSeek preflight/error boundaries, Telegram startup failure logging, and local process notes. | `apps/persona/src/infra/**`, `apps/persona/src/main/**`, `apps/persona/src/interface/telegram/**`, `.env.example`, `docs/05-infra/**` | No real network call in default gate; `npm.cmd run check:infra` and `npm.cmd run verify:local` pass. |
| Done | Workspace Agent | Workspace entrypoint modernized: served app is the only primary UI path, standalone HTML moved under `apps/workspace/legacy/`, and a no-network entry contract guards the boundary. | `apps/workspace/**`, `docs/01-workspace/**`, `README.md` | `npm.cmd run check:workspace` and `npm.cmd run verify:local` pass; `http://127.0.0.1:5173/` remains the documented browser entrypoint. |
| Done | Product/Runtime Agent | Permissioned real-mode evaluation defined for DeepSeek quality, Telegram end-to-end behavior, Workspace real-backend checks, rollback, and evidence capture without adding real network calls to the default AI gate. | `docs/02-persona/**`, `docs/05-infra/**`, `docs/07-product/**` | `docs/07-product/real-mode-evaluation.md` exists and `npm.cmd run verify:local` still passes offline. |
| Done | Runtime Agent | Added human-triggered runtime diagnostics for redacted real-mode readiness without leaking secrets, calling providers, starting services, or initializing the DB. | `apps/persona/src/infra/**`, `docs/05-infra/**`, `docs/07-product/**` | `npm.cmd run diagnose:runtime`, `npm.cmd run contract:runtime`, and `npm.cmd run verify:local` pass. |
| Done | Memory/Governance Agent | Real-mode evaluation data can be labeled, inspected, and safely cleaned up with timeline-only automatic cleanup plus review lists for Events/Profile/Topics. | `apps/persona/src/domain/memory/**`, `apps/persona/src/domain/event/**`, `apps/persona/src/interface/**`, `docs/03-memory/**`, `docs/07-product/**` | `evaluationRunId` / `PERSONA_EVALUATION_RUN_ID` labels Events; `npm.cmd run cleanup:real-mode -- --tag <id>` previews; `--apply` deletes only source-linked timeline rows; `npm.cmd run contract:cleanup` and `npm.cmd run verify:local` pass. |
| Done | Governance Agent | Produced a checkpoint review packet for the current modular monorepo baseline and decided whether the architecture stabilization phase can advance. | `docs/00-overview/**`, `docs/06-governance/**`, `docs/07-product/**` | `docs/06-governance/checkpoint-review-packet.md` records completed checkpoints, remaining product gaps, verification commands, and GO for architecture stabilization / NO-GO for product completeness. |
| P9 | Product/Runtime Agent | Execute the human-run real-mode evaluation and record the result packet for DeepSeek, Telegram, Workspace real-backend behavior, rollback, and cleanup evidence. | `docs/07-product/**`, `docs/05-infra/**`, `docs/03-memory/**` | `npm.cmd run diagnose:runtime` is reviewed, `docs/07-product/real-mode-evaluation.md` is followed, `docs/07-product/real-mode-evaluation-result-template.md` is filled into a dated result note, cleanup dry-run output is recorded, and any real-mode failures become bounded follow-up tasks. |

## Coordination Rule

Do not run more than two implementation agents at once until the checkpoint is committed. The current worktree contains a large migration, so review and stabilization come before broad feature work.
