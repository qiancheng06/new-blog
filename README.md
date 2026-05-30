# My Blog

个人知识库 · 博客 · 待办管理，基于 VitePress + Obsidian。

## 快速开始

```bash
# 安装依赖
npm install

# 开发（自动同步 + 热更新）
npm run dev

# 构建静态站
npm run build

# 仅同步数据（解析 .md → 更新 HTML）
npm run sync

# 文件监听（自动同步）
npm run watch
```

### 如何访问

| 方式 | 页面 | 说明 |
|------|------|------|
| 双击 `index.html` | 仪表盘（项目进度/待办/知识库概览） | `file://` 直接打开，无需服务器 |
| `http://localhost:5173` | 完整的 VitePress 站点（知识库/待办/博客/项目） | 需先运行 `npm run dev` |
| `http://localhost:4173` | 构建后的 VitePress 站点 | 需先运行 `npm run build && npm run preview` |

> ⚠️ **VitePress 页面必须通过 HTTP 访问**。由于 VitePress 使用 ES Module，浏览器禁止在 `file://` 协议下加载。从仪表盘点击博客/知识库等链接时，会自动检测开发服务器并切换到 `localhost:5173` 地址；若服务器未运行，链接会变灰并提示启动命令。

## 项目结构

```
├── .vitepress/            VitePress 配置 + 暗色科技风主题 + Vue 组件
│   ├── config.ts          站点配置（base/nav/sidebar/srcDir）
│   ├── theme/
│   │   ├── custom.css     全站暗色科技风（毛玻璃导航/卡片/代码块/表格…）
│   │   ├── index.ts       Theme 入口（注册 Vue 组件 + 导入 custom.css）
│   │   └── components/    CalendarTodo / KnowledgeCard / ProgressDashboard
├── docs/                  项目文档
│   ├── design.md          架构设计
│   ├── instructions.md    使用说明 + AI 协作规范
│   ├── roadmap.md         需求路线图（只增不改）
│   └── task.md            任务进度 + 踩坑记录
├── projects/              项目进度数据（.md 文件，已 gitignore，不上传）
├── scripts/
│   ├── sync-projects.js   数据同步（.md → HTML 内嵌数据）
│   └── watch.js           文件监听自动同步
├── index.html             主仪表盘（file:// 可打开，内嵌项目/待办/知识数据）
├── detail.html            项目详情 + 内联编辑（localStorage 持久化）
├── calendar.html          待办日历月视图
├── start-blog.bat         一键启动
└── package.json
```

## 数据流

```
Obsidian vault (OneDrive)
        │
        │ srcDir
        ▼
VitePress 站点 (localhost:5173)     index.html / detail.html / calendar.html
  ├─ 知识库 /knowledge/         ──→  知识卡片展示（KNOWLEDGE_DATA）
  ├─ 待办 /todo/                ──→  日历月视图 + 今日待办（TODO_DATA）
  ├─ 项目 /projects/            ──→  项目进度看板（EMBEDDED_PROJECTS）
  └─ 博客 /blog/

projects/*.md ── sync-projects.js ──→  HTML 内嵌数据

仪表盘 → 检测 localhost:5173 是否可达
  ├─ 可达 → 链接指向 live 服务器
  └─ 不可达 → 链接变灰 + 提示启动
```

### 编辑项目进度

1. 打开 `detail.html#blog` → 点"编辑"
2. 勾选/添加/删除任务 → 自动保存到浏览器
3. 导出为 .md → 覆盖 `projects/` 源文件 → 同步到源代码

### 添加知识页

1. 在 Obsidian vault 的 `knowledge/` 目录下新建 `.md`
2. `npm run watch` 自动检测 → 同步到仪表盘知识段
3. `npm run dev` 热更新 → VitePress 站点立即显示

## Docs

| 文档 | 说明 |
|------|------|
| [design.md](docs/design.md) | 架构设计、数据流、技术选型 |
| [instructions.md](docs/instructions.md) | 使用命令、编辑方式、AI 协作规范 |
| [roadmap.md](docs/roadmap.md) | 需求路线图，只增不改，含 AI 回应 |
| [task.md](docs/task.md) | 已完成 + 待完成 + 决策 + 踩坑 |

## 技术栈

- VitePress 1.6（静态站生成器）
- Vue 3（自定义组件：日历/知识卡片/项目看板）
- Obsidian（Markdown 内容编辑）
- Tailwind CSS（CDN，仪表盘样式）
- Vanilla JS + localStorage（仪表盘独立运行，离线可用）
