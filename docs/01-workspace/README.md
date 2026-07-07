# Workspace

Workspace is the user-facing workbench domain. It owns visible interaction,
content browsing, dashboards, and the frontend bridge into Persona OS.

## Current Status

- Primary app: Next.js under `apps/workspace/`.
- Primary URL: `http://127.0.0.1:5173/` via `npm.cmd run dev`.
- Content site: VitePress/Obsidian on `http://127.0.0.1:5174/` via
  `npm.cmd run dev:content`.
- Legacy HTML under `apps/workspace/legacy/` is migration reference only.
- Projects, Todos, Calendar, Knowledge, Memory, and Chat now have Next.js
  modules.

## Responsibilities

- Workspace shell, navigation, layout, and user interaction.
- Dashboard modules for projects, todos, calendar, knowledge, memory state, and
  companion chat.
- Frontend adapters for generated Workspace JSON and Persona Application APIs.
- Obsidian/Markdown content presentation through the content site.
- Clear source/fallback affordances when generated data or Persona API is not
  available.

## Out Of Scope

- Do not implement reasoning, persona behavior, or memory ranking here.
- Do not read the SQLite database directly from Workspace UI code.
- Do not read the Obsidian vault directly from React components.
- Do not call LLM providers directly from the frontend.
- Do not bypass the Application API for chat or memory state.

## Common Documents

- [frontend-modernization.md](frontend-modernization.md)
- [design.md](design.md)
- [dashboard-spec.md](dashboard-spec.md)
- [obsidian-vault-spec.md](obsidian-vault-spec.md)
- [sync-spec.md](sync-spec.md)
- [../00-overview/domain-map.md](../00-overview/domain-map.md)

## Related Code

- `apps/workspace/app/`
- `apps/workspace/src/features/`
- `apps/workspace/src/shared/api/personaApi.ts`
- `apps/workspace/src/shared/data/workspaceData.ts`
- `apps/workspace/src/shared/data/workspaceSources.ts`
- `apps/workspace/scripts/sync-projects.js`
- `apps/workspace/.vitepress/`
- `apps/workspace/legacy/`

## Modify Checklist

- Confirm whether the change belongs to Workspace or should be routed to
  Application, Memory, Persona, or Infra.
- Keep React UI code behind `apps/workspace/src/shared/` adapters for external
  data.
- Keep Obsidian and SQLite as separate long-term sources behind the middle
  layer.
- Preserve source/fallback behavior when local generated JSON is missing.
- Verify with `npm.cmd run build` and `npm.cmd run check:workspace` when
  frontend behavior changes.

## Cross-Domain Rules

- Chat and memory actions go through the Application API on port `3001`.
- Memory schema, ranking, forgetting, and profile state belong to
  `03-memory/`.
- Persona expression, prompts, and operator behavior belong to `02-persona/`.
- DB path, provider configuration, deployment, and local environment concerns
  belong to `05-infra/`.
- Product scope and acceptance criteria belong to `07-product/`.
