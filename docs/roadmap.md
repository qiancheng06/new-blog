# 需求路线图

> 按时间顺序记录需求，只增不改。已解决的需求可标记 ✅。
> 
> AI 每轮非 debug 对话都必须在此文档末尾追加：
> 1. 用户的需求描述
> 2. AI 的方案想法
> 3. 状态（待讨论 / 已确认 / 进行中 / ✅ / ❌）

---

## 需求列表

| # | 日期 | 需求 | AI 方案/想法 | 状态 |
|---|------|------|-------------|------|
| 1 | 2026-05-31 | 搭建本地博客 + 知识库 + 待办系统 | VitePress + Obsidian 双工具，vault 做 srcDir，`code/blog/` 做项目根 | ✅ |
| 2 | 2026-05-31 | 知识库三层分类（资源库/技术手册/技能树） | KnowledgeCard 组件 + 侧边栏嵌套导航 + vault 目录结构 | ✅ |
| 3 | 2026-05-31 | 待办日历月视图 | CalendarTodo.vue（Vue 3 月视图表格，挂载在 todo/index.md） | ✅ |
| 4 | 2026-05-31 | 仪表盘不依赖 VitePress | 独立 `index.html`（纯 HTML+CSS+JS，file:// 可打开） | ✅ |
| 5 | 2026-05-31 | code 目录重组 | `learn/` + `projects/` + `tools/` + `archive/` 四层结构 | ✅ |
| 6 | 2026-05-31 | 项目进度看板 | ProgressDashboard.vue + `projects/*.md` + 内嵌数据 | ✅ |
| 7 | 2026-05-31 | 深色科技风主题 | `custom.css` 重构，`appearance: dark` | ✅ |
| 8 | 2026-05-31 | 点击项目查看详情 | `detail.html#hash` 独立详情页，按阶段分组展示 | ✅ |
| 9 | 2026-05-31 | 直接在页面内编辑进度 | detail.html 内联编辑（勾选/添加/删除），localStorage 持久化 | ✅ |
| 10 | 2026-05-31 | 编辑后同步到源代码 | `sync-projects.js` 脚本，解析 `projects/*.md` → 更新 HTML 内嵌数据 | ✅ |
| 11 | 2026-05-31 | 知识库速览改为分类聚合卡片 | 资源库/技术手册/技能树/收件箱 2×2 网格，技能树带进度条 | ✅ |
| 12 | 2026-05-31 | 移除工作区模块 | 功能与项目进度重叠，直接删除 | ✅ |
| 13 | 2026-05-31 | 今日待办整合到仪表盘顶部 | 从 vault/todo/ 同步 TODO_DATA，显示今日/逾期/近期待办 | ✅ |
| 14 | 2026-05-31 | 文件自动监听同步 | `fs.watch` + `scripts/watch.js`，改 .md 自动更新 HTML | ✅ |
| 15 | 2026-05-31 | 点击今日待办弹出日历月视图 | `calendar.html` 独立页面，TODO_DATA 内嵌，月份切换 + 日期点击查看任务 | ✅ |
| 16 | 2026-05-31 | 创建 roadmap.md，完善所有 docs | 只增不改的需求文档 + 更新 design/task/instructions 至最新状态 | ✅ |
| 17 | 2026-05-31 | 知识库全量页面创建（10 个新页） | tech-manual: ros/yolo/opencv/pure-pursuit/matlab/c51/esp32/5g; skill-tree: ros; resource: ros-resources | ✅ |
| 18 | 2026-05-31 | 修复构建失败（srcDir / node_modules / sidebar 重复） | srcDir+1、vault node_modules 联结、sidebar 去重、lastUpdated:false、ProgressDashboard 解析修复 | ✅ |
| 19 | 2026-05-31 | 知识数据自动同步到仪表盘 | sync-projects.js 扫描 vault/knowledge/ → KNOWLEDGE_DATA；watch.js 监听 knowledge/ | ✅ |
| 20 | 2026-05-31 | 博客导航页面 + Tailwind CDN | 清理 vault/blog/ 脏文件，博客首页改为 hero 布局；三 HTML 页引入 Tailwind CDN | ✅ |
| 21 | 2026-05-31 | CSS 修复 + 项目整理 + README | custom.css 变量从 :root 改为 html.dark；整理目录结构去重；新增 README.md | ✅ |

---

## 📝 待讨论需求

> 用户在此区域直接写入需求，每条用 `### #序号` 分隔。
> AI 在下方用 `> AI 想法：` 回应，并在末尾标注状态。

---

### #17

> **需求：**
> 
> **AI 想法：**
> 
> **状态：** 待讨论
