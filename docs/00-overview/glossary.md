# Glossary — Persona Workspace

## Workspace 域

| 术语 | 定义 |
|------|------|
| **Knowledge** | 用户主动记录的参考信息（技术手册、资源库、技能树）。存储于 Obsidian。 |
| **Project** | 用户主动管理的目标实体，有开始/结束/任务/进度。例如：Persona OS、课伴AI、毕业设计。 |
| **Todo** | 用户的时间敏感待办事项，可绑定日期。 |
| **Blog** | 用户撰写的技术文章，发布到 VitePress 站点。 |
| **Dashboard** | Workspace 数据的展示形式，属于表达层而非领域模型。 |

## Persona 域

| 术语 | 定义 |
|------|------|
| **Companion** | 最终对外表达者。接收 Researcher + Critic + Archivist 输出，生成自然语言回复。 |
| **Researcher** | 解释事件含义。回答"发生了什么，意味着什么"。提取模式、抽象结构。 |
| **Critic** | 发现风险与盲区。回答"哪里可能错，哪里过度自信"。给出置信度、反例、证据缺口。 |
| **Archivist** | 解释事件的记忆价值。决定"是否值得存、存到哪里、如何组织"。生成 memory patch。 |
| **Prompt** | 驱动上述四个认知算子的提示词集合，独立于代码管理。 |

## Memory 域

| 术语 | 定义 |
|------|------|
| **Event** | 系统记录的最小原子交互事实（Telegram 消息、Web 消息、系统事件）。不可变。 |
| **Topic** | 系统从多条 Event 中识别出的长期关注主题。无开始/结束，无任务/负责人。区别于 Project。 |
| **Profile** | 基于 Event 分析提取的用户特征键值对。 |
| **Timeline Event** | 从 Event 流中筛选出的重要变化节点。 |
| **Daily Note** | 系统每日自动生成的摘要。 |

## Context 域

| 术语 | 定义 |
|------|------|
| **Recall** | 从 Memory 中检索相关 Event/Topic/Profile 的过程。当前用时间截断。 |
| **Context Builder** | 将 Recall 结果 + 当前消息组装为 LLM 输入。 |

## Infra 域

| 术语 | 定义 |
|------|------|
| **Database** | 当前实现为 SQLite；长期目标可迁移 PostgreSQL。 |
| **API Server** | HTTP 服务 (`/api/chat`, `/health`, `/api/events`)。 |
| **Telegram Bot** | 基于 grammy 的消息入口，支持命令前缀 (`/n`, `/t`, `/i`, `/j`)。 |
| **Sync** | Obsidian Vault ↔ VitePress/HTML 的内容同步管道。 |

## 关键区分

| 容易混淆 | 区分规则 |
|----------|----------|
| Knowledge ≠ Memory | Knowledge = 用户**主动**创建；Memory = 系统**自动**抽取 |
| Project ≠ Topic | Project = 用户主动管理的目标实体（有开始/结束/任务/进度）；Topic = 系统观察到的长期关注主题（无边界）。**关系：Project → 产生 → Topics** |
| Blog ≠ Daily Note | Blog = 用户撰写发布；Daily Note = 系统自动生成 |
| Todo ≠ Event | Todo = 用户创建的任务；Event = 不可变交互事实 |
| Event ≠ Timeline Event | Event = 全量日志；Timeline Event = 筛选后重要节点 |
