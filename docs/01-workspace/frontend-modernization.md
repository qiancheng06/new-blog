# Workspace Frontend Modernization

This note records the current frontend direction after the first Next.js
Workspace migration slice landed.

## Current Direction

- `apps/workspace/` is the primary Next.js Workspace app.
- `npm.cmd run dev` serves the Workspace app at `http://127.0.0.1:5173/`.
- `apps/blog/` is the standalone public Next.js blog app.
- `npm.cmd run dev:blog` serves the blog at `http://127.0.0.1:5175/`.
- VitePress remains as the long-term Obsidian/Markdown content site.
- `npm.cmd run dev:content` serves the content site at `http://127.0.0.1:5174/`.
- The public blog is served by the separate Blog app at `http://127.0.0.1:5175/` and is excluded from both Workspace and VitePress.
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

- Knowledge, project, and todo content enters Workspace through VitePress or generated JSON.
- Blog content enters the standalone Blog app through generated `apps/workspace/public/data/blog-posts.json` and `apps/workspace/public/data/blog/*.md`.
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
- `apps/workspace/public/data/blog-posts.json`
- `apps/workspace/public/data/blog/*.md`

## Current Next.js Coverage

- Projects: read-only Next.js project dashboard from synced JSON.
- Todos: read-only Next.js todo flow from synced JSON.
- Calendar: read-only Next.js month view from synced todo JSON.
- Knowledge: read-only content-site index and VitePress entrypoint.
- Memory/Profile: governed Application API read/correction/state controls.
- Companion Chat: Application API chat dock.
- Daily Note: date selection, generation/refresh, highlights, topics, and recent
  summaries through `/api/daily-summaries`.

Persona API GET requests use `cache: "no-store"` so Memory and runtime panels
reflect writes immediately. The TypeScript data adapters under
`apps/workspace/src/shared/data/` are tracked source files; only generated JSON
under `apps/workspace/public/data/` is ignored.

Do not remove VitePress or legacy HTML until replacement feature coverage is
verified.

## Second Phase Usability Work

The second frontend phase keeps the first migration architecture intact and
focuses on real daily workflow quality:

- Shared panel chrome lives in `apps/workspace/src/shared/ui/Panel.tsx`.
- Shared loading, empty, and error states live in
  `apps/workspace/src/shared/ui/StateBlock.tsx`.
- Projects, Todos, Calendar, and Knowledge all show explicit skeleton, empty,
  and data-load failure states.
- Mobile rules keep nav, calendar cells, content actions, and the chat dock
  usable on narrow screens.
- `npm.cmd run check:workspace` now checks that the Next.js entrypoint,
  legacy assets, shared data adapters, shared UI states, and Application API
  boundaries remain present.

Frontend React components must continue to import external data only through
`apps/workspace/src/shared/`.

## Plane-Inspired Workspace Shell

The primary Next.js Workspace now uses a compact operational shell inspired by
Plane's information density while keeping Persona's identity and application
boundaries intact:

- Desktop uses a persistent workspace rail and a central workflow column;
  tablet collapses the rail and mobile exposes it as a drawer-style section.
- Projects, Todos, Calendar, Knowledge, Memory, and Companion Chat remain
  available from the primary page and keep their existing data contracts.
- Persona wallpaper is retained as a compact context strip rather than the
  primary page structure.
- Appearance preferences are local UI state only. Theme, accent hue, wallpaper
  dimming, and motion settings remain stored in browser local storage.
- User-provided visual assets are loaded from
  `public/assets/persona/wallpaper-desktop.webp`,
  `public/assets/persona/wallpaper-mobile.webp`, and
  `public/assets/persona/avatar.webp`; neutral CSS colors remain as fallbacks.
- VitePress, legacy HTML, Obsidian sync, and Persona Application APIs are not
  replaced by the visual shell. Plane is a visual reference only, not a runtime
  dependency.
