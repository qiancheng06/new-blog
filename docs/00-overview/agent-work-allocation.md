# Agent Work Allocation

本文件用于后续多 AI 并行开发时分配任务。它不是产品路线图，而是工作边界表：谁负责哪一域、能改哪些文件、需要和谁同步。

## 当前基线

- 仓库结构已经进入轻 monorepo 预备形态。
- Workspace 前台位于 `apps/workspace/`。
- Persona 后台位于 `apps/persona/src/`。
- 文档入口位于 `docs/00-overview/README.md`。
- 当前推荐架构仍是模块化单体 + 架构域分层，不拆微服务。

## Agent 分工

| Agent | 负责方向 | 主要读文档 | 主要改动范围 | 禁止事项 |
| --- | --- | --- | --- | --- |
| Workspace Agent | 仪表盘、VitePress、Obsidian 同步、本地 HTML 体验 | `docs/01-workspace/`, `docs/05-infra/README.md` | `apps/workspace/**`, `docs/01-workspace/**` | 不直接改 Persona 记忆、Prompt、DB schema |
| Persona Agent | Companion、Researcher、Critic、Archivist、Prompt 与表达 | `docs/02-persona/`, `docs/04-application/README.md` | `apps/persona/src/ai-runtime/**`, `apps/persona/src/domain/persona/**`, `docs/02-persona/**` | 不直接写 UI 和 DB adapter |
| Memory Agent | Event、Topic、Profile、Timeline、记忆写入与遗忘策略 | `docs/03-memory/`, `docs/05-infra/README.md` | `apps/persona/src/domain/event/**`, `apps/persona/src/domain/memory/**`, `apps/persona/src/infra/db/schema.sql`, `docs/03-memory/**` | 不绕过 Event 写入记忆 |
| Application Agent | Conversation flow、事件总线、Workspace 与 Persona 桥接 | `docs/04-application/`, `docs/00-overview/domain-map.md` | `apps/persona/src/application/**`, `apps/persona/src/interface/**`, `docs/04-application/**` | 不把领域规则塞进接口层 |
| Infra Agent | 配置、SQLite、LLM Provider、Telegram、本地部署 | `docs/05-infra/`, `docs/06-governance/debug-playbook.md` | `apps/persona/src/infra/**`, `.env.example`, `deploy.md`, `docs/05-infra/**` | 不改变业务流程语义 |
| Governance Agent | 架构不变原则、协作规则、验收标准、调试手册 | `docs/06-governance/`, `docs/07-product/` | `docs/00-overview/**`, `docs/06-governance/**`, `docs/07-product/**`, `README.md` | 不替业务域做实现决策 |

## 推荐推进顺序

1. Workspace Agent 稳定本地入口、同步链路和页面可访问性。
2. Infra Agent 稳定环境变量、DB 路径、部署和启动说明。
3. Application Agent 收敛所有输入到统一 Conversation Flow。
4. Memory Agent 完成可查询、可解释、可回滚的记忆闭环。
5. Persona Agent 在记忆闭环稳定后增强 Prompt 与表达风格。
6. Governance Agent 持续检查文档入口、架构边界和验收标准。

## 合并前检查

- 至少运行与改动域相关的命令。
- 搜索旧路径：`index.html`, `scripts/`, `.vitepress/`, `src/`, `domains/`，确认不是作为当前根路径使用。
- 涉及 DB 时确认当前实现仍是 SQLite，路径仍为仓库根 `data/persona-os.db`。
- 涉及前台时确认 `http://127.0.0.1:5173/` 或构建产物可访问。
- 涉及跨域时更新对应两个域的 README 或说明文档。
