# Workspace Frontend Modernization

This note records the current frontend direction after the Next.js migration
started.

## Current Direction

- `apps/workspace/` is becoming the primary Next.js Workspace app.
- `npm.cmd run dev` serves the Workspace app at `http://127.0.0.1:5173/`.
- VitePress remains as the long-term Obsidian/Markdown content site.
- `npm.cmd run dev:content` serves the content site at `http://127.0.0.1:5174/`.
- Legacy standalone HTML under `apps/workspace/legacy/` is reference material
  and migration fallback, not the primary entrypoint.

## Multi-Source Boundary

Workspace has multiple long-term data sources:

- Obsidian vault: content source for knowledge, blog, project Markdown, and todo
  Markdown.
- Persona SQLite database: memory source for Events, Profile, Topics, and
  Timeline.

The frontend must not read either source directly. UI code must go through a
middle layer:

- Obsidian content enters Workspace through VitePress or generated JSON.
- Persona memory enters Workspace through Application APIs on
  `http://127.0.0.1:3001`.
- Shared frontend adapters live under `apps/workspace/src/shared/`.

## First Migration Slice

- Next.js shell: `apps/workspace/app/`.
- Feature modules: `apps/workspace/src/features/`.
- Persona API client: `apps/workspace/src/shared/api/personaApi.ts`.
- Data-source boundary: `apps/workspace/src/shared/data/workspaceSources.ts`.
- Workspace JSON adapters: `apps/workspace/src/shared/data/workspaceData.ts`.
- Synced frontend JSON:
  - `apps/workspace/public/data/projects.json`
  - `apps/workspace/public/data/todos.json`
  - `apps/workspace/public/data/knowledge.json`

## Current Next.js Coverage

- Projects: read-only Next.js project dashboard from synced JSON.
- Todos: read-only Next.js todo flow from synced JSON.
- Calendar: read-only Next.js month view from synced todo JSON.
- Knowledge: read-only content-site index and VitePress entrypoint.
- Memory/Profile: governed Application API read/correction/state controls.
- Companion Chat: Application API chat dock.

Do not remove VitePress or legacy HTML until replacement feature coverage is
verified.
