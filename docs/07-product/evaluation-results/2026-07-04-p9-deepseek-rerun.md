# P9 DeepSeek Evaluation Result: Rerun

This record captures a real DeepSeek rerun after replacing the local process
environment with the valid user-provided key. The key was not committed and is
not included in this document.

## Run Metadata

- Date: 2026-07-04
- Operator: Codex
- Evaluation run id: `eval-20260704-deepseek-rerun`
- Regression run id: `eval-20260704-deepseek-fix`
- Machine / OS: local Windows workspace
- `.env` mode:
  - `LLM_PROVIDER=deepseek` tested: yes
  - Telegram tested: no
  - Obsidian vault path checked: yes, still empty in diagnostics

## Commands Run

```bash
npm.cmd run diagnose:runtime
npm.cmd run dev:backend
POST http://127.0.0.1:3001/api/chat
GET http://127.0.0.1:3001/api/status
npm.cmd run cleanup:real-mode -- --tag eval-20260704-deepseek-rerun
npm.cmd run cleanup:real-mode -- --tag eval-20260704-deepseek-fix
```

## Result

- Persona API started and `/health` returned HTTP 200.
- DeepSeek authentication succeeded with the valid process-level key.
- `/api/chat` returned HTTP 200 with natural Companion text.
- `/api/status` returned HTTP 200 after the provider calls.
- Hidden analysis, critic, and memory patch content stayed in backend logs, not
  in the user-visible API reply.
- The first rerun exposed a real Memory bug: DeepSeek produced a timeline type
  outside the SQLite constraint (`decision`), causing a Memory write error.
- The Memory domain now normalizes unknown timeline types to `insight` before
  insert. The offline `inspect:memory` contract covers this case.
- A follow-up real regression with `eval-20260704-deepseek-fix` returned HTTP
  200, wrote topic/profile/timeline rows, and produced no stderr error.

## Cleanup Preview

`eval-20260704-deepseek-rerun` dry-run:

- events requiring review: 3
- profile rows requiring review: 3
- timeline rows from tagged events: 2
- possible topics containing tag: 0

`eval-20260704-deepseek-fix` dry-run:

- events requiring review: 1
- profile rows requiring review: 1
- timeline rows from tagged events: 1
- possible topics containing tag: 0

No cleanup `--apply` was run in this pass. Events/Profile/Topics still require
governance review, and timeline-only cleanup should be applied only after manual
confirmation.

## Verdict

- DeepSeek authentication: pass with valid process-level key.
- DeepSeek `/api/chat`: pass.
- Companion reply quality: pass for short real-mode checks.
- Memory write stability: pass after timeline type normalization fix.
- Telegram end-to-end: not run.
- Workspace real backend: not run in browser.
- Cleanup: dry-run only.

Overall P9 verdict:

- Partial GO for DeepSeek provider connectivity and basic reply behavior.
- NO-GO for full product completeness until Telegram, Workspace browser
  real-backend behavior, cleanup apply/review, Obsidian scope, and long-running
  reliability are evaluated.
