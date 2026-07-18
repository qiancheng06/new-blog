# 事件模型（Event Schema）

> Event 是 Persona OS 的唯一事实源。所有输入必须转换为 Event 后进入系统。原始事件不可修改。

---

## MVP 事件类型

```typescript
type EventSource = 'telegram' | 'system'

interface Event {
  id: string
  source: EventSource
  type: string
  payload: Record<string, unknown>
  timestamp: string
  metadata: Record<string, unknown>
}
```

## TelegramMessage

```typescript
interface TelegramMessage {
  source: 'telegram'
  type: 'message'
  payload: {
    chat_id: number
    user_id: number
    text: string
    message_id: number
    reply_to?: number
  }
}
```

## SystemEvent

```typescript
interface SystemEvent {
  source: 'system'
  type: 'tick' | 'alert' | 'summary_ready'
  payload: Record<string, unknown>
}
```

---

## 扩展原则

- 新增 Event 类型继承基础 Event 接口，不修改已有类型
- 未来 Web 接入时新增 `source: 'web'`
- 未来 Worker 产出时新增 `source: 'worker'`

## Telegram event identity

Telegram message identity is the pair `(chat_id, message_id)`. Persona maps the
pair to a deterministic UUID v5 before persistence. Application insertion uses
that stable Event id and returns the already stored Event on redelivery, so a
polling retry cannot append another input Event, Companion reply, or Memory
patch.

For databases created before deterministic ids were introduced, the Event store
also looks up the same payload identity and returns the legacy row. Reusing an
identity with different source, type, or payload is an explicit conflict rather
than a silent overwrite. Original Events remain immutable.

## Workspace event identity

`POST /api/chat` may provide `requestId` or `Idempotency-Key`. Persona derives a
deterministic UUID v5 from that opaque key. The first request persists one Web
Event; concurrent or later replays with the same content reuse it. Reusing the
key with different Event content is an explicit conflict. The raw key is not
stored in Event payload or Conversation job state.

Conversation recovery appends `conversation_retry_requested` Events with the
job id, source Event id, and bounded reason (`manual` or
`idempotent_replay`). Companion outputs remain separate immutable
`system/companion_reply` Events linked by `in_reply_to`.
