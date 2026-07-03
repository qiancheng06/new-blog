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

## LLM Boundary

`apps/persona/src/infra/llm/deepseek.ts` is a provider adapter. It should only translate already-built messages into DeepSeek API requests, send them, and parse provider responses.

Prompt and context assembly belongs to the AI runtime prompt layer, currently `apps/persona/src/ai-runtime/prompts/prompt-builder.ts`. The provider must not add domain labels such as recent conversation, memory context, user intent, or analysis instructions.

Set `LLM_PROVIDER=mock` for no-network smoke tests. The mock provider returns a deterministic Companion reply and Memory patch while preserving the same `callCompanion` / `callAnalysis` interface used by the real DeepSeek provider.

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
