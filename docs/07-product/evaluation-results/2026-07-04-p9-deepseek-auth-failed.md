# P9 DeepSeek Evaluation Result: Auth Failed

This record captures a real-mode DeepSeek attempt. It does not prove DeepSeek
quality because the provider rejected the configured API key before a model
reply was produced.

## Run Metadata

- Date: 2026-07-04
- Operator: Codex
- Git commit: `07ef745 docs: record real-mode preflight`
- Evaluation run id: `eval-20260704-deepseek`
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
npm.cmd run cleanup:real-mode -- --tag eval-20260704-deepseek
```

## Result

- Runtime diagnostics showed a DeepSeek bearer token was present, but did not
  validate it with the provider.
- Persona API started and `/health` returned HTTP 200.
- `/api/chat` returned HTTP 500 because DeepSeek rejected the configured key.
- Provider error category: authentication failure.
- The provider error showed a redacted invalid-key suffix ending in `3aa7`.
- `/api/status` still returned HTTP 200 after the failed provider call.
- Cleanup dry-run found:
  - events requiring review: 1
  - profile rows requiring review: 0
  - timeline rows from tagged events: 0
  - possible topics containing tag: 0

## Verdict

- DeepSeek quality: fail, not evaluated because authentication failed.
- Telegram end-to-end: not run.
- Workspace real backend: not run.
- Cleanup: dry-run only.
- Rollback: not run.

Overall P9 verdict:

- NO-GO for product completeness.
- Re-run after replacing the configured `OPENAI_API_KEY` with a valid DeepSeek
  key. Do not commit the key or paste it into docs.

## Follow-Up Tasks

- Replace the local `.env` DeepSeek key with the valid key provided by the user.
- Restart Persona backend with `PERSONA_EVALUATION_RUN_ID=eval-20260704-deepseek-rerun`.
- Re-run the three-message DeepSeek quality checklist.
- Record the new result in a separate dated evaluation note.
