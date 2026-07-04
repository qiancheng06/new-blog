# Real-Mode Evaluation Result Template

Copy this template into a dated result note when a human operator runs
`docs/07-product/real-mode-evaluation.md`.

Do not commit secrets, raw API keys, Telegram bot tokens, private chat content,
or full provider responses. Keep evidence short, redacted, and reproducible.

## Run Metadata

- Date:
- Operator:
- Git commit:
- Evaluation run id:
- Machine / OS:
- `.env` mode:
  - `LLM_PROVIDER=deepseek` tested: yes/no
  - Telegram tested: yes/no
  - Obsidian vault path checked: yes/no

## Preflight

Commands run:

```bash
npm.cmd run verify:local
npm.cmd run diagnose:runtime
```

Result:

- `verify:local`: pass/fail
- `diagnose:runtime`: pass/fail
- Redacted readiness notes:
- Ports `3001` / `5173` clear before start: yes/no
- `data/persona-os.db` backed up if needed: yes/no/not needed

## DeepSeek Quality Check

Backend command:

```bash
npm.cmd run dev:backend
```

Messages tested:

- Message 1 purpose:
- Message 2 purpose:
- Message 3 purpose:

Result:

- `/api/chat` returned HTTP 200: yes/no
- Reply was natural Companion text, not JSON: yes/no
- Hidden `critic` / `analysis` / `memory_patch` fields stayed internal: yes/no
- `/api/status` remained HTTP 200: yes/no
- Memory writes were plausible and not overconfident: yes/no
- Provider errors, if any, redacted:

DeepSeek verdict: pass/fail/not run

## Telegram End-To-End Check

Only fill this section when `TELEGRAM_TOKEN` is real and Telegram was tested.

Backend command:

```bash
$env:PERSONA_EVALUATION_RUN_ID="<evaluation-run-id>"
npm.cmd run dev:backend
```

Result:

- `/start` replied with online status and chat id: yes/no
- `/stats` replied with an event count: yes/no
- `/n`, `/t`, `/i`, `/j` stored events without Companion replies: yes/no
- Normal text triggered exactly one Companion reply: yes/no
- Logs included chat id, user id, event type, event id, and preview: yes/no
- Handler or polling errors were logged without API crash: yes/no
- API `/health` stayed healthy: yes/no

Telegram verdict: pass/fail/not run

## Workspace Real Backend Check

Commands:

```bash
npm.cmd run dev
npm.cmd run dev:backend
```

Browser URL:

```text
http://127.0.0.1:5173/
```

Result:

- Workspace loaded through dev server: yes/no
- No direct file-open HTML path used: yes/no
- Chat/status panels used `http://127.0.0.1:3001`: yes/no
- Sending a message produced one natural Companion reply: yes/no
- Workspace avoided direct reads from `.env`, `data/`, provider logs, or SQLite:
  yes/no

Workspace verdict: pass/fail/not run

## Cleanup

Preview command:

```bash
npm.cmd run cleanup:real-mode -- --tag <evaluation-run-id>
```

Optional apply command:

```bash
npm.cmd run cleanup:real-mode -- --tag <evaluation-run-id> --apply
```

Result:

- Cleanup preview reviewed: yes/no
- Timeline-only apply used: yes/no/not needed
- Events requiring governance/admin review:
- Profile rows requiring manual review:
- Topics requiring manual review:
- Cleanup verdict: pass/fail/not run

## Rollback

Rollback command:

```bash
npm.cmd run dev:mock
```

Result:

- Workspace available at `http://127.0.0.1:5173/`: yes/no
- Mock API status available at `http://127.0.0.1:3001/api/status`: yes/no
- Chat replies prefixed with `[mock companion]`: yes/no

Rollback verdict: pass/fail/not run

## Final Verdict

- DeepSeek quality: pass/fail/not run
- Telegram end-to-end: pass/fail/not run
- Workspace real backend: pass/fail/not run
- Cleanup: pass/fail/not run
- Rollback: pass/fail/not run

Overall P9 verdict:

- GO to next product implementation:
- NO-GO reason, if any:

## Follow-Up Tasks

Convert every failure into a bounded task with owner, write scope, and
acceptance criteria before assigning implementation agents.
