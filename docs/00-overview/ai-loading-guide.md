# AI Loading Guide

## 任务 → 加载映射

| 任务类型 | 加载 `docs/` | 加载代码 / 入口 | 禁止加载 |
|----------|-------------|-------------|----------|
| 修改工作台 Dashboard / 日历 / AI 界面 | `01-workspace/` | `apps/workspace/app/`, `apps/workspace/src/features/`, `apps/workspace/src/shared/` | `apps/workspace/scripts/`, `.vitepress/`, 02-persona, 03-memory |
| 修改公开博客界面 | `01-workspace/` | `apps/blog/app/`, `apps/blog/src/` | `apps/workspace/app/`, `apps/workspace/src/`, `apps/workspace/scripts/`, `.vitepress/`, 02-persona, 03-memory |
| 修改同步管道 / 生成读模型 | `01-workspace/`, `05-infra/` | `apps/workspace/scripts/`, `apps/workspace/public/data/` | `apps/workspace/app/`, `apps/workspace/src/`, `apps/blog/`, 02-persona, 03-memory |
| 修改 VitePress 私人内容站 | `01-workspace/` | `apps/workspace/.vitepress/` | `apps/workspace/app/`, `apps/workspace/src/`, `apps/blog/`, 02-persona, 03-memory |
| 修改 Android 客户端 | `04-application/`, `05-infra/deployment-and-clients.md` | `apps/android/` | `apps/workspace/`, `apps/blog/`, `apps/persona/src/`, SQLite schema, Obsidian Vault |
| 修改 CI / 版本 / 发布 / 远端部署 | `05-infra/`, `06-governance/` | `.github/workflows/`, `Dockerfile`, `deploy/`, `package.json` 版本字段, `docs/05-infra/release-management.md` | `apps/workspace/`, `apps/blog/`, `apps/android/`, `apps/persona/src/` 业务实现, SQLite schema, Obsidian Vault |
| 修改 Companion / Prompt | `02-persona/` | `apps/persona/src/ai-runtime/`, `apps/persona/src/domain/persona/` | 01-workspace |
| 修改记忆模型 | `03-memory/`, `05-infra/` | `apps/persona/src/domain/event/`, `apps/persona/src/domain/memory/`, `apps/persona/src/infra/db/` | 01-workspace |
| 修改 Telegram Bot | `04-application/`, `05-infra/` | `apps/persona/src/interface/telegram/`, `apps/persona/src/domain/event/` | 01-workspace |
| 修改 Conversation Flow | `04-application/`, `02-persona/`, `03-memory/` | `apps/persona/src/interface/api/`, `apps/persona/src/interface/telegram/`, `apps/persona/src/ai-runtime/operators/`, `apps/persona/src/application/` | - |
| 修改数据库 / 配置 / LLM Provider | `05-infra/`, `03-memory/` | `apps/persona/src/infra/db/`, `apps/persona/src/infra/config/`, `apps/persona/src/infra/llm/` | 01-workspace |
| 修改日历 / 项目 / 待办 / 工作状态 | `04-application/`, `03-memory/` | `apps/persona/src/application/calendar.ts`, `projects.ts`, `todos.ts`, `working-state.ts` 及对应 domain | 01-workspace |
| 架构决策 | `00-overview/`, `06-governance/` | 全局 | - |
| 查阅术语 | `00-overview/glossary.md` | - | - |

> 当前代码根有三类：Workspace 前台在 `apps/workspace/`，公开博客在 `apps/blog/`，
> Persona OS 后台在 `apps/persona/src/`。根目录旧入口 `index.html` / `detail.html` /
> `calendar.html`、根目录 `scripts/`、根目录 `.vitepress/` 只属于迁移历史或删除记录，
> 不作为当前事实加载。

## 入门必读

任何 AI Agent 首次进入项目时，必须按此顺序加载：

1. `docs/00-overview/README.md`
2. `docs/00-overview/current-architecture.md`
3. `docs/00-overview/glossary.md`
4. `docs/06-governance/architecture-invariants.md`
5. 按任务进入对应架构域 README

## 核心规则

- Project ≠ Topic（见 glossary）
- Knowledge ≠ Memory（见 glossary）
- 改代码前先查 domain-map 确认文件属于哪个域
- 跨域修改需同时加载两个域的 docs/
- 多 AI 并行时只处理自己任务范围内的文件；遇到工作区已有改动，先视为他人工作，不回滚、不顺手重构
- Workspace UI Agent 与 Content Sync Agent 的允许路径以 `agent-work-allocation.md` 为准；读模型字段变化必须通过 `apps/workspace/src/shared/` 协调
- Workspace UI Agent、Blog UI Agent、Content Sync Agent 与 Android Client Agent 是四个独立客户端/内容工作区；跨边界需求必须通过文档化 API 或读模型协调
- `99-archive/` 只作为历史参考，不作为当前实现依据
