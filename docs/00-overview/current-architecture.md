# Current Architecture

## 当前定位

本仓库是两个项目合并后的模块化单体：

- **Workspace 旧项目**：个人工作台、VitePress、Obsidian、项目进度、待办、博客和本地 HTML 仪表盘。
- **Persona OS 新项目**：Telegram/Web 输入、Event Core、Memory、Persona、认知算子和 LLM 回复。

当前目标不是拆微服务，而是把两个项目整理成清晰的架构域，方便多个 AI 按边界协作。

当前代码根：

- Workspace 前台：`apps/workspace/`
- Persona OS 后台：`apps/persona/src/`
- 根目录旧入口 `index.html` / `detail.html` / `calendar.html`、根目录 `scripts/`、根目录 `.vitepress/` 已不是当前架构入口；只在归档或迁移记录中作为历史事实出现。

## 推荐架构

```text
Presentation
  Workspace HTML / VitePress / Telegram / future Next.js

Interface
  HTTP API / Telegram Adapter / future MCP Adapter

Application
  Conversation Flow / Event Bus / Daily Summary / Working State / Workspace-Persona Bridge

Domain
  Workspace / Persona / Memory / Context / Event / Working State / Project / Topic / Profile

AI Runtime
  Companion / Researcher / Critic / Archivist / Prompt / LLM call policy

Infrastructure
  SQLite now / PostgreSQL later / Obsidian FS / DeepSeek / Telegram API / Config
```

横向约束：

- Event 是唯一输入单位
- Companion 是默认输出层
- 原始 Event 不可修改
- Obsidian 是长期可视化和人工审计层
- MVP 稳定前不引入微服务、向量库、图数据库、多模型路由

## 已实现

- Workspace 主入口：`http://127.0.0.1:5173/` via VitePress dev server
- Workspace legacy 静态资产：`apps/workspace/legacy/index.html`, `apps/workspace/legacy/detail.html`, `apps/workspace/legacy/calendar.html`
- Workspace VitePress 配置和组件：`apps/workspace/.vitepress/`
- Obsidian/VitePress 同步脚本：`apps/workspace/scripts/sync-projects.js`, `apps/workspace/scripts/watch.js`
- Persona OS TypeScript 源码：`apps/persona/src/`
- HTTP API：对话、状态、Capture、Memory 治理/检索、Daily Summary、Working State、Project、Todo 和任务恢复接口
- Telegram Bot：可信聊天白名单、稳定 Event 身份、消息与 `/note`、`/todo`、`/project` 命令
- Event 入库、幂等查询，以及 Conversation/Analysis 可恢复执行状态
- Web/Telegram Note、Idea、Journal 不可变 Capture、隐私安全检索，以及无 Companion 回复的后台记忆分析
- Companion 用户可见回复；Research/Critic/Archivist 结构化分析保持私有
- Topic/Profile/Timeline 完整写回、Profile 冷却提案与可审计治理
- FTS5/trigram Memory 检索和当前消息 query-aware Context
- 前一日 Daily Summary 自动收口、失败恢复和 Obsidian Daily Note 原子归档
- Project/Todo 用户管理投影、生命周期审计、关系约束和私有工作上下文
- Working State 单例投影、原因必填的审计更新、Project 终态原子清除和私有 Prompt 上下文；运行模式固定为 S1
- SQLite 运行时数据库、升级迁移、组件健康状态和完整离线契约门

## 仍待闭环

- Workspace Markdown Project/Todo 与 Persona 运行时投影尚未自动双向同步；当前通过 Application API 管理 Persona 投影
- Obsidian 自动归档当前只覆盖 Daily Note，Topic/Profile/Project 的可读导出尚未实现
- Event Bus 仍是模块化单体内的编排边界，不是独立队列或服务
- Context Builder 已由 Working State、Memory 检索、最近对话、Active Project 和 Open Todo 组成；S1 已持久化，但还没有 S2-S4 选择规则或 delivery 策略层
- 真实 Telegram、Workspace 浏览器和 30 天持续运行仍需人工环境验收

## 愿景设计

- PostgreSQL 作为长期运行时主库
- Next.js 作为未来 Workspace + BFF 壳层
- mode/delivery/novelty 策略层
- 更广的受治理 Obsidian 导出
- 多 AI 协作开发空间

这些愿景不得绕过当前 MVP 原则直接落地。

## 当前数据主权

- Workspace 内容主库：Obsidian/Markdown 与本地 `apps/workspace/projects/*.md`
- Workspace 展示层：VitePress dev server 为主，legacy 静态 HTML 仅作迁移兼容资产
- Persona 运行时事实源：SQLite 中的 `events`
- 长期记忆目标层：Obsidian 可读文件

文档中如出现 PostgreSQL，应理解为长期目标；当前代码实际使用 SQLite。
