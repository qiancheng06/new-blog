# 记忆模型（Memory Schema）

> 内存结构用于运行时认知。长期归档依赖 Obsidian Vault。

---

## Working State（运行时）

```typescript
interface WorkingState {
  current_project: string
  active_topics: string[]
  current_questions: string[]
  mode: 'S1' | 'S2' | 'S3' | 'S4'
  last_interaction_at: string
}
```

## Topic

```typescript
interface Topic {
  id: string
  name: string
  first_seen_at: string
  last_active_at: string
  message_count: number
  summary: string
  related_topics: string[]
}
```

## Project

```typescript
interface Project {
  id: string
  name: string
  status: 'active' | 'paused' | 'done'
  topics: string[]
  summary: string
  updated_at: string
}
```

## Profile

```typescript
interface Profile {
  interests: string[]
  communication_style: string[]
  thinking_preferences: string[]
  updated_at: string
}
// 仅渐进更新，不可全量替换
```

## Timeline

```typescript
interface TimelineEvent {
  id: string
  date: string
  type: 'insight' | 'shift' | 'milestone'
  summary: string
  source_event_id: string
}
```

---

## 写入规则

- Profile 每次更新记录 source_event_id
- Timeline 事件由 Archivist 建议，人工确认后可写入
- Topic summary 在消息数超过阈值（默认 5 条）后自动生成
