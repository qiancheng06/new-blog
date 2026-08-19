# Workspace Design

This document describes the current Workspace frontend architecture. Older
VitePress-only and standalone HTML notes are historical context and should not
override this document.

## Current Shape

Workspace is now a modern Node.js-managed frontend with a Next.js primary app
and a VitePress content site.

```text
User
  |
  v
Next.js Workspace app (:5173)
  |
  +-- generated JSON adapters
  |     |
  |     +-- Obsidian/project/todo Markdown via sync-projects.js
  |
  +-- Persona Application API client
        |
        +-- Persona backend (:3001)
              |
        +-- SQLite memory database
        +-- LLM provider adapters

Standalone Next.js Blog (:5175)
  |
  +-- generated blog manifest and Markdown copy
        |
        +-- Obsidian blog/*.md via sync-projects.js
```

The key rule is separation of sources:

- Obsidian remains the long-term content source.
- SQLite remains the long-term memory source.
- Workspace UI reads both through middle-layer adapters, not directly.

## Directory Map

```text
apps/workspace/
  app/                         Next.js app router shell
  src/features/
    calendar/                  calendar module
    chat/                      companion chat dock
    knowledge/                 knowledge/content overview
    memory/                    memory profile and state controls
    projects/                  project board
    status/                    backend/status strip
    todos/                     todo stream
  src/shared/
    api/personaApi.ts          Persona Application API client
    data/workspaceData.ts      generated JSON loader/fallbacks
    data/workspaceSources.ts   source URLs and source availability
  public/data/                 generated JSON, ignored by git
  scripts/
    sync-projects.js           Markdown/content sync pipeline
    watch.js                   local watch helper
  .vitepress/                  VitePress content site config/theme
  legacy/                      old standalone HTML assets
apps/blog/
  app/                         standalone public blog routes
  src/                         blog data adapter and site chrome
```

## Runtime Entrypoints

| Entrypoint | Command | Role |
| --- | --- | --- |
| `http://127.0.0.1:5173/` | `npm.cmd run dev` | Primary Workspace app |
| `http://127.0.0.1:5175/` | `npm.cmd run dev:blog` | Standalone public Blog app |
| `http://127.0.0.1:5174/` | `npm.cmd run dev:content` | VitePress content site |
| `http://127.0.0.1:3001/` | `npm.cmd run dev:backend` or `npm.cmd run dev:backend:mock` | Persona API |
| `apps/workspace/legacy/*.html` | none | Historical fallback/reference only |

## Data Flow

### Projects, Todos, Knowledge

```text
apps/workspace/projects/*.md
Obsidian vault todo/*.md
Obsidian vault knowledge/**
  |
  v
apps/workspace/scripts/sync-projects.js
  |
  +-- apps/workspace/public/data/projects.json
  +-- apps/workspace/public/data/todos.json
  +-- apps/workspace/public/data/knowledge.json
  |
  v
Next.js modules through workspaceData.ts
```

Generated JSON is local runtime data and is ignored by git. The UI must keep
useful fallback states when the source folders or generated files are absent.

### Memory And Chat

```text
Next.js MemoryPanel / ChatDock
  |
  v
apps/workspace/src/shared/api/personaApi.ts
  |
  v
Persona Application API (:3001)
  |
  v
Application / Memory / Persona domains
```

Workspace can display memory state, request user-facing corrections, and send
chat messages. It does not own the memory schema, retrieval, ranking, forgetting,
or persona expression logic.

## Feature Boundaries

| Module | Owns | Does Not Own |
| --- | --- | --- |
| Projects | board, progress summaries, source links | project persistence rules beyond Markdown sync |
| Todos | todo stream, date grouping, source links | task semantics outside Markdown/source adapters |
| Calendar | month view over synced todo data | calendar service or notifications |
| Knowledge | content index and VitePress handoff | Obsidian vault structure changes |
| Memory | state display and user controls | memory storage, ranking, merge, forget policy |
| Chat | user input and chat dock UX | LLM calls, persona reasoning, conversation orchestration |

## Design Principles

1. Keep the first screen useful: show actual workspace modules, not a marketing
   landing page.
2. Prefer feature modules under `src/features/` and shared source/API adapters
   under `src/shared/`.
3. Keep Obsidian content and Persona memory independent. They meet in the UI
   through Application/API boundaries.
4. Keep legacy HTML available until equivalent Next.js coverage is verified.
5. Treat VitePress as the content site, not the primary Workspace shell.
6. Make missing local sources visible and recoverable instead of failing blank.

## Verification

Use these checks after Workspace changes:

```bash
npm.cmd run build
npm.cmd run check:workspace
```

When the change touches sync scripts or generated JSON:

```bash
npm.cmd run sync
```

For full local acceptance:

```bash
npm.cmd run verify:local
```
