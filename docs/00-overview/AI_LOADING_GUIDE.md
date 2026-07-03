# AI Loading Guide

## 任务 → 加载映射

| 任务类型 | 加载 `docs/` | 加载代码 / 入口 | 禁止加载 |
|----------|-------------|-------------|----------|
| 修改 Dashboard / Calendar | `01-workspace/` | `apps/workspace/.vitepress/`, `apps/workspace/legacy/`, `apps/workspace/scripts/` | 02-persona, 03-memory |
| 修改同步管道 | `01-workspace/`, `05-infra/` | `apps/workspace/scripts/sync-projects.js`, `apps/workspace/scripts/watch.js` | 02-persona, 03-memory |
| 修改 Companion / Prompt | `02-persona/` | `apps/persona/src/ai-runtime/`, `apps/persona/src/domain/persona/` | 01-workspace |
| 修改记忆模型 | `03-memory/`, `05-infra/` | `apps/persona/src/domain/event/`, `apps/persona/src/domain/memory/`, `apps/persona/src/infra/db/` | 01-workspace |
| 修改 Telegram Bot | `04-application/`, `05-infra/` | `apps/persona/src/interface/telegram/`, `apps/persona/src/domain/event/` | 01-workspace |
| 修改 Conversation Flow | `04-application/`, `02-persona/`, `03-memory/` | `apps/persona/src/interface/api/`, `apps/persona/src/interface/telegram/`, `apps/persona/src/ai-runtime/operators/`, `apps/persona/src/application/` | - |
| 修改数据库 / 配置 / LLM Provider | `05-infra/`, `03-memory/` | `apps/persona/src/infra/db/`, `apps/persona/src/infra/config/`, `apps/persona/src/infra/llm/` | 01-workspace |
| 架构决策 | `00-overview/`, `06-governance/` | 全局 | - |
| 查阅术语 | `00-overview/glossary.md` | - | - |

> 当前代码根只有两类：Workspace 前台在 `apps/workspace/`，Persona OS 后台在 `apps/persona/src/`。根目录旧入口 `index.html` / `detail.html` / `calendar.html`、根目录 `scripts/`、根目录 `.vitepress/` 只属于迁移历史或删除记录，不作为当前事实加载。

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
- `99-archive/` 只作为历史参考，不作为当前实现依据
