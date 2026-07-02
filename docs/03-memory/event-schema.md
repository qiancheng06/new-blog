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
