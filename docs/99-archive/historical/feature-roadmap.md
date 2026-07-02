<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

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
| 22 | 2026-05-31 | VitePress 页面暗色科技风美化 | 玻璃导航、侧边栏圆角、表格/代码块/引用块美颜、响应式适配 | ✅ |
| 23 | 2026-05-31 | 移除 Tailwind CDN 提升性能 | 删掉 `cdn.tailwindcss.com`，三个 HTML 页面全部内联 CSS，消除 1-3s 首屏卡顿 | ✅ |
| 24 | 2026-05-31 | 修复导航路径叠加 bug | 移除 `base: './'`，恢复绝对路径导航 | ✅ |
| 25 | 2026-05-31 | 项目看板卡片可展开编辑 | 点击卡片展开详情，状态/优先级下拉选择，任务勾选/添加/删除，localStorage 持久化 | ✅ |
| 26 | 2026-05-31 | 首页 Hero 加项目进度按钮 | 首页 Hero 按钮区新增"🚀 项目进度"，指向 `/projects/` | ✅ |
| 27 | 2026-05-31 | 上线方案文档 | `deploy.md`（Cloudflare Tunnel + Access 完整方案）| ✅ |
| 28 | 2026-05-31 | 启动脚本优化 | 等待服务器就绪再开浏览器，闭环杀后台进程 | ✅ |
| 29 | 2026-06-01 | 项目重命名为"个人工作台" | 更新 VitePress title/description、三 HTML 页 title、README、package.json、start-blog.bat、design.md | ✅ |
| 30 | 2026-06-01 | 博客页面清理 + 生成示例文章 | 删掉知识库链接，生成 Pure Pursuit 落地之旅，改为列表布局 | ✅ |
| 31 | 2026-06-01 | 博客加标签索引 | blog/tags.md 标签分组，文章顶部 + 列表显示 badge | ✅ |
| 32 | 2026-06-01 | Obsidian 加文件自动同步到网页 | sync-projects.js 扫描 blog/ 生成文章列表、标签、侧边栏；watch.js 加 blog/ 监听 | ✅ |
| 33 | 2026-06-01 | 增加白色主题 | VitePress 端 appearance:true + 浅色 CSS；三 HTML 页加 light 切换 + localStorage 记忆 | ✅ |
| 34 | 2026-06-01 | 博客侧边栏显示所有文章 | sync-projects.js 自动更新 config.ts 的 SIDEBAR:BLOG 区块 | ✅ |
| 35 | 2026-06-01 | 侧边栏与文章无明显分界 | 去掉折叠、DeepSeek 风格（不同背景色替代边框） | ❌ |
| 36 | 2026-06-01 | 侧边栏偏宽、布局不够靠边 | 缩窄至 220px，扩宽布局至 1440px，正文至 960px | ❌ |
| 37 | 2026-06-01 | 仿 DeepSeek 官方侧边栏，分「博客搭建」+「智能车」两组，可分别折叠 | 1. sync-projects.js 按标签分类生成 collapsible sidebar；2. custom.css 仿 DeepSeek 可折叠分组样式（显示 caret、分组标题、分隔线、暗色背景区分）；3. 修复 parseFrontmatter 支持 YAML 多行列表 | ✅ |
| 38 | 2026-06-01 | 太窄了，文字显示被遮挡 | 加宽侧边栏 220→260px，添加 overflow/text-overflow/white-space | ✅ |
| 39 | 2026-06-01 | 侧边栏文字未靠边 | 减 padding/margin 靠边 | ❌ |
| 40 | 2026-06-01 | 文字显示不全 | 移除单行截断改为 word-break 多行换行 | ✅ |
| 41 | 2026-06-09 | 制定多端协同信息管道的远期规划，明确 AI 是系统大脑 | 新增 `docs/long-term-plan.md`：定义 Persona OS、四认知回路（Companion/Researcher/Archivist/Critic）、多端协同、记忆分层、12 个月阶段路线、风险与 KPI | 已确认 |
| 42 | 2026-06-09 | 对远期规划做架构级修订：认知层与 LLM 解耦、加入 Goals 与主动洞察 | 更新 `docs/long-term-plan.md` 到 v1.1：将“大脑”定义为 Cognitive Layer（Memory+Persona+Workflow+Reasoning），新增 Insight Engine、Engagement Layer、Goals 记忆层、认知连续性指标，并强调逻辑四回路/物理单回路 | 已确认 |


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

### #29

> **需求：** 项目重命名为"个人工作台"（原名 blog / My Blog / 知识库 均不够全面）
>
> **AI 想法：** 已全面更新页面标题（VitePress title/description、三个 HTML 页面 title）、README、package.json、start-blog.bat、design.md 中的项目描述
>
> **状态：** ✅

### #30

> **需求：** 博客页面不要 ROS 速查等技术手册，要写技术感想，生成一篇示例文章
>
> **AI 想法：** 生成了 Pure Pursuit 落地之旅，清理 blog/index.md 的知识库链接
>
> **状态：** ✅

### #31

> **需求：** 加标签索引
>
> **AI 想法：** 创建 blog/tags.md，文章顶部 + 列表显示标签 badge
>
> **状态：** ✅

### #32

> **需求：** Obsidian 加文件要及时更新到网页
>
> **AI 想法：** 扩展 sync-projects.js 自动扫描 blog/，生成文章列表、标签索引、侧边栏；watch.js 加 blog/ 监听
>
> **状态：** ✅

### #33

> **需求：** 增加白色主题
>
> **AI 想法：** VitePress 端 appearance:true + 浅色 CSS 变量；三个 HTML 页面加 light class 切换 + localStorage 记忆
>
> **状态：** ✅

### #34

> **需求：** 博客侧边栏显示所有博客
>
> **AI 想法：** sync-projects.js 自动更新 config.ts 的 SIDEBAR:BLOG 区块
>
> **状态：** ✅

### #35

> **需求：** 侧边栏与文章没有明显分界
>
> **AI 想法：** 去掉折叠、改用 DeepSeek 风格侧边栏（不同背景色代替边框）
>
> **状态：** ❌

### #36

> **需求：** 左侧边栏以及个人工作台这些可以再靠边，侧边栏还是略宽
>
> **AI 想法：** 缩窄侧边栏至 220px，扩宽布局至 1440px，正文至 960px
>
> **状态：** ❌

### #37

> **需求：** 解决侧边栏问题，仿 DeepSeek 官方页面，内容分「博客搭建」和「智能车」两部分，可分别折叠
>
> **AI 想法：**
> - sync-projects.js 的 genSidebarBlock() 按标签分类（buildingTags: VitePress/Obsidian/前端/Vue/Node.js/CSS 等；carTags: ROS/智能车/控制算法/嵌入式），生成 `collapsed: false` 的两组可折叠 sidebar
> - custom.css 改为 DeepSeek 风格：显示 caret 图标（旋转动画）、分组标题加粗加大、子项缩进、分组间分隔线、sidebar 用 --sidebar-bg 暗色背景与内容区区分
> - 修复 parseFrontmatter 支持 YAML 多行列表格式（`tags:\n  - 智能车`），之前「智能车赛道初体验」因 tags 解析失败被归入 uncategorized
> - sidebar 缩窄至 220px，布局扩宽至 1440px，正文至 960px
>
> **状态：** ✅

### #41

> **需求：** 先新建一个远期规划方案书；并明确 AI 不是可替换组件，而是系统大脑
>
> **AI 想法：** 新建 `docs/long-term-plan.md` 作为专项方案书，采用 Persona OS 视角：以 AI 大脑为中枢，外围由多端入口、编排层、记忆层、任务执行层协同；规划分为 0-12 个月四阶段，先验证长期价值，再扩展多端和多模型。
>
> **状态：** 已确认

### #42

> **需求：** 审阅规划书并提出架构修订意见，重点包括：大脑定义、四回路实现方式、Goals、主动洞察、输入衰减风险与认知连续性指标
>
> **AI 想法：** 已吸收并落地到 `docs/long-term-plan.md` v1.1：
> - 将“AI=大脑”修正为“Cognitive Layer=大脑，LLM 为推理引擎”
> - 保留 Companion/Researcher/Critic，但改为“逻辑四回路、物理单回路”首版策略
> - 记忆层新增 `goals`，用于方向锚定，避免 timeline 流水账化
> - 新增 `Insight Engine`（主动发现异常/迁移/偏离）
> - 新增 `Engagement Layer`，把“输入衰减”上升为最高优先风险
> - KPI 新增“认知连续性指标”，强调长期解释力
>
> **状态：** 已确认
