# 事件模型（Event Schema）

> Event 是 Persona OS 的唯一事实源。所有输入必须转换为 Event 后进入系统。原始事件不可修改。

---

## MVP 事件类型

```typescript
type EventSource = 'telegram' | 'system' | 'web'

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
- Web/Application 命令使用 `source: 'web'`
- 未来 Worker 产出时新增 `source: 'worker'`

## Public read boundary

Complete Event payload and metadata remain internal audit/runtime data. The
Application Event Feed is an allowlisted projection containing identity,
source/type/time, a bounded readable preview, purpose, and visibility only. It
never exposes raw payload/metadata or Telegram chat/user/message identifiers.

Feed search is also projection-aware: it may inspect user-readable `text`,
`summary`, and `reason`, but never private Telegram identifiers. Workspace and
other presentation clients must use this Application boundary instead of
reading the `events` table or Event store directly. Explicit non-`user`
visibility keeps the Event classifiable but suppresses preview and search.

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

## Capture events

Web and Telegram use immutable `note`, `idea`, and `journal` Events for
reply-free capture. Web creates accept `requestId` or `Idempotency-Key`; a
dedicated deterministic namespace makes replay safe without colliding with chat
requests. A reused key with changed type or text is a conflict.

The source Event and its pending Analysis job commit in one transaction.
Analysis runs in the background and may write governed Topic, Profile, and
Timeline memory with source provenance. It never creates a Conversation job or
`companion_reply`. Todo and Project commands remain outside this automatic
Capture-to-Memory path.

## Memory proposal review events

Analysis output marked `cooling_required` is persisted as a pending Memory
proposal and does not enter Profile or Companion context. A human review appends
one immutable Web Event:

- `memory_proposal_accepted`
- `memory_proposal_rejected`

The payload contains the proposal id, original source Event id, Profile key,
decision, and required reason. It intentionally does not duplicate the proposed
value. Both Event types use `metadata.purpose = "memory_governance"` and
`metadata.visibility = "user"`. The review Event and proposal transition are
atomic; acceptance also writes Profile in the same transaction.

## Working State events

Reason-required Working State changes append `working_state_updated` before
updating the singleton projection. Completing or archiving the selected Project
also appends `working_state_project_cleared`. The Project lifecycle Event,
Working State Event, and both projection updates share one transaction.

Both Events use `metadata.purpose = "working_state"` and
`metadata.visibility = "user"`. Their payloads contain state values or Project
provenance needed for audit, while private Prompt context omits internal ids.
