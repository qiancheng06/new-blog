<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 002 — Repository 抽象层

> 状态：待实现
> 目标：业务逻辑不直接依赖数据库实现

---

## 问题

当前代码中，业务层直接调用 SQLite：

```typescript
// cognition/operators.ts
import { getRecentEvents } from "../event/store.js"

// event/store.ts
import { query, run } from "../db/pool.js"
```

如果将来：
- SQLite → PostgreSQL
- 单文件 → 读写分离
- 单体 → 微服务（memory 独立部署）

每个调了 `query()` / `run()` 的地方都要改。

---

## 方案：Repository Interface + 一个实现

```
interface（抽象）
  ↑
class（具体实现：SQLite）
```

调用方只依赖 interface，不知道底层是 SQLite 还是 Postgres。

---

## 接口定义

### EventRepository

```typescript
interface EventRepository {
  insert(event: Event): EventRow
  getRecent(limit: number, offset?: number): EventRow[]
  getBySource(source: string, limit?: number): EventRow[]
  getSince(since: string, limit?: number): EventRow[]
  countToday(): number
}
```

### TopicRepository

```typescript
interface TopicRepository {
  getOrCreate(name: string): TopicRow
  touch(name: string): void
  updateSummary(name: string, summary: string): void
  getNeedingSummary(threshold: number): TopicRow[]
  getAll(): TopicRow[]
}
```

### ProfileRepository

```typescript
interface ProfileRepository {
  get(): Record<string, unknown>
  upsert(key: string, value: unknown, sourceEventId: string): void
}
```

### TimelineRepository

```typescript
interface TimelineRepository {
  insert(date: string, type: string, summary: string, sourceEventId: string): void
  getRecent(limit?: number): unknown[]
}
```

### DailyNoteRepository

```typescript
interface DailyNoteRepository {
  getToday(): DailyNoteRow | null
  upsert(date: string, summary: string, highlights: string[], topicDistribution: Record<string, number>): DailyNoteRow
}
```

### EpisodicRepository

> Phase 0: Stub（接口定义，Phase 1 正式实现）

```typescript
interface EpisodicRepository {
  insert(title: string, date: string, summary: string, sourceEventId: string): EpisodicRow
  getRecent(limit?: number): EpisodicRow[]
  getSince(since: string, limit?: number): EpisodicRow[]
  decay(): void
}
```

### TraceRepository

```typescript
interface TraceRepository {
  insert(traceId: string, stage: string, status: string, durationMs?: number, detail?: string): void
  getRecent(limit?: number): TraceRow[]
  getStats(): TraceStats
  cleanOld(maxRows: number): void
}
```

---

## 文件结构

```
src/
├── repository/
│   ├── interfaces.ts        ← 所有 interface 定义（纯抽象，零依赖）
│   ├── event.ts             ← EventSqliteRepository
│   ├── topic.ts             ← TopicSqliteRepository
│   ├── profile.ts           ← ProfileSqliteRepository
│   ├── timeline.ts          ← TimelineSqliteRepository
│   ├── daily-note.ts        ← DailyNoteSqliteRepository
│   ├── episodic.ts           ← EpisodicSqliteRepository（Phase 1）
│   ├── trace.ts             ← TraceSqliteRepository
│   └── index.ts             ← 实例化 + 导出
```

---

## 依赖注入方式

不引入 DI 框架，手动组装：

```typescript
// repository/index.ts
import { EventSqliteRepository } from "./event.js"
import { TopicSqliteRepository } from "./topic.js"
import { EpisodicSqliteRepository } from "./episodic.js"
// ...

export const eventRepo = new EventSqliteRepository()
export const topicRepo = new TopicSqliteRepository()
// ...
```

调用方只 import interface type 和 repo 实例：

```typescript
// cognition/operators.ts
import type { EventRepository } from "../repository/interfaces.js"
import { eventRepo } from "../repository/index.js"
// eventRepo 类型是 EventRepository，但运行时是 EventSqliteRepository
```

---

## 迁移路径

### 现在（Phase 1）

Repository 层直接包裹现有的 SQLite 查询。业务层从 `event/store.ts` 改为 `repository/index.ts`。

中间状态：`event/store.ts` 保留但标记 deprecated，新代码全部走 Repository。

### 未来（Phase 2+）

如果要换数据库：

```typescript
// 新增 event-pg.ts
export class EventPgRepository implements EventRepository {
  // Postgres 实现
}

// repository/index.ts
import { EventPgRepository } from "./event-pg.js"
export const eventRepo = new EventPgRepository()
```

一行不改业务代码。

---

## 不引入的依赖

| 依赖 | 原因 |
|------|------|
| TypeORM / Prisma / Drizzle | MVP 6 张表，ORM 带来的 schema 定义 + migration 开销 > 收益 |
| tsyringe / inversify | 不需要 DI 容器，手动组装够用 |
| 单元测试框架 mock | Repository 本身是薄实现层，测试价值低 |

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/repository/interfaces.ts` | 新增 |
| `src/repository/event.ts` | 新增（从 event/store.ts 迁移） |
| `src/repository/topic.ts` | 新增（从 memory/topic.ts 迁移） |
| `src/repository/profile.ts` | 新增（从 memory/profile.ts 迁移） |
| `src/repository/timeline.ts` | 新增（从 memory/timeline.ts 迁移） |
| `src/repository/daily-note.ts` | 新增（从 summary/daily.ts 迁移） |
| `src/repository/episodic.ts` | 新增（Phase 1，配套 episodic_memories 表） |
| `src/repository/trace.ts` | 新增（观测流时新建） |
| `src/repository/index.ts` | 新增 |
| `src/event/store.ts` | 标记 deprecated |
| `src/memory/topic.ts` | 删除（逻辑移至 repository） |
| `src/memory/profile.ts` | 删除（逻辑移至 repository） |
| `src/memory/timeline.ts` | 删除（逻辑移至 repository） |
| `src/summary/daily.ts` | 改为依赖 EventRepository + DailyNoteRepository |
| `src/cognition/operators.ts` | 改为依赖 Repository |
| `src/telegram/bot.ts` | 改为依赖 Repository |

---

## 原则

1. Interface 里不出现 SQLite 类型（`Database.RunResult` 等）
2. 每个 Repository 只负责一张表的 CRUD
3. Repository 不包含业务逻辑（if/else/判断阈值等）
4. 业务层不 import 任何 `db/pool` 相关的东西
