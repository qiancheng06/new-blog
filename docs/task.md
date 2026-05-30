# 任务文档

> 记录执行过程、关键决策、经验教训。
> 换 AI 时让新 AI 读此文档快速上手。

---

## 已完成

### P0 项目建设 ✅
- 创建 blog 目录结构（.vitepress/ + docs/ + projects/ + index.html）
- 创建 vault 结构（knowledge/ + todo/ + blog/ + raw/ + wiki/）
- VitePress 配置（config/theme/组件注册）
- 知识卡片 KnowledgeCard.vue
- 待办日历组件 CalendarTodo.vue

### P1 站点基建 ✅
- 深色科技风主题（custom.css + appearance: dark）
- Git 初始化 + GitHub 推送（qiancheng06/new-blog）
- code 目录重组（learn/projects/tools/archive）
- docs 三份文档（design + task + instructions）

### P2 项目进度系统 ✅
- `projects/*.md` 格式定义（frontmatter + ## 阶段 + - [x] 任务）
- ProgressDashboard.vue（VitePress 端）
- 内联进度展示（index.html vanilla JS）
- 状态筛选 + 优先级排序
- 阶段分组展示
- 独立详情页 detail.html#hash
- 卡片摘要视图（主页概览 → 点击进详情）
- 详情页内联编辑（localStorage 持久化）
- 快速添加/删除任务
- 导出为 .md + 重置功能

### P3 待办同步系统 ✅
- sync-projects.js：解析 `projects/*.md` + `vault/todo/*.md`
- 三文件数据同步（index.html + detail.html + calendar.html）
- 文件自动监听（scripts/watch.js + fs.watch）
- npm scripts 集成（dev/build/watch 自动先同步）
- start-blog.bat 一键启动（dev server + 监听 + 仪表盘）

### P4 仪表盘优化 ✅
- 移除工作区模块
- 今日待办插入页面顶部
- 知识库改为分类聚合卡片（2×2网格 + 技能树进度条）
- 日历独立页面 calendar.html（月视图 + 日期点击 + 任务详情）

---

## 待完成

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P4 | VitePress 页面美化 | 统一 `.vitepress/dist/` 下 34 个页面与独立 HTML 的暗色科技风 → P5.enhance-css |
| P5 | 待办解析器（CalendarTodo.vue 接入真实数据） | 目前 calendar.html 已有数据，但 VitePress 的 CalendarTodo 组件还是空壳 |
| P5 | 内容填充 | 写博客文章 + 整理 inbox 笔记 |
| P5 | 手机端快捷备忘 | 见 roadmap.md #? |
| P6 | 上线部署 | 方案已定：Cloudflare Tunnel + Access，见 `deploy.md` 和 `design.md §9` |

### P6.online-deploy 🚀

**决策**: Cloudflare Tunnel + Access（免费，无需公网 IP，自带鉴权）

**原因**:
- 仓库 private，vault 内容不上传
- 无公网 IP，VPS 额外花钱
- Cloudflare Access 自带 OAuth 鉴权（Google/GitHub 登录）
- 不暴露任何服务器端口

**产出**:
- `deploy.md` — 完整部署方案文档（根目录）
- `design.md §9` — 更新为当前方案
- 待实施：配置 Tunnel + Access + 去除 filePath 泄露

### P5.enhance-css 🎨

**目标**: 大幅增强 `.vitepress/theme/custom.css`，使 `.vitepress/dist/` 下所有 VitePress 页面具有与 index.html / calendar.html / detail.html 一致的暗色科技风视觉体验。

**关键任务**:
- [x] 统一 CSS 变量体系（与 index.html 的 `:root` 对齐）
- [x] 添加毛玻璃导航栏（backdrop-filter + 半透明背景）
- [x] 完善侧边栏样式（hover / active 状态 + 圆角）
- [x] 内容页卡片化（.vp-doc 内表格/代码块/引用块统一风格）
- [x] 首页 hero 区域增强（渐变标题 + 按钮动效）
- [x] 进度条动画 + 项目卡片悬停效果
- [x] 自定义块（tip/warning/danger）美化
- [x] 滚动条统一风格
- [x] 分页导航（prev/next）美化
- [x] 移动端自适应

### P5.fix-base-path 🛠️

**问题**: 从 `index.html` (file:// 协议) 点击链接打开 `.vitepress/dist/` 下的 VitePress 页面时，CSS/JS 加载失败，页面无样式。

**原因**: VitePress 默认 `base: '/'`，构建产物使用绝对路径 `/assets/style.xxx.css`，file:// 下无法解析。

**解决**: 
- `.vitepress/config.ts` 设置 `base: './'`，构建后所有资源路径变为 `./assets/...`
- **但核心问题不在路径！** VitePress 使用 ES Module (`<script type="module">`)，file:// 协议下浏览器禁止加载 ES Module（CORS 安全策略）。这是浏览器层面的硬限制，无法绕过。
- **真正解决方案**: `index.html` 内的链接改为动态检测，当 `localhost:5173` 可用时指向开发服务器，否则显示提示信息。
  - Header 按钮：指向 `http://localhost:5173/knowledge/` 等
  - 知识卡片链接：检测到服务器后用 `http://localhost:5173/` 替换 `.vitepress/dist/`
  - 待办日历链接：同上
  - 服务器不可用时：链接变灰 + 显示"请运行 npm run dev"提示

---

## 关键决策

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-05-30 | VitePress + Obsidian | VitePress 免费可定制，Obsidian 写 Markdown 体验好 |
| 2026-05-30 | vault 做内容源（srcDir） | Obsidian 直接编辑，无需同步步骤 |
| 2026-05-30 | 相对路径 srcDir | Windows 绝对路径导致 vitepress module resolve 失败 |
| 2026-05-30 | index.html 不依赖 VitePress | file:// 协议下 ES Module 无法加载 |
| 2026-05-31 | 项目进度数据内嵌 HTML + localStorage | 支持 file:// 离线查看 + 浏览器持久化编辑 |
| 2026-05-31 | 文件监听自动同步 | 改 .md 自动更新 HTML，无需手动触发 |
| 2026-05-31 | TODO_DATA 同步到三文件 | index.html / detail.html / calendar.html 共用同一份待办数据 |

---

## 技术踩坑

| 问题 | 原因 | 解决 |
|------|------|------|
| VitePress build 报 `Cannot find module vitepress` | .vitepress/ 放 vault 里，module resolve 从 vault 开始找不到 node_modules | .vitepress/ 放 code/blog/，用 srcDir 指向 vault |
| 仪表盘链接在 file:// 下打不开 | VitePress 产物用 ES Module，file:// 有 CORS 限制 | 推荐 `npm run dev` 用 localhost 访问 |
| sync-projects.js 缺少数组括号 `]` | replaceBlock 只加了 `[` 没加 `]` | 改为 `];` 闭合 |
| TODO_DATA 缺少 `const` 声明 | replaceBlockRaw 没加变量声明前缀 | 加上 `const TODO_DATA = ` |
| 项目 ID 不匹配（中文 vs 英文） | idFromName 用中文名，index.html 用英文硬编码 | 改用文件名做 ID（blog.md → 'blog'） |
