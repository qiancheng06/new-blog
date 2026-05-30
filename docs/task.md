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
| P5 | 待办解析器（CalendarTodo.vue 接入真实数据） | 目前 calendar.html 已有数据，但 VitePress 的 CalendarTodo 组件还是空壳 |
| P5 | 内容填充 | 写博客文章 + 整理 inbox 笔记 + 知识库结构调整 |
| P5 | 手机端快捷备忘 | 见 roadmap.md #? |
| P6 | 上线实施 | Cloudflare Tunnel + Access 配置，见 `deploy.md` |

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

### P5.enhance-css 🎨 ✅

### P5.fix-base-path 🛠️ ✅

### P5.tailwind-remove ⚡ ✅

**问题**: 3 个独立 HTML 页面加载 Tailwind Play CDN（`cdn.tailwindcss.com`），每次页面加载扫描全页生成 3MB+ CSS，首屏卡顿 1-3s。

**解决**: 移除所有 HTML 页面的 CDN 引用。三个页面全部使用内联 CSS，无一外部依赖，打开即渲染。

### P5.nav-path-fix 🧭 ✅

**问题**: `base: './'` 导致 VitePress 导航链接变为相对路径（`./knowledge/`），从子目录（如 `/projects/`）点击时路径叠加为 `/projects/knowledge/`。

**解决**: 移除 `base: './'`（默认 `/`），VitePress 页面必须通过 HTTP 访问。独立 HTML 页面链接改为动态检测 dev server。

### P5.progress-expand 📋 ✅

**改进 ProgressDashboard.vue**:
- [x] 卡片点击展开/收起详情面板（带动画）
- [x] 详情内可编辑：状态/优先级下拉选择
- [x] 详情内可编辑：勾选/添加/删除任务
- [x] localStorage 持久化编辑数据
- [x] 进度条颜色跟随状态变化

### P5.hero-btn 🔘 ✅

在 VitePress 首页 Hero 按钮区添加"🚀 项目进度"按钮，指向 `/projects/`。

### P5.start-batch 🚀 ✅

**问题**: startup 脚本先开浏览器再起 dev server，导致连接失败；关闭窗口后后台进程残留。

**解决**: 
- 后台进程最小化启动
- 轮询检测 `localhost:5173` 就绪后再开浏览器
- 仅打开一个浏览器标签页
- 按任意键后自动 `taskkill` 清理后台进程

**问题**: 从 `index.html` (file:// 协议) 点击链接打开 `.vitepress/dist/` 下的 VitePress 页面时，CSS/JS 加载失败，页面无样式。

**原因**: VitePress 默认 `base: '/'`，构建产物使用绝对路径 `/assets/style.xxx.css`，file:// 下无法解析。

**解决**: 
- 尝试 `.vitepress/config.ts` 设置 `base: './'` → **导致导航路径叠加 bug**（`/projects/` 点知识库变为 `/projects/knowledge/`）
- **根本原因**: VitePress 使用 ES Module (`<script type="module">`)，file:// 协议下浏览器禁止加载（CORS 安全策略），路径改相对也没用
- **最终方案**: 不设 `base`（默认 `/`），VitePress 页面必须通过 `npm run dev` 的 HTTP 服务访问。`index.html` 内的链接动态检测 dev server，可用时指向 `localhost:5173`，否则灰显提示
- **教训**: `base: './'` 虽让 dist 用相对路径，但与 VitePress SPA 路由不兼容，导航链接会从子目录出发展开异常

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
