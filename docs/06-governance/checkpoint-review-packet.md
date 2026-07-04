# P8 Checkpoint Review Packet

Date: 2026-07-03

## Scope

This packet reviews the current modular monorepo baseline after the Workspace +
Persona OS merge cleanup. It decides whether the architecture stabilization
phase is ready for the next stage of work.

This is not a product-complete review. It does not claim that real DeepSeek,
Telegram, Obsidian write-back, or long-running runtime behavior has been fully
validated.

## Source Documents Reviewed

- `docs/00-overview/next-agent-task-queue.md`
- `docs/00-overview/current-architecture.md`
- `docs/06-governance/architecture-invariants.md`
- `docs/07-product/acceptance-criteria.md`
- `docs/07-product/real-mode-evaluation.md`
- `README.md`
- `package.json`
- Recent git commit history through `435c05d feat: add real-mode cleanup workflow`

## Completed Checkpoints

- Documentation and architecture-domain workspace were reorganized for
  multi-agent collaboration.
- Root layout was moved toward a lightweight monorepo:
  `apps/workspace/` for Workspace and `apps/persona/src/` for Persona backend.
- Workspace local demo flow was added with `npm.cmd run dev:mock`.
- Application API contract covers `/health`, `/api/chat`, `/api/events`,
  `/api/status`, `OPTIONS`, and `404`.
- Memory inspection has a read-only surface and a documented delete/archive
  boundary.
- Persona prompt fixture covers Companion visibility, private Memory, recent
  history filtering, and deterministic hidden Analysis output.
- Infra readiness checks cover `.env`, DeepSeek preflight behavior, Telegram
  startup boundaries, and redacted runtime diagnostics.
- Workspace entrypoint is now the served app at `http://127.0.0.1:5173/`;
  legacy standalone HTML assets are not the primary browser entrypoint.
- Real-mode evaluation has a permissioned checklist for DeepSeek, Telegram,
  Workspace real-backend checks, rollback, and evidence capture.
- Real-mode cleanup supports `evaluationRunId` labels, dry-run review, and
  timeline-only automatic cleanup for source-linked timeline rows.

## Architecture Baseline

- Recommended architecture remains a modular monolith with architecture-domain
  boundaries, not microservices.
- Workspace UI lives under `apps/workspace/`.
- Persona backend lives under `apps/persona/src/`.
- Runtime SQLite data stays under repository-root `data/`.
- Browser entry is a Node-served app:
  - development: `npm.cmd run dev`
  - mock demo: `npm.cmd run dev:mock`
  - URL: `http://127.0.0.1:5173/`
- `apps/workspace/index.html` must not exist as an app entrypoint. The Workspace
  root is served by the Node/VitePress dev server, and legacy standalone HTML
  lives only under `apps/workspace/legacy/`.
- AI onboarding starts from `docs/00-overview/README.md`.

## Default Gate Coverage

The default local gate is:

```bash
npm.cmd run verify:local
```

It covers:

- Persona backend TypeScript build.
- No-network API smoke test.
- No-network Application API contract.
- Persona prompt fixture.
- Infra config contract.
- Runtime diagnostics contract.
- Real-mode cleanup contract.
- Workspace entrypoint contract.
- Workspace sync.
- Repository structure check.
- Current-doc stale reference scan.

## Out Of Scope For Default Gate

The default gate does not prove:

- Real DeepSeek conversation quality.
- Telegram end-to-end behavior.
- Browser interaction quality.
- Long-running runtime stability.
- External Obsidian vault availability or watcher behavior.
- Full VitePress build with a real local vault.
- Real port availability and long-lived process reuse.
- Product completeness.

These items require permissioned local checks and human review.

## Remaining Product Gaps

- Real DeepSeek conversation quality has not been human-evaluated.
- Telegram end-to-end runtime has not been verified.
- Daily Summary to Obsidian write-back is not complete.
- Memory analysis is not yet fully written back into Topic, Profile, and
  Timeline as a closed product loop.
- Context Builder is still mostly recent-event based.
- Event Bus is still an architecture direction, not an independent runtime
  module.
- User-editable Memory/Profile management is missing.
- Long-running reliability testing is missing.

## Risks

- Some existing Chinese Markdown renders as mojibake in the current PowerShell
  output. Future doc changes should be checked in an editor or terminal that
  reads UTF-8 correctly.
- Full Workspace build can depend on user-local Obsidian/OneDrive state and
  should not be treated as a sandbox-invariant AI gate.
- Cleanup is intentionally conservative: Profile and Topic cleanup remain
  review-only because blind deletes could remove non-test user state.

## Go / No-Go Recommendation

GO for architecture stabilization baseline.

The repository is ready for the next controlled stage of multi-agent work after
this packet is committed and `npm.cmd run verify:local` passes.

NO-GO for product completeness.

Do not claim the MVP is complete until real-mode DeepSeek quality, Telegram
runtime, Workspace real-backend behavior, Memory/Profile management, Daily
Summary write-back, and reliability gates have been completed or explicitly
descoped.

## Required Evidence Before Commit

Run and record:

```bash
npm.cmd run verify:local
git status --short
```

## Follow-Up Queue Updates

- Mark P8 as Done once this packet is committed and the default gate passes.
- Add a P9 runtime/product checkpoint for human-run real-mode evaluation.
- Keep broad feature work behind the current architecture invariants and
  default gate.
