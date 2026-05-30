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

双击 `index.html` 直接打开仪表盘（不依赖服务器）。

## 项目结构

```
├── .vitepress/            VitePress 配置 + 暗色主题 + Vue 组件
│   ├── config.ts          站点配置（导航/侧边栏/srcDir）
│   ├── theme/
│   │   ├── custom.css     暗色科技风主题
│   │   └── components/    CalendarTodo / KnowledgeCard / ProgressDashboard
├── docs/                  项目文档
│   ├── design.md          架构设计
│   ├── instructions.md    使用说明 + AI 协作规范
│   ├── roadmap.md         需求路线图（只增不改）
│   └── task.md            任务进度 + 踩坑记录
├── projects/              项目进度数据（.md 文件）
│   ├── blog.md            本博客开发进度
│   ├── smart-car.md       智能车竞赛
│   └── computer-vision.md 数字码头视觉
├── scripts/
│   ├── sync-projects.js   数据同步（.md → HTML 内嵌数据）
│   └── watch.js           文件监听自动同步
├── index.html             主仪表盘（file:// 可打开）
├── detail.html            项目详情 + 内联编辑
├── calendar.html          待办日历月视图
├── start-blog.bat         一键启动
└── package.json
```

## 数据流

```
Obsidian vault (OneDrive)     projects/*.md
        │                           │
        │ srcDir                    │ sync-projects.js
        ▼                           ▼
VitePress 站点              index.html / detail.html / calendar.html
(localhost:5173)            (内嵌数据 + localStorage)
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

- VitePress 1.6（静态站）
- Vue 3（自定义组件）
- Obsidian（内容编辑）
- Vanilla JS + localStorage（仪表盘独立运行）
