# Glossary — Persona Workspace

## Workspace 域

| 术语 | 定义 |
|------|------|
| **Knowledge** | 用户主动记录的参考信息（技术手册、资源库、技能树）。存储于 Obsidian。 |
| **Project** | 用户主动管理的目标实体，有开始/结束/任务/进度。运行时投影于 SQLite `projects`，源 Markdown 在 Obsidian。 |
| **Todo** | 用户的时间敏感待办事项，可绑定日期。运行时投影于 SQLite `todos`，源 Markdown 在 Obsidian。 |
| **Blog** | 用户撰写的公开文章，经同步生成读模型后由独立 Next.js 进程 `:5175` 渲染。 |
| **Calendar** | 月/周/日工作视图；事件与标签存于 SQLite，Obsidian 待办以只读投影进入。 |
| **Dashboard / Workspace** | 工作台数据的展示形式，属于表达层而非领域模型。 |

## Persona 域

| 术语 | 定义 |
|------|------|
| **Companion** | 最终对外表达者。接收 Researcher + Critic + Archivist 输出，生成自然语言回复。 |
| **Researcher** | 解释事件含义。回答"发生了什么，意味着什么"。提取模式、抽象结构。 |
| **Critic** | 发现风险与盲区。回答"哪里可能错，哪里过度自信"。给出置信度、反例、证据缺口。 |
| **Archivist** | 解释事件的记忆价值。决定"是否值得存、存到哪里、如何组织"。生成 memory patch。 |
| **Prompt** | 驱动上述认知算子的提示词集合，独立于代码管理。 |
| **Companion Reply** | Companion 生成的不可变回复 Event，通过 `in_reply_to` 关联输入 Event。 |

## Memory 域

| 术语 | 定义 |
|------|------|
| **Event** | 系统记录的最小原子交互事实（Telegram 消息、Web 消息、系统事件）。不可变。 |
| **Topic** | 系统从多条 Event 中识别出的长期关注主题。无开始/结束，无任务/负责人。区别于 Project。 |
| **Profile** | 基于 Event 分析提取的用户特征键值对。只能渐进更新，来源可审计。 |
| **Timeline Event** | 从 Event 流中筛选出的重要变化节点（insight / shift / milestone）。 |
| **Daily Note** | 系统每日自动生成的摘要。 |
| **Memory Proposal** | 低置信度画像更新提案（冷却内容），接受/拒绝后再进入 Profile。 |
| **Conversation Job** | 持久化的对话回复执行状态，提供幂等、单飞、失败保留与重试。 |
| **Analysis Job** | 持久化的后台分析任务（Capture 等无回复输入的分析状态）。 |
| **Background Job** | 可恢复的运行时任务队列（租约、幂等、退避重试）。 |
| **Working State** | 系统当前关注状态（当前项目/活跃主题/当前问题/S1 模式），非长期记忆。 |

## Context 域

| 术语 | 定义 |
|------|------|
| **Recall** | 从 Memory 中检索相关 Event/Topic/Profile 的过程。当前用 SQLite FTS5 + 近期事件。 |
| **Context Builder** | 将 Recall 结果 + 当前消息组装为 LLM 输入。 |

## Infra 域

| 术语 | 定义 |
|------|------|
| **Database** | 当前实现为 SQLite（WAL + 外键 + FTS5）；长期目标可迁移 PostgreSQL。 |
| **API Server** | HTTP 服务（`:3001`），浏览器直接请求，Next.js 运行时路由负责本地进程启停。 |
| **Telegram Bot** | 基于 grammy 的消息入口，支持命令前缀 (`/n`, `/t`, `/i`, `/j`)，允许 chat ID 白名单。 |
| **Sync** | `sync-projects.js` / `watch.js`：Obsidian Vault 与项目 Markdown → 前端读模型（JSON + 博客 Markdown 副本）的单向同步管道。 |
| **Scheduler** | Daily Summary 与 Persona Snapshot 的持久化调度器（单飞、恢复、退避重试）。 |

## 关键区分

| 容易混淆 | 区分规则 |
|----------|----------|
| Knowledge ≠ Memory | Knowledge = 用户**主动**创建；Memory = 系统**自动**抽取 |
| Project ≠ Topic | Project = 用户主动管理的目标实体（有开始/结束/任务/进度）；Topic = 系统观察到的长期关注主题（无边界）。**关系：Project → 产生 → Topics** |
| Blog ≠ Daily Note | Blog = 用户撰写公开；Daily Note = 系统自动生成 |
| Todo ≠ Event | Todo = 用户创建的任务；Event = 不可变交互事实 |
| Event ≠ Timeline Event | Event = 全量日志；Timeline Event = 筛选后重要节点 |
| Working State ≠ Memory | Working State = 当前关注状态；Memory = 长期画像/主题/时间线 |
