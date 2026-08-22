# 说明文档

> 面向开发者（你）和 AI。澄清事实，避免误解。

Backend commands:

```bash
npm run dev:mock          # Start/reuse Workspace + Blog + Persona API for local demo
npm run dev:backend       # Start Persona OS API + Telegram Bot
npm run dev:backend:mock  # Start Persona OS API with mock LLM, no real model call
npm run smoke:api         # No-network API smoke test: /api/chat -> Event -> Memory
```

If `http://127.0.0.1:3001/api/status` returns 404, stop the old backend process and restart it with one of the backend commands above.

Current local demo rule: prefer `npm.cmd run dev:mock` for interactive Workspace testing. It starts or reuses `http://127.0.0.1:5173/`, `http://127.0.0.1:5175/`, and `http://127.0.0.1:3001`. The Windows launcher `apps/workspace/start-blog.bat` uses the same flow.

---

## 1. 快速命令

所有命令在 `code/projects/blog/` 下执行：

```bash
npm run dev        # 启动 Next.js Workspace → http://127.0.0.1:5173
npm run dev:blog   # 启动独立 Next.js Blog → http://127.0.0.1:5175
npm run build      # 构建 Next.js Workspace
npm run build:blog # 构建独立 Next.js Blog
npm run dev:content # 同步并启动私人 VitePress 内容站 → http://127.0.0.1:5174
npm run watch      # 后台监听文件变更，自动同步内嵌数据
npm run sync       # 手动同步一次（解析 apps/workspace/projects/*.md + vault/todo/*.md + vault/knowledge/*.md）
npm run dev:backend:mock # 本地 mock 后端，默认 http://127.0.0.1:3001，不连接 DeepSeek/Telegram
npm run preview    # 预览构建结果
npm run verify:local # 统一本地验证入口：后端构建 + API smoke + Workspace sync + 文档旧引用检查
```

PowerShell 如果提示禁止加载 `npm.ps1`，使用同等命令 `npm.cmd run dev` / `npm.cmd run build` / `npm.cmd run sync` / `npm.cmd run verify:local`。

Workspace 当前主入口是 `http://127.0.0.1:5173/`，通过 `npm.cmd run dev` 或 `npm.cmd run dev:mock` 提供。
双击 `apps/workspace/start-blog.bat` 一键启动本地 mock demo。它与 `npm.cmd run dev:mock` 使用同一流程：启动或复用 Workspace dev server 与 Persona mock API，然后打开端口入口。
如果 3001 已有旧后端进程，先停止旧窗口/进程再重启 mock 后端，避免浏览器仍命中旧响应。

当前入口只认 `apps/workspace/` 和 `apps/persona/src/`。根目录旧入口 `index.html` / `detail.html` / `calendar.html`、根目录 `scripts/`、根目录 `.vitepress/` 不再作为当前事实引用。

### 1.1 统一验证口径

默认验证入口：

```bash
npm.cmd run verify:local
```

默认验证包含：

- `npm.cmd run build:backend`：TypeScript 编译，验证 Persona 后端类型和模块边界。
- `npm.cmd run smoke:api`：无网络 API smoke，使用 mock LLM、临时本地端口，验证 `/api/chat`、事件写入、记忆补丁和 `/api/status`。
- `npm.cmd run sync`：执行 Workspace 数据同步脚本，验证当前本机可解析项目、todo、knowledge、blog 数据源。
- 当前文档旧引用检查：阻止旧根入口、旧 `localhost:*` 和旧数据库口径重新写回当前文档。

以下检查不属于默认验证，只有任务明确涉及或验收人拥有本机环境时才执行：

- `npm.cmd run dev:backend`：真实 Persona 后端，会读取本机环境变量并可能连接 Telegram/真实 LLM。
- `npm.cmd run dev` / `npm.cmd run preview` 的浏览器交互验收：需要本机端口、浏览器和人工点击确认。
- `npm.cmd run watch`：需要长驻进程和文件系统监听权限。
- Obsidian vault 内容完整性、OneDrive 路径、真实 vault 写入/同步：vault 在仓库外，不应作为 CI 或默认验证前提。

---

## 2. 页面清单

| 页面 | 路径 | 如何打开 |
|------|------|----------|
| Workspace 主入口 | `http://127.0.0.1:5173/` | `npm.cmd run dev` / `npm.cmd run dev:mock` |
| Legacy 仪表盘 | `apps/workspace/legacy/index.html` | 迁移兼容，不作为主入口 |
| Legacy 项目详情 + 编辑 | `apps/workspace/legacy/detail.html#项目ID` | 迁移兼容 |
| Legacy 日历月视图 | `apps/workspace/legacy/calendar.html` | 迁移兼容 |
| 项目详情完整版 | VitePress `/projects/` | `npm.cmd run dev:content` → 打开浏览器 |
| 私人 VitePress 站点 | `127.0.0.1:5174` | `npm.cmd run dev:content` |
| 公开博客 | 独立 Next.js Blog `/` | `npm.cmd run dev:blog` |
| Next.js 构建产物 | `apps/workspace/.next/` | `npm.cmd run build` 后启动 |

---

## 3. 项目结构

```
code/projects/blog/
├── apps/
│   ├── workspace/         Next.js Workspace + VitePress 私人内容站
│   ├── blog/              独立 Next.js 公开博客
│   └── persona/           Persona OS 后端
├── docs/                  项目文档（按架构域组织，入口见 docs/00-overview/README.md）
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
- `apps/workspace/.next/` + `apps/workspace/.vitepress/dist/` + `apps/workspace/.vitepress/cache/`
- vault（内容本体在 OneDrive）

---

## 4. 数据编辑方式

| 想改什么 | 方式 |
|----------|------|
| **项目进度**（运行时投影） | 工作台 `:5173` 或 Persona API（`apps/persona/src/application/projects.ts`）创建/变更，SQLite `projects` 为运行时投影 |
| **项目进度**（源文件） | 改 `apps/workspace/projects/*.md` → 自动监听触发同步（Obsidian/项目源 Markdown 仍是内容主库） |
| **待办事项** | 改 `vault/todo/*.md` → 自动监听触发同步；运行时投影在 SQLite `todos`，Persona API 负责生命周期 |
| **知识库内容** | 改 `vault/knowledge/*.md`（Obsidian 编辑） |
| **博客文章** | 在 `vault/blog/` 下新建 `.md`，写 frontmatter（title/date/tags）→ 保存自动同步到独立 Blog `:5175` 与标签索引 |
| **日历事件与标签** | 工作台 `:5173` 日历页 → 服务端 SQLite `calendar_events` / `calendar_tags`，多设备写冲突返回 `409` |
| **记忆治理** | 工作台 `:5173` 的 AI → 记忆页 → 接受/拒绝提案、纠正画像、抑制/归档 |
| **Legacy 仪表盘** | 迁移兼容，不作为主入口；如需保留参考改 `apps/workspace/legacy/index.html` |

### 数据源边界

- Obsidian Vault 与 `apps/workspace/projects/*.md` 是内容主库；Persona SQLite 是运行时事实源与投影。
- `sync-projects.js` 将 Vault/项目 Markdown 单向生成前端读模型（JSON + 博客 Markdown 副本）。
- Persona 只反向写 Obsidian 的 Daily Note 与 Persona Snapshot 托管块，不反向覆盖知识/待办/博客。

### 重置

Legacy 详情页点"重置"清除 localStorage，恢复到内嵌数据（仅迁移兼容场景）。

---

## 5. AI 协作规范

### AI 工作流程

每次会话开始，按顺序读：
1. `docs/00-overview/README.md` —— 了解入口和当前加载规则
2. `docs/00-overview/current-architecture.md` —— 理解当前真实架构
3. `docs/00-overview/glossary.md` —— 对齐术语
4. `docs/06-governance/architecture-invariants.md` —— 确认不可违反原则
5. 根据任务读取对应架构域 README

历史路线和任务记录已归档到 `docs/99-archive/historical/`，不作为当前实现依据。

### AI 禁止事项

- 引入未在本项目使用的框架/库
- 修改 `.obsidian/` 配置（除非用户要求）
- 删除或修改 `99-archive/` 历史内容，除非任务明确要求归档整理
- 回滚、覆盖或清理其他 AI / 用户已经做出的无关改动

### AI 注意事项

- 每次修改代码前先读对应架构域 README
- 修改代码后如有必要更新对应架构域文档
- 多 AI 并行时，先确认自己的写入范围；只改任务要求的文件和段落
- 发现旧根路径时，先判断它是否在 `99-archive/` 或迁移说明中；只有被描述为当前入口时才修正为 `apps/workspace/` 或 `apps/persona/src/`
- 遇到模糊需求先向用户确认，不把未确认需求写进当前事实文档

## 5. 上线部署

**当前方案**: Cloudflare Tunnel + Access（免费，无需公网 IP）

详细步骤见根目录 [`deploy.md`](../deploy.md)。

```bash
# 本地构建
npm run build

# 启动预览服务
npm run preview

# 另一终端启动 Cloudflare Tunnel
cloudflared tunnel run my-blog
```

**关键约束**:
- Obsidian vault 在 OneDrive，不在仓库内 → 只能本地 build，不支持 CI
- 仓库设为 private → 代码和数据不公开
- `filePath` 字段使用 `apps/workspace/projects/*.md` 相对路径，避免嵌入用户名
