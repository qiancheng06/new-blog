<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 008 — 事件规范（Event Specification）

> 状态：方案就绪
> 目标：工程级的 Event 类型定义、表结构、生产/消费关系

---

## 一、基础结构

### events 表（当前已存在）

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,       -- telegram / system / worker / web / obsidian
  type TEXT NOT NULL,         -- 事件类型标识
  payload TEXT NOT NULL,      -- JSON 字符串
  timestamp TEXT NOT NULL,    -- ISO 8601
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source, type);
```

### Zod Schema（当前已存在）

```typescript
// src/event/types.ts
export const EventSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(["telegram", "system", "worker", "web", "obsidian"]),
  type: z.string(),
  payload: z.record(z.unknown()),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).default({}),
})

export type Event = z.infer<typeof EventSchema>
```

---

## 二、Event Registry

所有 Event 类型的唯一注册表。

### Input Events（来源：telegram）

```yaml
UserMessage:
  type: "message"
  source: telegram
  producer: bot.ts → on("message:text")
  consumer: operators.ts → processMessage()
  payload:
    chat_id: number
    user_id: number
    text: string
    message_id: number
    reply_to?: number

CommandNote:
  type: "note"
  source: telegram
  producer: bot.ts → parseCommand("/n")
  consumer: event store only
  payload:
    chat_id: number
    user_id: number
    text: string
    message_id: number

CommandTodo:
  type: "todo"
  source: telegram
  producer: bot.ts → parseCommand("/t")
  consumer: event store only

CommandIdea:
  type: "idea"
  source: telegram
  producer: bot.ts → parseCommand("/i")
  consumer: event store only

CommandJournal:
  type: "journal"
  source: telegram
  producer: bot.ts → parseCommand("/j")
  consumer: event store only
```

### System Events（来源：system）

```yaml
Tick:
  type: "tick"
  source: system
  producer: scheduler → setInterval
  consumer: —（占位，当前无消费方）
  payload: {}

Alert:
  type: "alert"
  source: system
  producer: scheduler → 异常检测
  consumer: —（占位）
  payload:
    level: "warn" | "error"
    message: string

DailySummaryReady:
  type: "summary_ready"
  source: system
  producer: scheduler → 每日 23:00
  consumer: summary service → obsidian sync
  payload:
    date: string
    event_count: number

CleanupTrigger:
  type: "cleanup"
  source: system
  producer: scheduler → 每小时
  consumer: monitor store → 清理过期数据
  payload:
    target: "monitor_events"
    max_rows: 500
```

### Internal Events（来源：worker，Phase 1 引入）

```yaml
MemoryPatchApplied:
  type: "memory_patch"
  source: worker
  producer: operators.ts → LLM response 解析
  consumer: memory repository → 写入 profile/topic/timeline
  payload:
    trace_id: string
    profile_updates: Array<{ key: string; value: unknown; confidence: number; cooling_required?: boolean }>
    topic_updates: Array<{ name: string; summary?: string }>
    timeline_events: Array<{ date: string; type: string; summary: string }>

TopicUpdated:
  type: "topic_updated"
  source: worker
  producer: memory service → 写入 topic 后
  consumer: —（通知用途，触发后续分析）
  payload:
    topic_id: string
    name: string
    new_confidence: number

ProfileUpdated:
  type: "profile_updated"
  source: worker
  producer: memory service → 写入 profile 后
  consumer: —（通知用途）
  payload:
    key: string
    value: unknown
    source_event_id: string

TimelineEventCreated:
  type: "timeline_created"
  source: worker
  producer: memory service → 写入 timeline 后
  consumer: —（通知用途）
  payload:
    event_id: string
    type: string
    date: string
    summary: string
```

### Cognitive Events（来源：worker，Phase 2 引入）

```yaml
InsightGenerated:
  type: "insight_generated"
  source: worker
  producer: insight engine → 定时分析
  consumer: delivery → 决定是否推送
  payload:
    trace_id: string
    insights: Array<{
      type: "interest_shift" | "goal_drift" | "pattern"
      description: string
      evidence: string[]
      confidence: number
    }>
    window_days: number

NoveltySuggested:
  type: "novelty_suggested"
  source: worker
  producer: novelty engine → 对话伴生
  consumer: delivery → 决定是否注入 Companion
  payload:
    trace_id: string
    new_angle?: string
    cross_domain?: string
    provocative_question?: string
    confidence: number

DeliveryDecision:
  type: "delivery_decision"
  source: worker
  producer: delivery → 评估后
  consumer: companion → 执行推送
  payload:
    trace_id: string
    source_type: "insight" | "novelty" | "critic"
    should_speak: boolean
    timing: "now" | "delay" | "accumulate"
    tone: "gentle" | "playful" | "direct"
    content: string
```

---

## 三、Producer → Consumer 关系图

```
Phase 0（当前）
══════════════

Producer                   Event                  Consumer
─────────                  ─────                  ────────
bot.ts ───→ UserMessage ───→ operators.ts
bot.ts ───→ CommandNote ───→ (event store)
bot.ts ───→ CommandTodo ───→ (event store)
bot.ts ───→ CommandIdea ───→ (event store)
bot.ts ───→ CommandJournal ─→ (event store)
scheduler ─→ Tick ─────────→ (none)
scheduler ─→ Alert ────────→ (none)

Phase 1（观测流后）
══════════════

Producer                   Event                  Consumer
─────────                  ─────                  ────────
(以上全部 Phase 0)                           (全部保留)

scheduler ─→ CleanupTrigger ─→ monitor store
operators ─→ MemoryPatch ─────→ memory repository
memory svc ─→ TopicUpdated ───→ (log/notify)
memory svc ─→ ProfileUpdated ─→ (log/notify)
memory svc ─→ TimelineCreated → (log/notify)

Phase 2（稳定后）
══════════════

Producer                   Event                  Consumer
─────────                  ─────                  ────────
(以上全部 Phase 0-1)                          (全部保留)

insight ───→ InsightGenerated → delivery
novelty ───→ NoveltySuggested → delivery
delivery ──→ DeliveryDecision → companion
```

---

## 四、Event 创建函数

当前 `src/event/types.ts` 已包含 `createTelegramEvent` 和 `createSystemEvent`。

Phase 1 新增的创建函数示例：

```typescript
// src/event/types.ts（Phase 1 扩展）

export function createMemoryPatchEvent(
  payload: MemoryPatchPayload,
  traceId: string
): Event {
  return {
    source: "worker",
    type: "memory_patch",
    payload: payload as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    metadata: { trace_id: traceId },
  }
}

export function createCleanupEvent(maxRows: number): Event {
  return {
    source: "system",
    type: "cleanup",
    payload: { target: "monitor_events", max_rows: maxRows },
    timestamp: new Date().toISOString(),
    metadata: {},
  }
}
```

---

## 五、消费模式

### Phase 0：同步消费

```typescript
// bot.ts
const event = createTelegramEvent(payload)
const saved = insertEvent(event)
const reply = await processMessage(saved)  // 同步处理
```

### Phase 1：事件驱动消费

```typescript
// memory-worker.ts（新增）
function consumeMemoryPatches() {
  const patches = getEventsSince(lastCheck, "memory_patch")
  for (const event of patches) {
    const payload = JSON.parse(event.payload)
    applyMemoryPatch(payload)       // 写入 profile/topic/timeline
    insertEvent(createTopicUpdated(...))  // 产生新 Event
  }
}
```

### Phase 2：定时轮询（仍不引入消息队列）

```typescript
// scheduler 定时扫描 events 表，按 type 分发给对应 consumer
```

为什么不用消息队列？——架构不变原则第 8 条：MVP 闭环稳定前，不引入新中间件。SQLite events 表在数据量达到万级之前，作为 Event Store 完全够用。

---

## 六、验证规则

```typescript
// 所有 Event 必须通过 Zod 校验
EventSchema.parse(raw)

// 特定类型可加 payload 校验
export const MemoryPatchPayloadSchema = z.object({
  trace_id: z.string(),
  profile_updates: z.array(z.object({
    key: z.string(),
    value: z.unknown(),
    confidence: z.number().min(0).max(1),
    cooling_required: z.boolean().optional(),
  })),
  topic_updates: z.array(z.object({
    name: z.string(),
    summary: z.string().optional(),
  })),
  timeline_events: z.array(z.object({
    date: z.string(),
    type: z.string(),
    summary: z.string(),
  })),
})
```

---

## 七、实施顺序

| 步骤 | 内容 | Phase |
|------|------|-------|
| 1 | 现有 Event 类型 + Zod schema（已完成） | Phase 0 |
| 2 | `source` 枚举扩展（加 worker/web/obsidian） | Phase 0 |
| 3 | 新增 `CleanupTrigger` Event + consumer | Phase 0 |
| 4 | MemoryPatch 从直接写库改为走 Event | Phase 1 |
| 5 | 新增 TopicUpdated / ProfileUpdated / TimelineCreated | Phase 1 |
| 6 | 新增 InsightGenerated / NoveltySuggested / DeliveryDecision | Phase 2 |
| 7 | 引入 Event Bus 轮询模式 | Phase 2 |
