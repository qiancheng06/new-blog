# 设计文档

> AI 每次修改代码前先读本文档，修改后如有必要立即更新本文档。

---

## 1. 项目是什么

一个本地个人博客站点，辅助日常生活。三块核心功能：

| 功能 | 定位 | 维护者 |
|---|---|---|
| 博客 | 记录生活、技术、思考 | 你 |
| 知识库 | 资源库/技术手册/技能树 | 你 |
| 待办日历 | Markdown 写待办，日历视图展示 | 你 + CalendarTodo 组件 |

可选扩展：`raw/` + `wiki/` + `CLAUDE.md` 用于 AI 辅助消化大量资料，日常可不用。

### 为什么做这个
- 需要一个自己的地方写东西，不受平台限制
- 现有笔记散落在不同项目里（c51、computer vision、vscode/...），需要一个统一入口
- 想用 Obsidian 写、VitePress 看，双工具工作流

---

## 2. 物理架构

两个目录通过 `srcDir` 关联：

```
code/blog/                         ← 项目根（依赖、配置、文档）
  package.json                     ← npm run dev / build / preview
  .vitepress/                      ← VitePress 配置 + 主题 + Vue 组件
  index.html                       ← 仪表盘（双击打开）
  start-blog.bat                   ← 一键启动（打开仪表盘 + dev server）
  docs/                            ← 本文 + task.md + instructions.md
  node_modules/
  .gitignore
    │
    │ config.ts 中 srcDir: '../../OneDrive/obsidian/obsidian'
    ▼
C:\Users\33831\OneDrive\obsidian\obsidian\   ← 内容根 （Obsidian vault）
  index.md                         ← 博客首页
  knowledge/                       ← 你维护的知识库
  todo/                            ← 待办事项
  blog/                            ← 博客文章
  raw/                             ← 原始资料（只读，AI ingest 用）
  wiki/                            ← AI 精炼层（可选）
  CLAUDE.md                        ← AI 操作规范（可选）
  public/                          ← 静态资源
```

### VitePress 构建链路
```
你在 Obsidian 编辑 *.md
    → 保存到 vault
    → VitePress dev server 热更新（localhost:5173）
    → npm run build 生成静态文件到 .vitepress/dist/
```

### Obsidian 配置（.obsidian/）
- `app.json`：附件路径 `raw/assets/`，使用 Markdown 标准链接格式
- `core-plugins.json`：启用了文件浏览、搜索、图谱、反向链接、日记、模板等

---

## 3. 各目录详细说明

### 3.1 knowledge/ —— 知识库（你维护）
| 子目录 | 用途 | 示例内容 |
|---|---|---|
| resource-library/ | 资源收藏 | 数据集索引、工具推荐、书单 |
| tech-manual/ | 技术手册 | Git 速查、Docker 命令、排错日志 |
| skill-tree/ | 技能树 | 嵌入式/CV/Web 学习路线 |
| inbox/ | 草稿/待整理 | 旧笔记迁移暂存，VitePress 构建时会跳过 |

### 3.2 todo/ —— 待办日历
- 格式：`- [ ] 任务描述 @2026-06-01`
- 按月分文件：`2026-05.md`、`2026-06.md`
- CalendarTodo.vue 组件解析这些文件，渲染月视图

### 3.3 blog/ —— 博客
- 每篇博文一个 `.md` 文件
- 列表页 + 内容页

### 3.4 raw/ + wiki/ + CLAUDE.md（可选）
当需要 AI 消化大量资料时启用：
- `raw/`：放原始资料（文章、PDF），AI 只读不写
- `wiki/`：AI 维护的精炼知识（entities、concepts、sources、analyses）
- `CLAUDE.md`：定义 AI 的操作规范

日常不用管这几层，放着不影响。

---

## 4. CalendarTodo 组件

月视图日历表格，挂载在 `todo/index.md` 中。

**数据流**：
```
todo/*.md  →  正则解析 `- [x] 描述 @日期`  →  CalendarTodo.vue
```

**当前状态**：组件已渲染，但待办数据是硬编码空数组，尚未接入真实 .md 解析。

---

## 5. 技术选型

| 层 | 选型 | 原因 |
|---|---|---|
| 静态站 | VitePress 1.x | Markdown → HTML，自带搜索/导航/主题 |
| 自定义组件 | Vue 3 (Composition API) | 日历组件需要动态交互 |
| 编辑器 | Obsidian | 本地优先，Markdown 原生支持，插件丰富 |
| 包管理 | npm | 环境已有 |
| 版本管理 | Git | 已在工作区根目录 |

---

## 6. 设计原则

1. **你控制内容**：knowledge/、todo/、blog/ 完全由你编辑，AI 不碰
2. **内容即文件**：所有内容都是 `.md`，可迁移、可版本管理
3. **渐进增强**：先跑通核心（博客 + 待办），再按需扩展
4. **最少依赖**：只装 vitepress 一个运行时依赖
5. **文档驱动**：AI 改代码前读设计文档，改后更新

---

## 7. 源码管理

### 仓库结构
独立 git 仓库，单库单项目：

```
code/blog/   ← git 仓库
├── 上传: .vitepress/  docs/  index.html  start-blog.bat  package.json  .gitignore
├── 不上传: node_modules/  .vitepress/dist/  .vitepress/cache/
└── vault（内容）由 OneDrive 同步，不入 git
```

### 安全注意事项
- 公开仓库前检查 `index.html` 和 `.vitepress/config.ts` 中是否有本地路径、用户名
- `.vitepress/config.ts` 中的 `srcDir` 已是相对路径，无个人信息
- `socialLinks` 的 GitHub 链接需替换为真实仓库地址

### 工作流
```
git add .
git commit -m "描述"
git push origin main
```

---

## 8. 开放问题

- [ ] CalendarTodo 尚未接入真实的待办解析器
- [ ] 是否需要标签系统（跨 knowledge/ + blog/ 统一搜索）
- [ ] 待办日历是否需要支持按标签筛选
