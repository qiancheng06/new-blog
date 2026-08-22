# 阶段总结（Stage Summary）

> 更新时间：2026-08-21
>
> 本文是 Persona Workspace 进入架构稳定期后的里程碑总结，记录当前已达成的
> 能力、遗留缺口和下一步方向。架构事实以 `current-architecture.md` 为准；
> 本文件只做阶段性的横向总结。

## 1. 阶段定位

本阶段完成了从"两个独立项目（Workspace + Persona OS）"到"模块化单体
monorepo"的合并，并把 Persona 后端从最小 MVP 推进到具备持久化任务、
记忆治理和多端协同基础能力的运行时。

关键提交：

- `b93a299` feat: stabilize persona workspace mvp
- `6286146` feat: persist calendar and background jobs
- `dc2e5c3` merge: integrate persona backend agent work（92 文件，+12945 行）

## 2. 当前架构快照

四个本地进程：

| 端口 | 进程 | 职责 |
| --- | --- | --- |
| `:5173` | Next.js Workspace | 工作台：总览 / AI / 日历 / 知识库 / 工具 |
| `:5175` | Next.js Blog | 独立公开博客，皮肤与工作台完全分离 |
| `:5174` | VitePress Content | 私人 Markdown 内容站 |
| `:3001` | Persona API | 对话、记忆、日历、项目、待办、调度与持久化 |

数据层：SQLite（`data/persona-os.db`）统一承载 Event、Conversation/Analysis
Job、Project、Todo、Working State、Memory Proposal、Memory、Daily Note、
Calendar、Background Job 与调度运行记录，启用 WAL、外键与 FTS5。
Obsidian 作为人工可读归档层，Vault 内容经 `sync-projects.js` 单向生成前端
读模型。

## 3. 已实现能力清单

### 3.1 输入与事件

- Telegram 与 Web 输入统一转为不可变 Event，原始 Event 不修改。
- 对话幂等：`conversation_jobs` 提供幂等键、单飞、失败保留和人工重试。
- Event Feed：隐私安全的事件流投影，不暴露 raw payload、metadata 与
  Telegram 标识，支持过滤、搜索、分页。

### 3.2 认知与表达

- Companion 是唯一用户可见输出；Research / Critic / Memory Patch 默认隐藏。
- 对话回复同步返回，后台分析由 SQLite 持久化任务执行，进程重启后继续。
- 任务使用租约、幂等键和最多三次退避重试；记忆写入与任务完成同事务提交。

### 3.3 记忆体系

- 记忆写回：Analysis 结果写入 Topic / Profile / Timeline，来源 Event 可审计。
- 记忆治理：Profile 只渐进更新；低置信度更新进入 `memory_proposals`，经
  接受/拒绝后再改变长期画像；支持 suppress / archive / restore。
- 记忆检索：SQLite FTS5（trigram）覆盖 Profile / Topic / Timeline / Daily
  Note，抑制/归档/提案数据不进入检索。
- 有序提交：并发分析按输入保留顺序提交，避免旧分析覆盖新状态。

### 3.4 工作与内容

- Capture 闭环：Note / Idea / Journal 经 Web 或 Telegram 摄入，原子创建
  Analysis job，成功后写回记忆。
- Todo / Project：服务端投影 + 生命周期 API + Telegram 捕获 + Project-Todo
  关联 + 聚合状态。
- Working State：持久化当前项目、活跃主题、当前问题与 S1 模式，审计更新。
- Calendar：月/周/日视图，事件与标签存入 SQLite，多设备写冲突返回 `409`，
  Obsidian 待办以只读投影进入日历。

### 3.5 归档与调度

- Daily Summary：按 `PERSONA_TIME_ZONE` 计算自然日，持久化到 `daily_notes`
  并归档到 Obsidian；支持自动补做、单飞、恢复与退避重试。
- Persona Snapshot：受控导出 Profile / Topic / Timeline / Project 到 Obsidian
  托管块；每日自动调度，可恢复、可重试。
- 调度运行记录：`daily_summary_runs`、`persona_snapshot_runs` 持久化状态机。

### 3.6 前端与内容站

- 工作台：Next.js 统一外壳与常驻侧栏，总览 / AI / 日历 / 知识库 / 工具。
- 公开博客：独立 Next.js 进程 `:5175`，独立皮肤，数据来自 vault 博客目录
  同步生成的读模型。
- 私人内容站：VitePress 保留知识库 / 待办 / 项目私人内容浏览。
- 局域网访问：`dev:lan`、`dev:blog:lan` 支持手机访问。

## 4. 遗留缺口

以下内容尚未完成，属于本阶段的边界：

- **P16 real-mode 验收**：Telegram 端到端、Workspace 浏览器真实后端、cleanup
  review/apply 决策、Obsidian 范围、长跑可靠性（真实网络/人工验证）。
- 公开博客的"工作台挑选发布"流程尚未实现（当前是 vault 博客目录单向同步）。
- 离线写入队列未建立（离线只允许查看本次已加载视图）。
- 上下文检索基于近期 Event、结构化记忆与 FTS5，没有向量检索或完整 RAG。
- PostgreSQL 迁移仅在出现多用户、并发写入或远程部署需求时才评估。

## 5. 下一步方向

1. 收尾 P16 real-mode 验收，补齐真实环境证据。
2. 设计并实现"工作台挑选发布 → 博客"的发布流程与状态机（draft →
   published → archived）。
3. 评估多设备部署形态（Cloudflare Tunnel / Access 路径鉴权）。
4. 在 MVP 稳定运行 30 天之后，再评估向量检索、多模型路由等进阶能力。

## 6. 验证口径

默认本地门禁：

```bash
npm.cmd run verify:local
```

完整构建（需本机 Obsidian Vault 权限）：

```bash
npm.cmd run build
npm.cmd run build:blog
```
