# 说明文档

> 面向开发者（你）和 AI。澄清事实，避免误解。

---

## 1. 快速命令

所有命令在 `code/projects/blog/` 下执行：

```bash
npm run dev        # 先同步 → 启动 VitePress dev server → http://localhost:5173
npm run build      # 先同步 → 构建静态站点 → .vitepress/dist/
npm run watch      # 后台监听文件变更，自动同步内嵌数据
npm run sync       # 手动同步一次（解析 projects/.md + vault/todo/.md + vault/knowledge/.md）
npm run preview    # 预览构建结果
```

双击 `index.html` 打开仪表盘（file:// 兼容，不依赖服务器）。
双击 `start-blog.bat` 一键启动（dev server + 文件监听 + 仪表盘）。

---

## 2. 页面清单

| 页面 | 路径 | 如何打开 |
|------|------|----------|
| 主仪表盘 | `index.html` | 双击 / `start-blog.bat` |
| 项目详情 + 编辑 | `detail.html#项目ID` | 点击看板卡片 / 直接打开 |
| 日历月视图 | `calendar.html` | 点击仪表盘"📅 今日待办"标题 |
| 项目详情完整版 | VitePress `/projects/` | `npm run dev` → 打开浏览器 |
| VitePress 站点 | `localhost:5173` | `npm run dev` |
| 构建产物 | `.vitepress/dist/` | `npm run build` 后双击各 .html |

---

## 3. 项目结构

```
code/projects/blog/
├── .vitepress/            VitePress 配置 + 暗色主题 + Vue 组件
│   ├── config.ts
│   ├── theme/custom.css
│   └── theme/components/  CalendarTodo / KnowledgeCard / ProgressDashboard
├── docs/                  项目文档（详见各自文件头说明）
├── projects/              项目进度 .md 文件
├── scripts/               sync-projects.js + watch.js
├── index.html             主仪表盘
├── detail.html            项目详情 + 编辑
├── calendar.html          待办日历
├── README.md              项目介绍
└── package.json
```

---

## 4. Git 管理

```bash
git status                    # 查看变更
git diff                      # 查看具体改动
git add .                     # 暂存所有
git commit -m "feat: 描述"     # 提交
git push origin main          # 推送到远程
```

### 不上传的内容
- `node_modules/`
- `.vitepress/dist/` + `.vitepress/cache/`
- vault（内容本体在 OneDrive）

---

## 4. 数据编辑方式

| 想改什么 | 方式 |
|----------|------|
| **项目进度**（浏览器内） | `detail.html#ID` → 点"编辑" → 勾选/添加/删除 → 自动保存到浏览器 |
| **项目进度**（源文件） | 改 `projects/*.md` → 自动监听触发同步 |
| **待办事项** | 改 `vault/todo/*.md` → 自动监听触发同步 |
| **知识库内容** | 改 `vault/knowledge/*.md`（Obsidian 编辑） |
| **仪表盘布局** | 改 `index.html` |
| **同步到源代码** | 编辑完成后点"导出为 .md" → 覆盖 `projects/*.md` |

### 重置

详情页点"重置"清除 localStorage，恢复到内嵌数据。

---

## 5. AI 协作规范

### AI 工作流程

每次会话开始，按顺序读：
1. `docs/roadmap.md` —— 了解需求历史和当前状态
2. `docs/design.md` —— 理解项目架构
3. `docs/task.md` —— 了解进度和遗留问题
4. `docs/instructions.md` —— 了解约定

每轮非 debug 对话必须在 **roadmap.md 末尾追加新需求记录**。

### AI 禁止事项

- 引入未在本项目使用的框架/库
- 修改 `.obsidian/` 配置（除非用户要求）
- 删除或修改 roadmap.md 已有内容（只增不改）

### AI 注意事项

- 每次修改代码前重新读 design.md
- 修改代码后如有必要更新 design.md
- 遇到模糊需求在 roadmap.md 追加条目等待用户回复
