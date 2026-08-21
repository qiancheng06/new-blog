# Persona Workspace

Personal workspace plus Persona OS backend.

The project is currently a light monorepo:

- `apps/workspace/`: primary Workspace frontend.
- `apps/blog/`: standalone public blog frontend.
- `apps/persona/src/`: Persona OS backend and application runtime.
- `docs/`: architecture-domain workspaces for AI collaboration.
- `data/`: local runtime data, including SQLite.
- `dist/`: backend build output.

## Quick Start

```bash
npm install
npm run dev
```

Open the primary Workspace app:

```text
http://127.0.0.1:5173/
```

For the local mock Persona API:

```bash
npm run dev:backend:mock
```

For the real Persona backend:

```bash
npm run dev:backend
```

For the public blog:

```bash
npm run dev:blog
```

The real backend reads local environment variables such as `OPENAI_API_KEY`,
`LLM_PROVIDER`, `PERSONA_ANALYSIS_*`, and `TELEGRAM_TOKEN`.

For phones or another computer on the same LAN/VPN, configure
`NEXT_PUBLIC_PERSONA_API_BASE`, `API_HOST`, and `PERSONA_ALLOWED_ORIGINS`, then
use `npm run dev:lan` and `npm run dev:blog:lan`. Do not expose port `3001` to
the public internet without an authentication layer.

## Entrypoints

| Entrypoint | Command | Purpose |
| --- | --- | --- |
| `http://127.0.0.1:5173/` | `npm.cmd run dev` | Primary Next.js Workspace app |
| `http://127.0.0.1:5175/` | `npm.cmd run dev:blog` | Standalone public Next.js blog, synced from `vault/blog/*.md` |
| `http://127.0.0.1:5174/` | `npm.cmd run dev:content` | VitePress/Obsidian content site |
| `http://127.0.0.1:3001/` | `npm.cmd run dev:backend` or `npm.cmd run dev:backend:mock` | Persona Application API |
| `apps/workspace/legacy/*.html` | none | Legacy reference assets only |

Do not open `apps/workspace/index.html` as the app entrypoint. The current
browser workflow is served by the Node.js dev server on port `5173`.

## Verification

```bash
npm run verify:local
npm run verify:ci
```

Useful focused checks:

```bash
npm.cmd run build
npm.cmd run build:backend
npm.cmd run sync
npm.cmd run check:workspace
```

## Architecture

The recommended architecture is a modular monolith organized by architecture
domains, not microservices.

Workspace and Blog have multiple long-term sources:

- Obsidian vault: knowledge, blog, project Markdown, and todo Markdown.
- Persona SQLite database: Events, Profile, Topics, Timeline, Calendar, Daily Notes, and durable background jobs.

The frontend must not read those sources directly. It should go through the
middle layer:

- Obsidian knowledge/project/todo content enters the Workspace through VitePress or generated JSON.
- Blog Markdown enters the standalone Next.js Blog `:5175` through generated `public/data/blog*` files.
- Persona memory and Calendar enter every client through Application APIs; clients never open SQLite directly.
- Shared frontend adapters live under `apps/workspace/src/shared/`.

## Project Structure

```text
apps/
  workspace/
    app/                 Next.js app router shell
    src/features/        Workspace feature modules
    src/shared/          frontend API/data adapters
    public/data/         generated JSON and blog Markdown, ignored by git
    .vitepress/          VitePress content-site config and theme
    legacy/              old standalone HTML assets, not primary entrypoint
    scripts/             sync and watch scripts
  blog/
    app/                 standalone public blog app (:5175)
    src/                 blog data adapter and site chrome
  persona/
    src/                 Persona OS backend source
docs/
  00-overview/           current architecture and AI loading guide
  01-workspace/          Workspace frontend and sync domain
  02-persona/            persona operators and prompts
  03-memory/             memory model and policy
  04-application/        orchestration, event bus, API bridge
  05-infra/              DB, LLM, Telegram, deployment, config
  06-governance/         invariants, coding rules, debug playbooks
  07-product/            vision, scope, acceptance criteria
  99-archive/            historical reference only
```

## Docs Loading Order

AI agents and new collaborators should start here:

1. [docs/00-overview/README.md](docs/00-overview/README.md)
2. [docs/00-overview/current-architecture.md](docs/00-overview/current-architecture.md)
3. [docs/00-overview/deployment-and-client-architecture.md](docs/00-overview/deployment-and-client-architecture.md)
4. [docs/00-overview/glossary.md](docs/00-overview/glossary.md)
5. [docs/06-governance/architecture-invariants.md](docs/06-governance/architecture-invariants.md)
6. [docs/01-workspace/frontend-modernization.md](docs/01-workspace/frontend-modernization.md)

## Current Stack

Workspace:

- Next.js + React for the primary app.
- Next.js + React for the standalone public blog on port `5175`.
- VitePress + Vue for the Obsidian/Markdown content site.
- Node.js sync scripts for generated frontend JSON.

Persona OS:

- Node.js + TypeScript.
- SQLite through `better-sqlite3`.
- Local Application API on port `3001`.
- DeepSeek/OpenAI-compatible LLM provider configuration.
- Telegram integration when `TELEGRAM_TOKEN` is configured.
