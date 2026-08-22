# Application

Application 是 Workspace 与 Persona OS 之间的编排层。

## 本域职责

- Conversation Flow（对话流程）
- Capture（笔记/想法/日记摄入）
- Project / Todo / Working State / Calendar 的业务流程
- Memory 编排：写回、提案、检索、治理入口
- Daily Summary 与 Obsidian Snapshot 调度
- 后台任务（Background Job）与事件查询出口
- Workspace 可观测面板所需的只读查询出口

## 本域不负责

- 不实现具体 UI
- 不定义 Prompt 细节
- 不拥有数据库适配
- 不把领域规则写成基础设施逻辑
- 不把可观测面板展示状态当成新的写入通道

## 常读文档

- [../00-overview/current-architecture.md](../00-overview/current-architecture.md)
- [../03-memory/event-schema.md](../03-memory/event-schema.md)
- [../03-memory/data-model.md](../03-memory/data-model.md)
- [../02-persona/prompt-pack.md](../02-persona/prompt-pack.md)

## 相关代码位置

- `apps/persona/src/application/`（业务流程与用例）
- `apps/persona/src/interface/api/server.ts`（HTTP API）
- `apps/persona/src/interface/telegram/bot.ts`（Telegram 适配）
- `apps/persona/src/ai-runtime/operators/process-message.ts`（消息处理）

## AI 修改前检查项

- 所有外部输入必须先转换为 Event。
- 编排层只组织流程，不吞掉 Persona、Memory、Infra 的职责。
- 失败时保留 Event，不应丢失用户输入。
- 新增异步能力优先考虑持久化任务，而不是跨域直接调用。
- 新增 Workspace 可观测能力时，优先复用或扩展只读 API；所有会改变系统状态的操作仍必须走 Event。

## 跨域协作规则

- Presentation/Interface 只进入 Application，不直接进入 Memory。
- Application 可以调用 Persona、Memory、Infra，但不能拥有它们的规则。
- 复杂能力必须等 MVP 闭环稳定后再引入。

## 当前状态

Conversation Flow 已抽到 `apps/persona/src/application/conversation.ts`。Web
API 与 Telegram 的事件写入与事件查询统一从 Application 出口进入。普通消息
共用 `handleConversationEvent`，会先保存 Event 再调用 `processMessage`。
命令类 Telegram 事件通过 `shouldReply: false` 只记录 Event，不触发
Companion，也不发送确认回复。

Telegram 文本到 Event 的纯转换逻辑位于
`apps/persona/src/interface/telegram/events.ts`，由 `npm.cmd run contract:telegram`
离线验证。该 contract 覆盖 `/n`、`/t`、`/i`、`/j` 命令映射、命令内容清洗、
普通消息应回复，以及 `PERSONA_EVALUATION_RUN_ID` 写入 Event metadata 的
真实模式标记。

本地 Workspace 的 Companion chat 入口默认连接 Application API
`http://127.0.0.1:3001`。在线检查使用 `GET /health`，聊天请求使用
`POST /api/chat`；`/api/chat` 会进入 Conversation Flow，并可能按当前 LLM
配置触发真实模型调用。

Workspace 可观测面板如果需要展示后端在线状态、事件概览或运行摘要，应通过
Application 的只读接口读取：`GET /health` 用于进程与计数健康检查，
`GET /api/events` 用于隐私安全的最近事件列表和筛选，`GET /api/events/:id`
用于安全详情，`GET /api/conversations` 与 `GET /api/conversations/:id` 用于
持久化对话回放，`GET /api/status` 用于状态摘要。Event Feed 和 Conversation
History 都只返回安全投影，不暴露原始 payload、metadata、页面/评估上下文或
Telegram 标识。Application 负责收敛查询边界，不让 Workspace 直接读取
Memory、DB 或 Infra 适配器。

Working State 通过 `GET/POST /api/working-state` 进入 Application。写入必须
携带原因并先追加审计 Event；Project 进入 done/archived 时，Application 会在
同一事务内清除对应的当前 Project。该状态只作为私有 Prompt 工作上下文，
不进入长期 Memory。

Note、Idea、Journal 通过 `POST /api/captures` 或 Telegram 命令进入同一
Capture 编排。Application 原子保存 Event 和 Analysis job，不调用 Companion；
Workspace 可通过只读 Capture API 查看安全字段和后台分析状态。失败任务继续
使用现有 `POST /api/analysis-jobs/:id/retry` 恢复。

## Telegram 重投递契约

`handleConversationEvent` 通过 insert-once 边界持久化输入。第一次 Telegram
投递继续走 Companion 与异步 Memory；后续同一 `(chat_id, message_id)` 的
投递返回 `duplicate: true`，不会再次调用模型、追加回复、应用 Memory 或发送
第二条 Telegram 响应。命令 Event 使用同一边界。

## 有序异步 Memory 提交

每条消息在等待 Companion 前先保留一个 Memory 提交位次。Companion 返回后，
Analysis 可与后续消息并发执行，而结果 patch 按保留顺序提交。失败的
Analysis 与失败的 Companion 路径会释放位次，因此单个请求不会永久阻塞队列。
队列是进程内的；持久化的来源溯源仍是每条写入 Memory 行的不可变 Event id。

Analysis 执行状态本身持久化在 `analysis_jobs`。Workspace 可通过
`GET /api/analysis-jobs` 检查，并通过有审计的 `POST /api/analysis-jobs/:id/retry`
重试失败任务。API 只暴露状态、时间戳、计数器、来源 Event id 与受限错误码；
私有来源或厂商内容不属于该读模型。

## 验证

```bash
npm.cmd run contract:api
npm.cmd run smoke:api
npm.cmd run verify:local
```