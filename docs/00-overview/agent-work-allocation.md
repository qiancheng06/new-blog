# Agent Work Allocation

本文件用于后续多 AI 并行开发时分配任务。它不是产品路线图，而是工作边界表：谁负责哪一域、能改哪些文件、需要和谁同步。

## 当前基线

- 仓库结构是模块化单体 monorepo。
- Workspace 前台位于 `apps/workspace/`，公开博客位于 `apps/blog/`，Persona 后台位于 `apps/persona/src/`。
- 文档入口位于 `docs/00-overview/README.md`。
- 当前推荐架构仍是模块化单体 + 架构域分层，不拆微服务。

## Agent 分工

| Agent | 负责方向 | 主要读文档 | 主要改动范围 | 禁止事项 |
| --- | --- | --- | --- | --- |
| Workspace Agent | 工作台页面、导航、生成数据适配、VitePress 私人内容站、公开博客 | `docs/01-workspace/`, `docs/00-overview/current-architecture.md` | `apps/workspace/**`, `apps/blog/**`, `docs/01-workspace/**` | 不直接改 Persona 记忆、Prompt、DB schema |
| Persona Agent | Companion、Prompt、认知流程与表达 | `docs/02-persona/`, `docs/04-application/README.md` | `apps/persona/src/ai-runtime/**`, `apps/persona/src/domain/persona/**`, `docs/02-persona/**` | 不直接写 UI 和 DB adapter |
| Memory Agent | Event、Topic、Profile、Timeline、记忆写入、提案与检索 | `docs/03-memory/`, `docs/05-infra/README.md` | `apps/persona/src/domain/event/**`, `apps/persona/src/domain/memory/**`, `apps/persona/src/infra/db/schema.sql`, `docs/03-memory/**` | 不绕过 Event 写入记忆 |
| Application Agent | 对话编排、Capture、项目、待办、工作状态、日历、调度与后台任务 | `docs/04-application/`, `docs/00-overview/domain-map.md` | `apps/persona/src/application/**`, `apps/persona/src/interface/**`, `docs/04-application/**` | 不把领域规则塞进接口层 |
| Infra Agent | 配置、SQLite、LLM Provider、Telegram、Obsidian 写入、本地部署 | `docs/05-infra/`, `docs/06-governance/debug-playbook.md` | `apps/persona/src/infra/**`, `.env.example`, `deploy.md`, `docs/05-infra/**` | 不改变业务流程语义 |
| Governance Agent | 架构不变原则、协作规则、验收标准、调试手册 | `docs/06-governance/`, `docs/07-product/` | `docs/00-overview/**`, `docs/06-governance/**`, `docs/07-product/**`, `README.md` | 不替业务域做实现决策 |

## 推荐推进顺序

1. Workspace Agent 稳定本地入口、同步链路和页面可访问性。
2. Infra Agent 稳定环境变量、DB 路径、部署和启动说明。
3. Application Agent 收敛所有输入到统一事件与持久化任务。
4. Memory Agent 完成可查询、可解释、可回滚的记忆闭环。
5. Persona Agent 在记忆闭环稳定后增强 Prompt 与表达风格。
6. Governance Agent 持续检查文档入口、架构边界和验收标准。

## 合并前检查

- 至少运行与改动域相关的命令。
- 搜索旧路径：`index.html`, `legacy/`, 根目录 `scripts/`, 根目录 `.vitepress/`，确认不是作为当前根路径使用。
- 涉及 DB 时确认当前实现仍是 SQLite，路径仍为仓库根 `data/persona-os.db`。
- 涉及前台时确认 `http://127.0.0.1:5173/` 或对应构建产物可访问。
- 涉及跨域时更新对应两个域的 README 或说明文档。
- 涉及公开博客时确认 `:5175` 的独立构建与读模型同步仍可用。
