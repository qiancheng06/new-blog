# 范围定义

> 产品定位与长期愿景见 `project-brief.md`、`vision.md`、`long-term-plan.md`。
> 当前工程验收标准见 `acceptance-criteria.md`。本文件记录当前阶段的 MVP 范围。

## 当前阶段范围（架构稳定期）

### 已纳入

- 输入：Telegram、Web（工作台 AI/Capture）、Obsidian Vault 内容同步。
- 事件与持久化：Event 不可变事实源；Conversation / Analysis / Background Job
  持久化任务（幂等、单飞、重试、恢复）。
- 记忆：Topic / Profile / Timeline 投影；Memory Proposal 治理（接受/拒绝）；
  SQLite FTS5 检索；抑制/归档/恢复。
- 工作：Project / Todo / Working State / Calendar（服务端投影 + API）。
- 输出：Companion（唯一用户可见出口）；公开博客 `:5175`；Obsidian Daily Note
  与 Persona Snapshot 归档。
- 前端：Next.js 工作台 `:5173`、独立博客 `:5175`、VitePress 私人内容站 `:5174`。

### 明确排除

- 完整人格模拟、多 Agent 自主协商、图谱推理、自动规划人生、高级自治系统。
- PostgreSQL 迁移（仅在多用户/高并发/远程部署需求出现后评估）。
- 向量检索、多模型路由、Insight Engine（需 MVP 稳定运行 30 天之后）。
- 离线写入队列（当前只允许查看本次已加载视图）。
- 公网用户认证/租户隔离/权限系统（Persona API 默认只绑定本机）。

### 遗留待办

- P16 real-mode 验收：Telegram 端到端、浏览器真实后端、cleanup 应用决策、
  Obsidian 范围、长跑可靠性。
- "工作台挑选发布 → 博客"的发布流程与状态机（draft → published → archived）。
