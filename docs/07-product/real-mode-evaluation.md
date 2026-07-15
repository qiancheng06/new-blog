# Real-Mode Evaluation

This is a human-run checklist for real DeepSeek and Telegram verification. It is
not part of the default AI gate and must not be automated into `verify:local`.

## Scope

Use this checklist when validating the real local Persona runtime:

- DeepSeek provider quality and failure behavior.
- Telegram polling startup and end-to-end message handling.
- Workspace chat behavior against the real backend.
- Rollback to the no-network mock demo.

Do not run this checklist with placeholder credentials.

## Preconditions

1. Ensure the working tree is clean or intentionally staged.
2. Back up `data/persona-os.db` if the current local memory state matters.
3. Confirm `.env` contains:

```text
LLM_PROVIDER=deepseek
OPENAI_API_KEY=<real DeepSeek bearer token>
API_PORT=3001
API_HOST=127.0.0.1
TELEGRAM_TOKEN=<real bot token, or empty to skip Telegram>
TELEGRAM_ALLOWED_CHAT_IDS=<trusted numeric chat id, or empty when Telegram is skipped>
PERSONA_ALLOWED_ORIGINS=http://127.0.0.1:5173
OBSIDIAN_VAULT_PATH=<local vault path>
```

4. Run the offline gate first:

```bash
npm.cmd run verify:local
```

The offline gate includes `npm.cmd run contract:telegram`, which proves the
local Telegram text-to-Event mapping, command no-reply boundary, and evaluation
run metadata labeling without calling Telegram.

5. Run the no-network runtime diagnostic:

```bash
npm.cmd run diagnose:runtime
```

This diagnostic only checks local readiness and redacts secrets. Passing it does
not prove that DeepSeek or Telegram is reachable.

Record whether Obsidian is included or explicitly descoped for the run. If it is
included, `OBSIDIAN_VAULT_PATH` should resolve to an existing path outside this
repository. A missing path or a path inside the repository is a warning that must
be recorded in the result note before running real-mode checks.

6. Stop stale processes on ports `3001` and `5173`.

## DeepSeek Quality Check

Start the real backend:

```bash
npm.cmd run dev:backend
```

In another terminal, send three Workspace-style messages:

```bash
curl -X POST http://127.0.0.1:3001/api/chat -H "Content-Type: application/json" -d "{\"text\":\"我今天有点累，但还想继续整理项目。\"}"
curl -X POST http://127.0.0.1:3001/api/chat -H "Content-Type: application/json" -d "{\"text\":\"帮我判断下一步应该先做 Workspace 还是 Persona。\"}"
curl -X POST http://127.0.0.1:3001/api/chat -H "Content-Type: application/json" -d "{\"text\":\"记住：我希望项目先保持模块化单体，不拆微服务。\"}"
```

Pass criteria:

- `/api/chat` returns HTTP 200 with a natural `reply`.
- Companion reply is warm, concise, and not JSON.
- Reply does not expose `critic`, `research`, `archivist`, `memory_patch`, raw Memory context, confidence, or retrieval details.
- Backend logs show `[analysis]`, `[critic]`, and `[memory]` only as internal logs.
- `/api/status` still returns HTTP 200 after all messages.
- Memory writes are plausible and do not store a transient emotion as a permanent profile fact.

Fail criteria:

- DeepSeek returns authentication, quota, timeout, or malformed JSON errors.
- The user-visible reply contains hidden analysis fields.
- The server crashes or stops answering `/health`.
- Memory patch writes obviously unsafe or overconfident long-term facts.

## Telegram End-To-End Check

Only run this section when `TELEGRAM_TOKEN` is set to a real bot token and
`TELEGRAM_ALLOWED_CHAT_IDS` contains the test chat. Unknown chats must not
create Events, trigger LLM calls, or receive replies.

Start:

```bash
npm.cmd run dev:backend
```

From Telegram, send:

- `/start`
- `/stats`
- `/n 这是一个真实模式 note 验收`
- `/t 明天检查 Workspace 入口 @2026-07-04`
- `我在 Telegram 里测试真实 Persona 回复。`

Pass criteria:

- `/start` replies with `Persona OS is online.` and a chat id.
- `/stats` replies with an event count.
- `/n`, `/t`, `/i`, `/j` commands are stored as events and do not trigger a Companion reply.
- A normal text message triggers exactly one Companion reply.
- Backend logs include chat id, user id, event type, event id, and Companion preview.
- Command errors and bot polling errors are logged without crashing the API.

Fail criteria:

- `telegram bot started` appears before polling is actually available.
- Command messages trigger unwanted Companion replies.
- A handler error is swallowed without logs.
- API `/health` fails while Telegram is running.

## Workspace Real Backend Check

Start the full local real flow manually:

```bash
npm.cmd run dev
npm.cmd run dev:backend
```

Open:

```text
http://127.0.0.1:5173/
```

Pass criteria:

- Workspace pages load through the dev server.
- Chat/status panels use `http://127.0.0.1:3001`.
- Sending a message produces one natural Companion reply.
- Status panel updates without reading `.env`, `data/`, provider logs, or SQLite files directly.

## Rollback

If real mode fails, stop the real backend and return to deterministic local demo:

```bash
npm.cmd run dev:mock
```

Expected rollback:

- Workspace remains available at `http://127.0.0.1:5173/`.
- Persona mock API returns `http://127.0.0.1:3001/api/status`.
- Chat replies are prefixed with `[mock companion]`.

## Evidence To Record

Record these in a dated result note using
[`real-mode-evaluation-result-template.md`](real-mode-evaluation-result-template.md):

- Date and operator.
- Git commit being evaluated.
- Whether real DeepSeek was tested.
- Whether Telegram was tested.
- Commands run.
- Pass/fail summary.
- Any provider errors, token/quota issues, or rollback actions.

Never paste real API keys, bot tokens, or private chat content into docs,
commits, or issue comments.

## Evaluation Run Labels

Before a real-mode evaluation, choose a unique ASCII run id:

```text
eval-20260703-real-mode
```

Workspace/API checks should pass it as `evaluationRunId`:

```bash
curl -X POST http://127.0.0.1:3001/api/chat -H "Content-Type: application/json" -d "{\"text\":\"eval-20260703-real-mode real backend check\",\"evaluationRunId\":\"eval-20260703-real-mode\"}"
```

Telegram checks should start the backend with:

```bash
$env:PERSONA_EVALUATION_RUN_ID="eval-20260703-real-mode"
npm.cmd run dev:backend
```

This label is stored in Event metadata. The cleanup tool also searches payloads
for the same tag to support older manual test messages.

## Cleanup After Evaluation

Always preview first:

```bash
npm.cmd run cleanup:real-mode -- --tag eval-20260703-real-mode
```

Apply only after reviewing the preview:

```bash
npm.cmd run cleanup:real-mode -- --tag eval-20260703-real-mode --apply
```

The cleanup command only auto-deletes `timeline_events` rows whose
`source_event_id` points to tagged Events. It does not auto-delete Events,
Profile, or Topics:

- Events are immutable facts and require governance/admin review.
- Profile rows are upserts and may have overwritten earlier long-term facts.
- Topics currently have no `source_event_id`, so they can only be reported for
  manual review.
