<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 006 — 事件模型（Event Model）

> 状态：方案就绪
> 目标：定义 Persona OS 的事件分类体系、演进路径和工程规范

---

# 第一部分：当前状态 vs 目标

## 当前（Phase 0）

```
source:      telegram, system
type:        message, note, todo, idea, journal, tick, alert, summary_ready
内部事件:     无（memory_patch 直接写库，不走 Event）
```

## 目标

```
source:      telegram, system, worker, web, obsidian
type:        按分类扩展，每个事件独立定义
内部事件:     系统产生的所有状态变更都走 Event
```

---

# 第二部分：Event 分类

## 三类事件

```
Input Events（外部输入）
  来源：telegram / web / app / obsidian
  特点：由用户或外部系统触发
  示例：UserMessage, CommandNote, FileUpload

System Events（系统信号）
  来源：system（定时器/内部触发器）
  特点：由系统内部定时或条件触发
  示例：Tick, DailySummaryReady, CleanupTrigger

Internal Events（内部状态变更）
  来源：worker（认知算子/后台任务产出）
  特点：由业务流或记忆流触发，不直接面向用户
  示例：MemoryPatchApplied, TopicUpdated, InsightGenerated
```

## 完整 Event 类型表

| Event 类型 | 类别 | Source | Producer | Consumer | 当前状态 |
|-----------|------|--------|----------|----------|---------|
| UserMessage | Input | telegram | bot.ts | operators.ts | ✅ |
| CommandNote | Input | telegram | bot.ts | event store | ✅ |
| CommandTodo | Input | telegram | bot.ts | event store | ✅ |
| CommandIdea | Input | telegram | bot.ts | event store | ✅ |
| CommandJournal | Input | telegram | bot.ts | event store | ✅ |
| Tick | System | system | scheduler | — | ✅ |
| Alert | System | system | scheduler | — | ✅ |
| DailySummaryReady | System | system | scheduler | obsidian sync | ⏳ |
| CleanupTrigger | System | system | scheduler | monitor store | ⬜ |
| MemoryPatch | Internal | worker | operators.ts | memory repository | ⬜ |
| TopicUpdated | Internal | worker | memory service | — | ⬜ |
| ProfileUpdated | Internal | worker | memory service | — | ⬜ |
| TimelineEvent | Internal | worker | memory service | — | ⬜ |
| InsightGenerated | Internal | worker | insight engine | delivery | ⬜ |
| NoveltySuggested | Internal | worker | novelty engine | delivery | ⬜ |
| DeliveryDecision | Internal | worker | delivery | companion | ⬜ |

---

# 第三部分：Event Schema

## 基础接口（不变）

```typescript
interface Event {
  id: string
  source: 'telegram' | 'system' | 'worker' | 'web' | 'obsidian'
  type: string
  payload: Record<string, unknown>
  timestamp: string
  metadata: Record<string, unknown>
}
```

## Input Event 示例：UserMessage

```typescript
interface UserMessagePayload {
  chat_id: number
  user_id: number
  text: string
  message_id: number
  reply_to?: number
}
```

## Internal Event 示例：MemoryPatch

```typescript
interface MemoryPatchPayload {
  trace_id: string
  patches: {
    profile_updates: Array<{ key: string; value: unknown; confidence: number }>
    topic_updates: Array<{ name: string; summary?: string }>
    timeline_events: Array<{ date: string; type: string; summary: string }>
  }
}
```

## Internal Event 示例：InsightGenerated

```typescript
interface InsightGeneratedPayload {
  trace_id: string
  insights: Array<{
    type: 'interest_shift' | 'goal_drift' | 'pattern'
    description: string
    evidence: string[]
    confidence: number
  }>
  window_days: number
}
```

---

# 第四部分：Event 流程

## 当前：内联处理

```
bot.ts → insertEvent() → events 表
       → operators.ts → callLLM()
                       → 直接写 profile/topic/timeline 表
```

memory_patch 不经过 Event，直接写库。

## 目标：Event 驱动

```
Input: bot.ts → insertEvent(UserMessage) → events 表
              → operators.ts → callLLM()
                              → insertEvent(MemoryPatch) → events 表
                                                         → memory worker 异步消费
                                                         → 写入 profile/topic/timeline

Internal: scheduler → insertEvent(DailySummaryReady) → events 表
                                                     → summary worker 消费
                                                     → insertEvent(DailySummaryDone) → events 表
```

每个状态变更都产生一个 Event，消费方异步处理。

---

# 第五部分：Event 演进

## Phase 0（当前）

```
目标：基础事件通道
  - Input Events（telegram → events 表）
  - System Events（tick/alert/summary_ready）
  - 不引入 Internal Events（memory_patch 直接写库）
```

## Phase 1（观测流之后）

```
目标：Internal Events 打通
  - MemoryPatch 改为走 Event（先写入 events 表，再消费写入 memory 表）
  - 新增 TopicUpdated / ProfileUpdated 事件
  - 新增 CleanupTrigger（定时清理）
```

## Phase 2（MVP 稳定后）

```
目标：Event Bus 模式
  - 引入异步消费（Event 生产者不等待消费者完成）
  - 新增 InsightGenerated / NoveltySuggested / DeliveryDecision
  - 支持重试和死信队列
```

---

# 第六部分：实施原则

1. **新 Event 类型不修改已有类型** — 只需新增 Zod schema + 创建函数
2. **Internal Events 只追加，不修改** — 符合架构不变原则第 5 条（原始事件不可修改）
3. **Event 是唯一跨服务通信方式** — 未来拆微服务时，Event 表就是天然的消息队列
4. **不引入消息队列中间件** — Phase 2 之前，SQLite events 表就是 Event Store
