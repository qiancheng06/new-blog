# 设计文档

> AI 每次修改代码前先读本文档，修改后如有必要立即更新本文档。

---

## 1. 项目是什么

一个本地个人博客站点，辅助日常生活。四块核心功能：

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
code/projects/blog/                  ← 项目根（依赖、配置、文档、仪表盘）
├── .vitepress/                      ← VitePress 配置 + 主题 + Vue 组件
│   ├── config.ts                    ← srcDir: ../../../OneDrive/obsidian/obsidian
│   ├── theme/
│   │   ├── index.ts                 ← 注册组件
│   │   ├── components/
│   │   │   ├── CalendarTodo.vue     ← 月视图日历（VitePress 端）
│   │   │   ├── KnowledgeCard.vue    ← 知识卡片
│   │   │   └── ProgressDashboard.vue← 项目进度看板（VitePress 端）
│   │   └── styles/custom.css        ← 深色科技风主题
│   └── dist/                        ← 构建产物（不上传 git）
├── docs/                            ← 本文 + task.md + instructions.md + roadmap.md
│   ├── design.md                    ← 本文（架构设计）
│   ├── task.md                      ← 任务进度
│   ├── instructions.md              ← 使用说明 + AI 协作规范
│   └── roadmap.md                   ← 需求路线图（只增不改）
├── scripts/
│   ├── sync-projects.js             ← 解析 .md → 更新 HTML 内嵌数据
│   └── watch.js                     ← fs.watch 文件监听自动同步
├── projects/                        ← 项目进度源文件
│   ├── blog.md
│   ├── smart-car.md
│   └── computer-vision.md
├── index.html                       ← 主仪表盘（file:// 可打开）
├── detail.html                      ← 项目详情页 + 内联编辑
├── calendar.html                    ← 日历月视图
├── start-blog.bat                   ← 一键启动
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
├── blog/                            ← 博客文章
│   └── index.md
├── raw/                             ← 原始资料（可选）
└── wiki/                            ← AI 精炼层（可选）
```

### VitePress 构建链路

```
你在 Obisidian 编辑 *.md
    → 保存到 vault
    → VitePress dev server 热更新（localhost:5173）
    → npm run build → .vitepress/dist/（静态文件）
```

### 内嵌数据同步链路

```
projects/*.md + vault/todo/*.md
    │
    │ 自动监听（scripts/watch.js）或手动（npm run sync）
    ▼
sync-projects.js
    │
    ▼
index.html / detail.html / calendar.html（EMBEDDED_PROJECTS + TODO_DATA）
```

---

## 3. 前端页面清单

| 页面 | 访问方式 | 功能 |
|------|----------|------|
| `index.html` | 双击 / `start-blog.bat` | 主仪表盘：今日待办 + 项目看板 + 知识库速览 |
| `detail.html#blog` | 点击项目卡片 / 直接打开 | 项目详情 + 内联编辑（勾选/添加/删除） |
| `calendar.html` | 点击"今日待办"标题 | 月视图日历 + 日期详情 |
| `localhost:5173` | `npm run dev` | VitePress 站点（含博客/知识库/待办/项目页面） |

---

## 4. 数据流

### 项目进度
```
projects/*.md (frontmatter + ## 阶段 + - [x] 任务)
    → sync-projects.js → EMBEDDED_PROJECTS / ALL_PROJECTS
    → index.html（看板卡片） / detail.html（详情+编辑）
    → localStorage（编辑时持久化）
```

### 待办事项
```
vault/todo/2026-*.md (- [x] 描述 @日期)
    → sync-projects.js → TODO_DATA
    → index.html（今日/逾期/近期待办）
    → calendar.html（月视图）
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
| 仪表盘 | 原生 HTML+CSS+JS | file:// 兼容，零依赖 |
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
5. **文档驱动**：AI 改代码前读设计文档，改后更新
6. **只增不改**：roadmap.md 只追加不修改，历史可追溯

---

## 9. 远期规划：上线部署

### 架构（不变）

```
Obsidian vault (OneDrive) → npm run build → .vitepress/dist/ → GitHub Pages
```

### 需要的更改

| 文件 | 本地 | 线上 |
|------|------|------|
| `config.ts` `cleanUrls` | `false`（file:// 需要 .html） | `true` |
| `config.ts` `base` | 留空 | `'/new-blog/'` |
| 仪表盘编辑按钮 | 显示 + 复制路径 | 隐藏或改链接 |

### 部署方式

| 方式 | 命令 |
|------|------|
| A. 手动部署（推荐） | `npm run build && npx gh-pages -d .vitepress/dist` |
| B. CI 自动部署 | GitHub Actions 监听 → 自动构建 |

### 上线前检查清单
- [ ] `index.html` 中的文件路径不泄露用户名
- [ ] `detail.html` 的编辑路径在线上隐藏
- [ ] `calendar.html` 的 TODO_DATA 自动隐藏 obsidian 路径
- [ ] 构建产物不包含 `node_modules/`
- [ ] 决定自定义域名（可选）
