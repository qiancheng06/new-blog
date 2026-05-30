# 任务文档

> 记录执行过程、关键决策、经验教训。
> 换 AI 时让新 AI 读此文档快速上手。

---

## 已完成

### P0 项目建设 ✅
- 创建 blog 目录：docs/、.vitepress/（config + theme + CalendarTodo + KnowledgeCard + custom.css）
- 创建 vault 结构：knowledge/、todo/、blog/、raw/、wiki/、CLAUDE.md
- 配置成功：package.json → scripts 指向 `.`（当前目录），srcDir 指向 vault
- 构建验证：`npm run build` 通过 ✅
- 仪表盘：`index.html` 列表项目 + 博客快速入口
- 启动脚本：`start-blog.bat` 打开仪表盘 + dev server

### P1 Obsidian 连接 ✅
- vault 路径：`C:\Users\33831\OneDrive\obsidian\obsidian\`
- .obsidian/app.json：附件 → `raw/assets/`，Markdown 链接格式
- .obsidian/core-plugins.json：启用了常用插件

### P2 Git 设置 ✅
- [x] 根 `.gitignore` 添加 `blog/` 阻止父仓库追踪
- [x] `code/blog/` 独立 git 仓库初始化
- [x] 修复 `index.html` 中 vault 路径暴露
- [x] 添加 GitHub 链接到仪表盘和 VitePress 导航
- [x] docs 三份文档补充 git 管理说明
- [x] 首次 commit 完成

### P3 LLM Wiki 扩展 ✅
- 采纳 Karpathy 方法论，创建 raw/、wiki/、CLAUDE.md
- 三份文档已更新适配

---

## 待完成

| 优先级 | 任务 | 说明 |
|---|---|---|
| P3 | 实现待办解析器 | CalendarTodo 现在硬编码空数据，需解析 todo/*.md 中 `- [ ] @日期` 格式 |
| P3 | 替换 GitHub URL 占位符 | 创建远程仓库后更新 `.vitepress/config.ts` 和 `index.html` 中的链接 |
| P4 | 内容填充 | 把 knowledge/ 下的模板页填充真实内容 |
| P4 | 迁移旧笔记 | 把 `code/` 下各项目的 .md 笔记逐步整理进 knowledge/ |
| P5 | Web Clipper | 可选配置，浏览器剪藏到 raw/ |
| P5 | wiki Ingest | 可选，让 AI 消化 raw/ 里的资料 |

---

## 关键决策

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-05-30 | VitePress + Obsidian | VitePress 免费可定制，Obsidian 写 Markdown 体验好 |
| 2026-05-30 | vault 做内容源（srcDir） | Obsidian 直接编辑，无需同步步骤 |
| 2026-05-30 | 相对路径 srcDir | Windows 绝对路径导致 vitepress module resolve 失败 |
| 2026-05-30 | 保留 LLM Wiki 层但降级为可选 | 核心是个人博客系统，不是 AI 知识库 |
| 2026-05-30 | index.html 不依赖 VitePress | file:// 协议下 ES Module 无法加载，仪表盘和博客独立 |

---

## 技术踩坑

| 问题 | 原因 | 解决 |
|---|---|---|
| VitePress build 报 `Cannot find module vitepress` | 把 .vitepress/ 放 vault 里了，module resolve 从 vault 目录开始找不到 node_modules | .vitepress/ 放 code/blog/，用 srcDir 指向 vault |
| 仪表盘链接在 file:// 下打不开 | VitePress 产物用 ES Module，file:// 有 CORS 限制 | 推荐 `npm run dev` 用 localhost 访问 |
