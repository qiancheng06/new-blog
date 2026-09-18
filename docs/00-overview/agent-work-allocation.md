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
| Workspace UI Agent | 工作台页面、导航、AI 控制台、日历、知识库和工具页 | `docs/01-workspace/`, `docs/00-overview/current-architecture.md` | `apps/workspace/app/**`, `apps/workspace/src/**`, `docs/01-workspace/**` | 不修改 `apps/blog/**`、`apps/workspace/scripts/**`、VitePress 配置、Persona 后端、记忆、Prompt、DB schema |
| Blog UI Agent | 独立公开博客的列表、文章、标签、阅读皮肤和博客交互 | `docs/01-workspace/`, `docs/00-overview/current-architecture.md` | `apps/blog/app/**`, `apps/blog/src/**` | 不修改 `apps/workspace/app/**`、`apps/workspace/src/**`、`apps/workspace/scripts/**`、VitePress 配置、Persona 后端、记忆、Prompt、DB schema |
| Content Sync Agent | Obsidian/项目 Markdown 同步、Workspace 读模型、VitePress 私人内容站和博客内容生成 | `docs/01-workspace/`, `docs/05-infra/`, `docs/00-overview/current-architecture.md` | `apps/workspace/scripts/**`, `apps/workspace/.vitepress/**`, `apps/workspace/public/data/**`, `docs/01-workspace/**` | 不修改 `apps/workspace/app/**`、`apps/workspace/src/**`、`apps/blog/**`、Persona 后端、记忆、Prompt、DB schema |
| Android Client Agent | Android 原生客户端、配对、日历、AI 对话、速记、本地缓存、同步和提醒 | `docs/04-application/mobile-api-v1.md`, `docs/05-infra/deployment-and-clients.md` | `apps/android/**` | 不修改 `apps/workspace/**`、`apps/blog/**`、`apps/persona/src/**`、SQLite schema、Obsidian 同步和 Web UI |
| Release/Operations Agent | CI、版本号、Git tag、镜像标签、远端部署、回滚、发布记录和运行健康检查 | `docs/05-infra/`, `docs/05-infra/release-management.md`, `docs/06-governance/` | `.github/workflows/**`, `Dockerfile`, `deploy/**`, `deploy.md`, `package.json` 的版本字段, `docs/05-infra/**` | 不修改 `apps/workspace/**`、`apps/blog/**`、`apps/android/**`、`apps/persona/src/**` 业务实现、数据库 schema 或 Obsidian 内容 |
| Persona Runtime Agent | Companion、Prompt、认知算子、上下文组装与表达策略 | `docs/02-persona/`, `docs/04-application/README.md` | `apps/persona/src/ai-runtime/**`, `apps/persona/src/domain/persona/**`, `docs/02-persona/**` | 不直接写 UI、API、Memory 或 DB adapter；不直接持久化模型输出 |
| Memory Domain Agent | Event、Topic、Profile、Timeline、记忆写入、提案、治理与检索语义 | `docs/03-memory/`, `docs/05-infra/README.md` | `apps/persona/src/domain/event/**`, `apps/persona/src/domain/memory/**`, `docs/03-memory/**` | 不绕过 Event 写入记忆；数据库迁移需 Infra Agent 审阅 |
| Application/API Agent | HTTP/移动 API、对话编排、Capture、项目、待办、工作状态、日历、调度与后台任务 | `docs/04-application/`, `docs/00-overview/domain-map.md`, `docs/04-application/mobile-api-v1.md` | `apps/persona/src/application/**`, `apps/persona/src/interface/**`, `docs/04-application/**` | 不定义 Prompt/Memory 规则；不把领域规则塞进接口层 |
| Infra Agent | 配置、SQLite、LLM Provider、Telegram、Obsidian 写入、本地部署 | `docs/05-infra/`, `docs/06-governance/debug-playbook.md` | `apps/persona/src/infra/**`, `.env.example`, `deploy.md`, `docs/05-infra/**` | 不改变业务流程语义 |
| Governance Agent | 架构不变原则、协作规则、验收标准、调试手册 | `docs/06-governance/`, `docs/07-product/` | `docs/00-overview/**`, `docs/06-governance/**`, `docs/07-product/**`, `README.md` | 不替业务域做实现决策 |

## 推荐推进顺序

1. Workspace UI Agent 稳定 Next.js 本地入口、页面和交互可访问性。
2. Blog UI Agent 稳定独立公开博客的阅读体验和构建入口。
3. Content Sync Agent 稳定 Obsidian/项目 Markdown 到读模型、VitePress 和 Blog 的内容链路。
4. Android Client Agent 按 Mobile API v1 稳定 Android 客户端，不复制后端业务逻辑。
5. Release/Operations Agent 管理版本、CI、镜像和远端发布。
6. Infra Agent 稳定环境变量、DB 路径、部署和启动说明。
7. Application/API Agent 收敛所有输入到统一事件与持久化任务。
8. Memory Domain Agent 完成可查询、可解释、可回滚的记忆闭环。
9. Persona Runtime Agent 在记忆闭环稳定后增强 Prompt 与表达风格。
10. Governance Agent 持续检查文档入口、架构边界和验收标准。

## 合并前检查

- 至少运行与改动域相关的命令。
- 搜索旧路径：`index.html`, `legacy/`, 根目录 `scripts/`, 根目录 `.vitepress/`，确认不是作为当前根路径使用。
- 涉及 DB 时确认当前实现仍是 SQLite，路径仍为仓库根 `data/persona-os.db`。
- 涉及前台时确认 `http://127.0.0.1:5173/` 或对应构建产物可访问。
- 涉及跨域时更新对应两个域的 README 或说明文档。
- 涉及公开博客时确认 `:5175` 的独立构建与读模型同步仍可用。

## 前端与内容同步协作规则

- Workspace UI Agent 只消费 `apps/workspace/src/shared/` 和 `apps/workspace/public/data/` 提供的读模型，不直接读取 Obsidian Vault、SQLite 或环境文件。
- Content Sync Agent 可以修改同步脚本和生成数据，但不能为了适配页面直接修改 React 组件；数据结构变化必须先在 `src/shared/` 的类型/读取接口中明确。
- Workspace UI Agent 与 Blog UI Agent 是两个独立前端项目；前者运行于 `:5173`，后者运行于 `:5175`，不能互相引入页面组件或样式。
- Blog UI Agent 负责博客页面，博客 Markdown 复制与元数据生成由 Content Sync Agent 负责；两者通过 `public/data/blog-posts.json` 和 `public/data/blog/*.md` 协作。
- Android Client Agent 只调用 Mobile API v1，不直接访问 SQLite、Obsidian、Workspace 读模型或 LLM Provider；Mobile API 的协议由 Application Agent 维护。
- 同步管道改动至少运行 `npm.cmd run sync`；界面改动至少运行 `npm.cmd run check:workspace` 和 `npm.cmd run build`。
- 两个 Agent 同时工作时，优先使用独立 worktree；不能独立隔离时，不得修改对方的允许路径。

## 三个 Persona 后端 Agent 的协作方向

```text
Interface / Client
        |
        v
Application/API Agent  -- 编排请求、事务和任务
        |
        +--> Persona Runtime Agent -- 生成回复或结构化分析
        |
        +--> Memory Domain Agent -- 校验、治理并提交记忆投影
        |
        +--> Infra Agent -- 提供数据库、LLM、文件和运行时适配
```

- `Persona Runtime Agent` 决定如何理解和表达，不决定记忆是否落库。
- `Memory Domain Agent` 决定什么可以进入长期记忆，以及如何保留来源和治理状态。
- `Application/API Agent` 决定请求如何进入系统、如何恢复、重试和协调上述域，但不拥有它们的规则。
- 修改 Mobile API、Conversation Flow 或异步任务时由 Application/API Agent 负责；涉及 Prompt 或 Memory patch 时必须分别通知 Persona Runtime Agent 或 Memory Domain Agent。
- 修改 `schema.sql`、迁移、连接池或数据库备份时由 Infra Agent 负责，Memory Domain Agent 提供领域字段和不变量审阅。
