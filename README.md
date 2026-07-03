# 个人工作台

个人知识管理 · 项目跟踪 · 待办日历，基于 VitePress + Obsidian。

## 快速开始

```bash
# 安装依赖
npm install

# 开发（自动同步 + 热更新）
npm run dev

# Mock 后端（本地无网络体验 API，不启动 Telegram）
npm run dev:backend:mock

# 构建静态站
npm run build

# 仅同步数据（解析 .md → 更新 HTML）
npm run sync

# 文件监听（自动同步）
npm run watch

# 统一本地验证入口（默认验收）
npm run verify:local
```

PowerShell 如果提示禁止加载 `npm.ps1`，使用同等命令 `npm.cmd run dev` / `npm.cmd run build` / `npm.cmd run sync` / `npm.cmd run verify:local`。

## 验证入口

默认验收优先运行：

```bash
npm.cmd run verify:local
```

该入口会串联 Backend TypeScript build、无网络 API smoke、Workspace sync，以及当前文档的旧引用检查。单项排查时可运行 `npm.cmd run build:backend`、`npm.cmd run smoke:api`、`npm.cmd run sync`。

需要本机权限或真实环境的检查不要纳入默认验收：真实 Telegram/LLM 后端用 `npm.cmd run dev:backend` 单独验证；Obsidian vault 内容完整性、OneDrive 路径、`npm.cmd run watch` 文件监听和真实 vault 同步，需要在拥有 vault 的本机确认。

### 如何访问

| 方式 | 页面 | 说明 |
|------|------|------|
| `http://127.0.0.1:5173` | Workspace 主入口（知识库/待办/博客/项目） | 需先运行 `npm run dev` 或 `npm.cmd run dev:mock` |
| 双击 `apps/workspace/start-blog.bat` | 一键启动 | Starts or reuses Workspace dev server and Persona mock API, then opens `http://127.0.0.1:5173/`. |
| `apps/workspace/legacy/index.html` | Legacy 静态仪表盘资产 | 不作为当前主入口，仅用于历史兼容/迁移参考 |
| `http://127.0.0.1:4173` | 构建后的 VitePress 站点 | 需先运行 `npm run build && npm run preview` |

> 如果网页打不开，先确认你访问的是 `http://127.0.0.1:5173/`。Monorepo 整理后，`apps/workspace/legacy/*.html` 只是历史静态资产，不再作为 Workspace 主入口。
> 需要体验 `/api/chat` 等 Persona API 时，优先运行 `npm.cmd run dev:mock`；它会启动或复用 Workspace dev server 与 Persona mock API。

> ⚠️ **VitePress 页面必须通过 HTTP 访问**。由于 VitePress 使用 ES Module，浏览器禁止在 `file://` 协议下加载。从仪表盘点击博客/知识库等链接时，会自动检测开发服务器并切换到 `127.0.0.1:5173` 地址；若服务器未运行，链接会变灰并提示启动命令。

> AI 协作入口：Workspace 当前根是 `apps/workspace/`，Persona OS 当前代码根是 `apps/persona/src/`。根目录 `index.html` / `detail.html` / `calendar.html`、根目录 `scripts/`、根目录 `.vitepress/` 只应作为迁移历史理解，不要作为当前实现入口。

### 部署入口

仓库级部署入口见 [deploy.md](deploy.md)，详细策略见 [docs/05-infra/deployment.md](docs/05-infra/deployment.md)。当前部署边界是：Workspace 只发布 `apps/workspace/.vitepress/dist/` 静态产物；Persona 后台先本地运行；`data/` 与 Obsidian vault 外部路径不进入静态部署。

## 项目结构

```
├── apps/
│   ├── workspace/         Workspace 前台（VitePress + 静态 HTML 仪表盘）
│   │   ├── .vitepress/    VitePress 配置 + 主题 + Vue 组件
│   │   ├── scripts/       数据同步与文件监听
│   │   ├── legacy/        旧 standalone HTML 资产（非主入口）
│   │   └── start-blog.bat 一键启动 dev-server 入口
│   └── persona/           Persona OS 后端（Telegram Bot + API + 认知引擎）
│       └── src/           按架构域分层的 TypeScript 源码
├── docs/                  项目文档（按架构域组织）
│   ├── 00-overview/       当前架构、领域地图、术语表、AI 加载指南
│   ├── 01-workspace/      前台设计、Obsidian 规范、同步规范、仪表盘
│   ├── 02-persona/        认知算子（archivist/critic/researcher/delivery）、Prompt
│   ├── 03-memory/         记忆层数据模型、事件模型、遗忘策略
│   ├── 04-application/    编排层、事件总线、Workspace-Persona 桥接
│   ├── 05-infra/          DB、LLM、Telegram、Obsidian、部署与配置
│   ├── 06-governance/     架构原则、编码规范、调试手册、操作说明
│   ├── 07-product/        产品简报、验收标准、远期规划
│   └── 99-archive/        历史归档（ADR、提案、运行日志）
└── package.json
```

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Persona Workspace                    │
│                                                         │
│  ┌──────────────┐   HTTP     ┌──────────────────────┐ │
│  │  Workspace   │◄──────────►│    Persona OS        │ │
│  │  (前台)       │  /api/chat │    (后台 :3001)      │ │
│  │              │            │                      │ │
│  │ VitePress    │            │ Telegram Bot  ──→ 用户 │
│  │ HTML 仪表盘   │            │ API Server           │ │
│  │ Vue 组件     │            │ 认知引擎 (4 算子)     │ │
│  │ Obsidian     │            │ SQLite (事件溯源)     │ │
│  └──────────────┘            └──────────────────────┘ │
│                                                         │
│  同步管道: Obsidian ── sync-projects.js ──→ HTML 内嵌数据│
│  认知管道: 消息 ──→ Event ──→ Researcher/Critic/       │
│            Archivist ──→ Memory ──→ Companion ──→ 回复  │
└─────────────────────────────────────────────────────────┘
```

### 编辑项目进度

1. 打开 `apps/workspace/legacy/detail.html#blog` → 点"编辑"（legacy 兼容路径）
2. 勾选/添加/删除任务 → 自动保存到浏览器
3. 导出为 .md → 覆盖 `apps/workspace/projects/` 源文件 → 同步到源代码

### 添加知识页

1. 在 Obsidian vault 的 `knowledge/` 目录下新建 `.md`
2. `npm run watch` 自动检测 → 同步到仪表盘知识段
3. `npm run dev` 热更新 → VitePress 站点立即显示

### 启动 Persona OS 后台

```bash
npm run dev:backend    # 启动 API + Telegram Bot (端口 3001)
npm run dev:backend:mock    # 启动本地 mock API，不调用真实 LLM
npm run smoke:api      # 不出网验证 /api/chat → Event → Memory
```

如果 Workspace 状态面板提示 `/api/status` 不存在，通常是 `3001` 上还跑着旧后端进程。停止旧进程后重新运行 `npm run dev:backend` 或 `npm run dev:backend:mock`。

## Docs 导航

> 文档按架构域组织，AI Agent 首次加载时请按以下顺序阅读：
> 多 AI 并行时，只改自己任务范围内的文件；遇到已有工作区改动，默认视为他人改动，不回滚、不顺手整理。

| 优先级 | 文档 | 说明 |
|--------|------|------|
| **必读** | [00-overview/README.md](docs/00-overview/README.md) | 文档入口：多 AI 协作的加载起点 |
| **必读** | [00-overview/current-architecture.md](docs/00-overview/current-architecture.md) | 当前真实架构：已实现/半实现/愿景 |
| **必读** | [00-overview/glossary.md](docs/00-overview/glossary.md) | 术语表：Project≠Topic, Knowledge≠Memory |
| **必读** | [06-governance/architecture-invariants.md](docs/06-governance/architecture-invariants.md) | 架构不变原则 |
| 加载规则 | [00-overview/AI_LOADING_GUIDE.md](docs/00-overview/AI_LOADING_GUIDE.md) | AI 任务加载指南：什么任务该看哪些文件 |
| 全貌 | [07-product/project-brief.md](docs/07-product/project-brief.md) | Persona Workspace 产品简报 |
| 工作台 | [01-workspace/design.md](docs/01-workspace/design.md) | 前台架构设计、数据流、技术选型 |
| Persona | [02-persona/flow.md](docs/02-persona/flow.md) | 认知流程定义 |
| 操作 | [06-governance/instructions.md](docs/06-governance/instructions.md) | 命令清单、AI 协作规范 |
| 需求 | [99-archive/historical/feature-roadmap.md](docs/99-archive/historical/feature-roadmap.md) | 需求路线图（日志，只增不改） |
| 进度 | [99-archive/historical/task-log.md](docs/99-archive/historical/task-log.md) | 任务进度 + 踩坑记录 |

## 技术栈

**前台 (Workspace)**
- VitePress 1.6（静态站点生成）
- Vue 3（自定义组件：日历/知识卡片/项目看板）
- Obsidian（Markdown 内容编辑）
- Vanilla JS + localStorage（仪表盘离线运行）

**后台 (Persona OS)**
- Node.js + TypeScript（`tsx` 开发运行）
- better-sqlite3（事件溯源存储，WAL 模式）
- DeepSeek API（认知引擎：Companion / Researcher / Critic / Archivist）
- grammy（Telegram Bot）
- zod（运行时类型校验）
## Local Mock Demo

Use this when you want the full local Workspace experience without real LLM or Telegram calls:

```bash
npm.cmd run dev:mock
```

It starts or reuses:

- Workspace dev server: `http://127.0.0.1:5173/`
- Persona mock API: `http://127.0.0.1:3001/api/status`

The Windows launcher `apps/workspace/start-blog.bat` uses the same flow.
This supersedes older notes that describe `start-blog.bat` as Workspace-only.

## Current Browser Entrypoint

Use the dev server URL as the active Workspace entrypoint:

```text
http://127.0.0.1:5173/
```

Do not open `apps/workspace/legacy/index.html` as the primary app entrypoint.
The HTML files under `apps/workspace/legacy/` are legacy/static workspace
assets; the current browser workflow is served through the Node/VitePress dev
server.

For real Persona backend startup, use `npm.cmd run dev:backend`. It requires a
valid DeepSeek bearer token in `OPENAI_API_KEY` when `LLM_PROVIDER=deepseek`.
`TELEGRAM_TOKEN` may stay empty; in that case the API starts and Telegram is
skipped.
