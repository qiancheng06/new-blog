# 设计文档

> AI 每次修改代码前先读本文档，修改后如有必要立即更新本文档。
> 本文件属于 **Workspace 前台**。Persona OS 后台定义见 `02-persona/`、`03-memory/`、`04-application/`。

---

## 1. 项目是什么

一个本地个人工作台，辅助日常生活。四块核心功能：

| 功能 | 定位 | 维护者 |
|------|------|--------|
| 知识库 | 资源库/技术手册/技能树 | 你 |
| 待办日历 | Markdown 写待办，日历月视图 | 你 + CalendarTodo + calendar.html |
| 项目进度 | projects/*.md → dashborad + 详情 + 内联编辑 | 你 + sync-projects.js |
| 博客 | 记录生活、技术、思考 | 你 |

可选扩展：`raw/` + `wiki/` + `CLAUDE.md` 用于 AI 辅助消化大量资料，日常可不用。

---

## 2. 物理架构

### 目录结构

```
code/projects/blog/                  ← 仓库根（依赖、配置、文档、apps）
├── apps/
│   ├── workspace/                   ← Workspace 前台
│   │   ├── .vitepress/              ← VitePress 配置 + 主题 + Vue 组件
│   │   ├── scripts/                 ← sync-projects.js + watch.js
│   │   ├── projects/                ← 项目进度源文件
│   │   ├── legacy/                  ← 旧 standalone HTML 资产（非主入口）
│   │   │   ├── index.html           ← legacy 仪表盘
│   │   │   ├── detail.html          ← legacy 项目详情页 + 内联编辑
│   │   │   └── calendar.html        ← legacy 日历月视图
│   │   └── start-blog.bat           ← 一键启动
│   └── persona/                     ← Persona OS 后端
│       └── src/                     ← 按架构域分层的 TypeScript 源码
├── docs/                            ← 按架构域组织的 AI 工作空间
│   ├── 00-overview/                 ← 当前架构、术语、AI 加载入口
│   ├── 01-workspace/                ← 本域：前台工作台、同步链路、Dashboard
│   ├── 02-persona/                  ← Companion、Prompt、认知算子
│   ├── 03-memory/                   ← Event、Memory、Daily Note
│   ├── 04-application/              ← Conversation Flow、Event Bus、桥接层
│   ├── 05-infra/                    ← DB、LLM、Telegram、部署与配置
│   ├── 06-governance/               ← 架构不变原则、编码规范、调试手册
│   ├── 07-product/                  ← 愿景、范围、长期规划、验收标准
│   └── 99-archive/                  ← 历史参考，不作为当前实现依据
├── package.json                     ← npm run dev / build / watch / sync
└── .gitignore

C:\Users\33831\OneDrive\obsidian\obsidian\   ← Obisidian vault（内容源）
├── index.md                         ← 博客首页
├── knowledge/                       ← 知识库
│   ├── resource-library/            ← 数据集/工具/书单
│   ├── tech-manual/                 ← Git/Docker/排错
│   ├── skill-tree/                  ← 嵌入式/CV/Web
│   └── inbox/                       ← 草稿（build 时跳过）
├── todo/                            ← 待办按月分文件
│   ├── 2026-05.md
│   ├── 2026-06.md
│   └── index.md
├── projects/                        ← VitePress 版项目进度页
│   └── index.md                     ← 嵌入 <ProgressDashboard />
├── blog/                            ← 博客文章（自动生成文章列表 + 标签索引）
│   ├── index.md                     ← 文章列表（<!-- BLOG_LIST --> 自动填充）
│   └── tags.md                      ← 标签索引（<!-- BLOG_TAGS --> 自动填充）
├── raw/                             ← 原始资料（可选）
└── wiki/                            ← AI 精炼层（可选）
```

### VitePress 构建链路

```
你在 Obisidian 编辑 *.md
    → 保存到 vault
    → VitePress dev server 热更新（127.0.0.1:5173）
    → npm run build → apps/workspace/.vitepress/dist/（静态文件）
```

### 内嵌数据同步链路

```
apps/workspace/projects/*.md + vault/todo/*.md + vault/knowledge/
    │
    │ 自动监听（apps/workspace/scripts/watch.js）或手动（npm run sync）
    ▼
sync-projects.js
    │
    ├──→ apps/workspace/legacy/index.html / detail.html / calendar.html（EMBEDDED_PROJECTS + TODO_DATA + KNOWLEDGE_DATA）
    │
    └──→ vault/blog/index.md + vault/blog/tags.md（BLOG_LIST / BLOG_TAGS 自动填充）
         └──→ apps/workspace/.vitepress/config.ts（SIDEBAR:BLOG 自动更新）
```

---

## 3. 前端页面清单

| 页面 | 访问方式 | 功能 |
|------|----------|------|
| `127.0.0.1:5173` | `npm run dev` / `npm.cmd run dev:mock` | Workspace 主入口（博客/知识库/待办/项目页面） |
| `apps/workspace/legacy/index.html` | 迁移兼容/历史参考 | legacy 仪表盘：今日待办 + 项目看板 + 知识库速览 |
| `apps/workspace/legacy/detail.html#blog` | 迁移兼容/历史参考 | legacy 项目详情 + 内联编辑（勾选/添加/删除） |
| `apps/workspace/legacy/calendar.html` | 迁移兼容/历史参考 | legacy 月视图日历 + 日期详情 |

### Companion chat 入口

Workspace Companion 浮窗属于 Workspace 前台能力，但对话能力不在本域实现。入口固定连接本地 Application API：

- `GET http://127.0.0.1:3001/health`：检测 Companion 后端在线状态。
- `POST http://127.0.0.1:3001/api/chat`：发送用户消息，进入 Conversation Flow。

本入口不应改为直接调用 Persona、Memory 或 LLM。轻量验收时确认入口使用 `127.0.0.1:3001`，路径使用 `/health` 与 `/api/chat`。

---

## 4. 数据流

### 项目进度
```
apps/workspace/projects/*.md (frontmatter + ## 阶段 + - [x] 任务)
    → import.meta.glob → ProgressDashboard.vue（VitePress 端）
        → 卡片点击展开详情
        → 状态/优先级下拉编辑 + 任务勾选/添加/删除
        → localStorage 持久化
    → sync-projects.js → EMBEDDED_PROJECTS / ALL_PROJECTS
    → apps/workspace/legacy/index.html（看板卡片） / legacy/detail.html（详情+编辑）
    → localStorage（编辑时持久化）
```

### 待办事项
```
vault/todo/2026-*.md (- [x] 描述 @日期)
    → sync-projects.js → TODO_DATA
    → apps/workspace/legacy/index.html（今日/逾期/近期待办）
    → apps/workspace/legacy/calendar.html（月视图）
    → CalendarTodo.vue（VitePress 端，待接入）
```

---

## 5. 项目进度格式

```yaml
# projects/blog.md
---
name: 个人博客
status: in-progress       # in-progress / planning / paused / done
priority: high            # high / medium / low
tags: [VitePress, Vue]
repo: https://github.com/...
---
## 阶段名称
- [x] 已完成任务
- [ ] 待完成任务
```

---

## 6. 待办格式

```markdown
# vault/todo/2026-06.md
- [ ] 任务描述 @2026-06-05
- [x] 已完成任务 @2026-05-30
```

按月分文件，用 `@日期` 标记。

---

## 7. 技术选型

| 层 | 选型 | 原因 |
|----|------|------|
| 静态站 | VitePress 1.x | Markdown → HTML + 搜索/导航/主题 |
| 自定义组件 | Vue 3 (Composition API) | 日历组件需要动态交互 |
| 编辑器 | Obsidian | 本地优先，Markdown 原生 |
| Legacy 仪表盘 | 原生 HTML+CSS+JS | 迁移兼容资产，由同步脚本维护，不作为当前主入口 |
| 数据同步 | Node.js fs.watch + 内嵌数据 | 自动监听 .md 变更，实时更新 HTML |
| 持久化 | localStorage | 离线编辑，浏览器独立 |
| 包管理 | npm | 环境已有 |
| 版本管理 | Git | 独立仓库 |

---

## 8. 设计原则

1. **你控制内容**：knowledge/、todo/、blog/ 完全由你编辑，AI 不碰
2. **内容即文件**：所有源数据都是 `.md`，可迁移、可版本管理
3. **渐进增强**：先跑通本地仪表盘，再按需扩展
4. **最少依赖**：生产环境只依赖 VitePress，仪表盘完全独立
5. **文档驱动**：AI 改代码前读对应架构域 README，改后按需更新
6. **历史归档**：历史路线和任务记录归档在 `99-archive/`，不作为当前实现依据

---

## 9. 上线部署（当前方案）

**选型**: Cloudflare Tunnel + Access（免费，无需公网 IP，自带鉴权）

### 架构

```
Cloudflare CDN ← Cloudflare Tunnel ← 本地电脑 / VPS
                    ↑
            Cloudflare Access (鉴权)
```

### 前提

- 域名托管到 Cloudflare
- 仓库设为 private（不上传 vault 内容）
- 本地 build 后部署 dist

### 详细部署步骤

见根目录 [`deploy.md`](../deploy.md)。

### 其他可选方案

| 方案 | 成本 | 适用场景 |
|------|------|----------|
| Cloudflare Tunnel + Access | ¥0 + 域名约 ¥30/年 | **当前方案**，无公网IP |
| VPS + Nginx Basic Auth | ¥10-30/月 | 云服务器方案 |
| 本地局域网 | ¥0 | 仅内网访问 |
| Tailscale 组网 | ¥0 | 小众自用 |
