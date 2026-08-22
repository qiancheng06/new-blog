# Workspace 设计（Design）

本文描述当前 Workspace 前端架构。旧的 VitePress-only 与独立 HTML 笔记是
历史背景，不应覆盖本文。

## 当前形态

Workspace 是 Node.js 托管的现代前端：Next.js 主应用 + VitePress 私人内容站
+ 独立 Next.js 公开博客。

```text
用户
  |
  v
Next.js Workspace 应用 (:5173)
  |
  +-- 生成 JSON 适配器
  |     |
  |     +-- Obsidian/项目/待办 Markdown，经 sync-projects.js
  |
  +-- Persona Application API 客户端
        |
        +-- Persona 后端 (:3001)
              |
        +-- SQLite 记忆数据库
        +-- LLM 厂商适配器

独立 Next.js 博客 (:5175)
  |
  +-- 生成的博客清单与 Markdown 副本
        |
        +-- Obsidian blog/*.md，经 sync-projects.js
```

关键规则是来源分离：

- Obsidian 是长期内容来源。
- SQLite 是长期记忆来源。
- Workspace UI 只通过中间层适配器读取两者，不直接访问。

## 目录地图

```text
apps/workspace/
  app/                         Next.js app router 外壳
  src/features/
    ai-console/                AI 控制台（对话、模型、记忆、设置）
    calendar/                  日历模块
    chat/                      Companion 对话
    daily-summary/             每日总结工具
    knowledge/                 知识库
    memory/                    记忆画像与状态治理
    projects/                  项目看板
    status/                    后端状态条
    todos/                     待办流
    tools/                     工具页
    workspace/                 工作台外壳（导航、外观、侧栏）
  src/shared/
    api/personaApi.ts          Persona Application API 客户端
    data/workspaceData.ts      生成 JSON 加载器/回退
    data/workspaceSources.ts   来源 URL 与可用性
  public/data/                 生成 JSON，git 忽略
  scripts/
    sync-projects.js           Markdown/内容同步管道
    watch.js                   本地监听助手
  .vitepress/                  VitePress 私人内容站配置/主题
  legacy/                      旧独立 HTML 资产
apps/blog/
  app/                         独立公开博客路由
  src/                         博客数据适配器与站点外壳
```

## 运行时入口

| 入口 | 命令 | 角色 |
| --- | --- | --- |
| `http://127.0.0.1:5173/` | `npm.cmd run dev` | 主 Workspace 应用 |
| `http://127.0.0.1:5175/` | `npm.cmd run dev:blog` | 独立公开博客 |
| `http://127.0.0.1:5174/` | `npm.cmd run dev:content` | VitePress 私人内容站 |
| `http://127.0.0.1:3001/` | `npm.cmd run dev:backend` 或 `dev:backend:mock` | Persona API |
| `apps/workspace/legacy/*.html` | 无 | 历史回退/仅参考 |

## 数据流

### 项目、待办、知识

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
Next.js 模块经 workspaceData.ts
```

### 博客

```text
Obsidian vault blog/*.md
  |
  v
sync-projects.js（loadBlogPosts）
  |
  +-- apps/workspace/public/data/blog-posts.json（元数据）
  +-- apps/workspace/public/data/blog/<slug>.md（正文副本）
  |
  v
apps/blog（:5175）经 blogData.server.ts
```

生成的 JSON 是本地运行时数据，git 忽略。当来源目录或生成文件缺失时，
UI 必须保留有用的回退状态。

### 记忆与对话

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
Application / Memory / Persona 域
```

Workspace 可以展示记忆状态、发起用户纠正并发送对话消息。它不拥有记忆
schema、检索、排序、遗忘或人格表达逻辑。

## 功能边界

| 模块 | 拥有 | 不拥有 |
| --- | --- | --- |
| 项目 | 看板、进度摘要、来源链接 | Markdown 同步之外的项目持久化规则 |
| 待办 | 待办流、日期分组、来源链接 | Markdown/来源适配器之外的任务语义 |
| 日历 | 月/周/日视图、事件 CRUD、标签、搜索过滤 | 日历服务或通知 |
| 知识 | 内容索引与 VitePress 交接 | Obsidian vault 结构变更 |
| 记忆 | 状态展示与用户治理 | 记忆存储、排序、合并、遗忘策略 |
| 对话 | 用户输入与对话 UI | LLM 调用、人格推理、对话编排 |

## 设计原则

1. 首屏有用：展示真实工作台模块，而不是营销落地页。
2. 功能模块放在 `src/features/`，共享来源/API 适配器放在 `src/shared/`。
3. Obsidian 内容与 Persona 记忆相互独立，在 UI 中经 Application/API 边界汇合。
4. 在等价的 Next.js 覆盖被验证前，保留 legacy HTML。
5. VitePress 是内容站，不是主工作台外壳。
6. 本地来源缺失时可见、可恢复，而不是空白失败。

## 验证

Workspace 变更后使用：

```bash
npm.cmd run build
npm.cmd run check:workspace
```

改动涉及同步脚本或生成 JSON 时：

```bash
npm.cmd run sync
```

完整本地验收：

```bash
npm.cmd run verify:local
```