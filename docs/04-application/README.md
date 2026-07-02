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

本地 Workspace 的 Companion chat 入口默认连接 Application API `http://127.0.0.1:3001`。在线检查使用 `GET /health`，聊天请求使用 `POST /api/chat`；`/api/chat` 会进入 Conversation Flow，并可能按当前 LLM 配置触发真实模型调用。

Workspace 可观测面板如果需要展示后端在线状态、事件概览或运行摘要，应通过 Application 的只读接口读取：`GET /health` 用于进程与计数健康检查，`GET /api/events` 用于最近事件列表，`GET /api/status` 用于状态摘要。Application 负责收敛查询边界，不让 Workspace 直接读取 Memory、DB 或 Infra 适配器。
