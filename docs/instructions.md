# 说明文档

> 面向开发者（你）和 AI。澄清事实，避免误解。

---

## 1. 快速命令

所有命令在 `code/blog/` 下执行：

```bash
npm run dev        # 启动开发服务器 → http://localhost:5173
npm run build      # 构建静态站点 → .vitepress/dist/
npm run preview    # 预览构建结果
```

双击 `index.html` 打开工作区仪表盘（不依赖服务器，但不支持 VitePress 页面）。
双击 `start-blog.bat` 一键启动（打开仪表盘 + dev server + 浏览器）。

---

## 2. Git 管理

```bash
# 仓库在 code/blog/
git status                    # 查看变更
git diff                      # 查看具体改动
git add .                     # 暂存所有
git commit -m "feat: 描述"     # 提交
git push origin main          # 推送到远程
```

### 不上传的内容
- `node_modules/` — 依赖
- `.vitepress/dist/` — 构建产物
- `.vitepress/cache/` — 缓存
- vault（内容本体在 OneDrive，不入 git）

### 公开前检查清单
- [ ] `index.html` 和 `config.ts` 无本地路径/用户名
- [ ] `socialLinks` 是真实的仓库地址
- [ ] 根目录 `.gitignore` 已添加 `blog/`

---

## 3. 内容在哪

所有内容在 `C:\Users\33831\OneDrive\obsidian\obsidian\`（即 Obsidian vault）。

| 目录 | 用途 | 编辑方式 |
|---|---|---|
| `knowledge/` | 知识库（资源库/技术手册/技能树） | Obsidian 或 VS Code |
| `todo/` | 待办事项（CalendarTodo 组件读取展示） | Obsidian，格式见下方 |
| `blog/` | 博客文章 | Obsidian |
| `raw/` | 原始资料（可选，给 AI ingest 用） | Web Clipper 或手动拖入 |
| `wiki/` | AI 精炼知识（可选） | AI 通过 CLAUDE.md 驱动 |

---

## 3. 待办格式

```markdown
## 2026-06-01

- [ ] 学习 Vue 3 组合式 API @2026-06-01
- [x] 已完成任务 @2026-05-30
```

按月分文件：`todo/2026-05.md`、`todo/2026-06.md`

---

## 4. 链接格式

```markdown
# ✅ 兼容 Obsidian + VitePress
[描述](path.md)

# ❌ 仅 Obsidian 支持
[[wikilink]]
```

---

## 5. AI 协作规范

### AI 工作流程

每次会话开始，按顺序读：
1. `docs/design.md` —— 理解项目架构
2. `docs/task.md` —— 了解进度和遗留问题
3. `docs/instructions.md` —— 了解约定
4. （如涉及 wiki）`vault/CLAUDE.md` → `vault/wiki/index.md` → `vault/wiki/log.md`

规划 → 写入 task.md 方案 → 用户确认 → 执行 → 更新 task.md

### AI 禁止事项

- 引入未在本项目使用的框架/库
- 提交代码到 Git（除非用户明确要求）
- 修改 `.obsidian/` 配置（除非用户要求）

### AI 注意事项

- 每次修改代码前重新读 design.md
- 修改代码后如有必要更新 design.md
- 遇到模糊需求在 design.md 的"开放问题"区提问等待用户回复

---

## 6. 文件引用关系

```
index.html (仪表盘)
  → 按钮链接到 .vitepress/dist/ 下的构建产物
  → dev server 检测：自动监测 localhost:5173

CalendarTodo.vue
  → 挂载在 todo/index.md 中
  → 数据源：todo/*.md（当前暂未接入真实解析器）

.vitepress/config.ts
  → srcDir 指向 vault（内容源）
  → nav/sidebar 定义导航结构
  → search: local（全文搜索）
  → srcExclude: knowledge/inbox/**（草稿不参与构建）
```
