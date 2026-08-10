# Application

Application 是 Workspace 与 Persona OS 之间的编排层。

## 本域职责

- Conversation Flow
- Event Bus 设计和事件分发边界
- Workspace 与 Persona 的桥接
- Workspace 可观测面板所需的只读查询出口
- Daily Summary 流程
- 调度输入、记忆、上下文、认知算子和输出

## 本域不负责

- 不实现具体 UI
- 不定义 Prompt 细节
- 不拥有数据库适配
- 不把领域规则写成基础设施逻辑
- 不把可观测面板展示状态当成新的写入通道

## 常读文档

- [README.md](README.md)
- [../00-overview/current-architecture.md](../00-overview/current-architecture.md)
- [../03-memory/event-schema.md](../03-memory/event-schema.md)
- [../02-persona/prompt-pack.md](../02-persona/prompt-pack.md)

## 相关代码位置

- `apps/persona/src/application/conversation.ts`
- `apps/persona/src/interface/api/server.ts`
- `apps/persona/src/interface/telegram/bot.ts`
- `apps/persona/src/ai-runtime/operators/process-message.ts`
- `apps/persona/src/application/`

## AI 修改前检查项

- 所有外部输入必须先转换为 Event
- 编排层只组织流程，不吞掉 Persona、Memory、Infra 的职责
- 失败时保留 Event，不应丢失用户输入
- 新增异步能力优先考虑 Event Bus，而不是跨域直接调用
- 新增 Workspace 可观测能力时，优先复用或扩展只读 API；所有会改变系统状态的操作仍必须走 Event

## 跨域协作规则

- Presentation/Interface 只进入 Application，不直接进入 Memory
- Application 可以调用 Persona、Memory、Infra，但不能拥有它们的规则
- 复杂能力必须等 MVP 闭环稳定后再引入

## 当前状态

Conversation Flow 已抽到 `apps/persona/src/application/conversation.ts`。Web API 和 Telegram 的事件写入与事件查询统一从 Application 出口进入。普通消息共用 `handleConversationEvent`，会先保存 Event 再调用 `processMessage`。命令类 Telegram 事件通过 `shouldReply: false` 只记录 Event，不触发 Companion，也不发送确认回复。

Telegram 文本到 Event 的纯转换逻辑位于 `apps/persona/src/interface/telegram/events.ts`，由 `npm.cmd run contract:telegram` 离线验证。该 contract 覆盖 `/n`、`/t`、`/i`、`/j` 命令映射、命令内容清洗、普通消息应回复，以及 `PERSONA_EVALUATION_RUN_ID` 写入 Event metadata 的真实模式标记。

本地 Workspace 的 Companion chat 入口默认连接 Application API `http://127.0.0.1:3001`。在线检查使用 `GET /health`，聊天请求使用 `POST /api/chat`；`/api/chat` 会进入 Conversation Flow，并可能按当前 LLM 配置触发真实模型调用。

Workspace 可观测面板如果需要展示后端在线状态、事件概览或运行摘要，应通过 Application 的只读接口读取：`GET /health` 用于进程与计数健康检查，`GET /api/events` 用于隐私安全的最近事件列表和筛选，`GET /api/events/:id` 用于安全详情，`GET /api/conversations` 与 `GET /api/conversations/:id` 用于持久化对话回放，`GET /api/status` 用于状态摘要。Event Feed 和 Conversation History 都只返回安全投影，不暴露原始 payload、metadata、页面/评估上下文或 Telegram 标识。Application 负责收敛查询边界，不让 Workspace 直接读取 Memory、DB 或 Infra 适配器。

Working State 通过 `GET/POST /api/working-state` 进入 Application。写入必须携带原因并先追加审计 Event；Project 进入 done/archived 时，Application 会在同一事务内清除对应的当前 Project。该状态只作为私有 Prompt 工作上下文，不进入长期 Memory。

Note、Idea、Journal 通过 `POST /api/captures` 或 Telegram 命令进入同一
Capture 编排。Application 原子保存 Event 和 Analysis job，不调用
Companion；Workspace 可通过只读 Capture API 查看安全字段和后台分析状态。
失败任务继续使用现有 `POST /api/analysis-jobs/:id/retry` 恢复。

## Telegram redelivery contract

`handleConversationEvent` persists inputs through an insert-once boundary. The
first Telegram delivery continues through Companion and asynchronous Memory;
later deliveries of the same `(chat_id, message_id)` return
`duplicate: true` and do not call the model, append a reply, apply Memory, or
send a second Telegram response. Command Events use the same boundary.

## Ordered asynchronous Memory commits

Each message reserves a Memory commit position before awaiting Companion. Once
Companion returns, Analysis may run concurrently with later messages, while the
resulting patches commit in reservation order. Failed Analysis and failed
Companion paths release their positions, so one request cannot permanently
block the queue. The queue is process-local; durable source provenance remains
the immutable Event id on every written Memory row.

Analysis execution state itself is durable in `analysis_jobs`. Workspace may
inspect it through `GET /api/analysis-jobs` and retry a failed job through the
audited `POST /api/analysis-jobs/:id/retry` command. The API exposes only state,
timestamps, counters, source Event ids, and bounded error codes; private source
or provider content is not part of this read model.
