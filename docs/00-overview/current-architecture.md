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
  Conversation Flow / Event Bus / Daily Summary / Workspace-Persona Bridge

Domain
  Workspace / Persona / Memory / Context / Event / Project / Topic / Profile

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
- HTTP API：`POST /api/chat`, `GET /api/events`, `GET /health`
- Telegram Bot 基础入口
- Event 入库和查询
- Companion 同步回复
- Research/Critic/Archivist 异步分析调用
- SQLite 运行时数据库和基础 Memory 表

## 半实现

- Memory 表已存在，但分析结果尚未完整写回 Topic/Profile/Timeline
- Context 目前主要依赖最近事件，尚未形成独立 Context Builder
- Daily Note 表已存在，但每日总结流程尚未闭环
- Obsidian 是长期目标层，但 Persona OS 到 Obsidian 的记忆同步尚未完成
- Event Bus 目前是架构方向，还不是独立模块

## 愿景设计

- PostgreSQL 作为长期运行时主库
- Next.js 作为未来 Workspace + BFF 壳层
- 更完整的 Application 编排层
- Daily Summary 到 Obsidian 的稳定写入
- 多 AI 协作开发空间

这些愿景不得绕过当前 MVP 原则直接落地。

## 当前数据主权

- Workspace 内容主库：Obsidian/Markdown 与本地 `apps/workspace/projects/*.md`
- Workspace 展示层：VitePress dev server 为主，legacy 静态 HTML 仅作迁移兼容资产
- Persona 运行时事实源：SQLite 中的 `events`
- 长期记忆目标层：Obsidian 可读文件

文档中如出现 PostgreSQL，应理解为长期目标；当前代码实际使用 SQLite。
