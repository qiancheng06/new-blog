# 数据模型（Data Model）

> 当前代码实现使用 SQLite（`better-sqlite3`）。本文保留 PostgreSQL 风格字段说明作为长期目标，实际 schema 以 `apps/persona/src/infra/db/schema.sql` 为准。

---

## 表清单

### events

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| source | VARCHAR(32) | telegram / system |
| type | VARCHAR(64) | message / tick / ... |
| payload | JSONB | 事件主体数据 |
| timestamp | TIMESTAMPTZ | 事件发生时间 |
| metadata | JSONB | 来源元数据 |
| created_at | TIMESTAMPTZ | 入库时间 |

### topics

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| name | VARCHAR(255) | 主题名称 |
| first_seen_at | TIMESTAMPTZ | |
| last_active_at | TIMESTAMPTZ | |
| message_count | INT | 关联消息数 |
| summary | TEXT | 自动生成的摘要 |
| related_topics | UUID[] | 关联主题 ID |

### projects

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| name | VARCHAR(255) | |
| status | VARCHAR(32) | active / paused / done |
| topics | UUID[] | |
| summary | TEXT | |
| updated_at | TIMESTAMPTZ | |

### profile

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| key | VARCHAR(255) | interests / style / preferences |
| value | JSONB | |
| source_event_id | UUID | 来源事件 |
| updated_at | TIMESTAMPTZ | |

Profile 更新只能渐进写入。带 `cooling_required` 的 patch 当前不会直接落库，避免把单次会话情绪写入长期画像。

### timeline_events

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| date | DATE | |
| type | VARCHAR(32) | insight / shift / milestone |
| summary | TEXT | |
| source_event_id | UUID | |
| created_at | TIMESTAMPTZ | |

### daily_notes

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| date | DATE UNIQUE | |
| summary | TEXT | 日总结 |
| highlights | TEXT[] | |
| topic_distribution | JSONB | |
| created_at | TIMESTAMPTZ | |

## Memory patch persistence

`AnalysisResult.memory_patch` is persisted by the Memory domain without changing
the current SQLite schema:

- `topic_updates` maps to `topics`. `name` is unique, so writes are upserts:
  new topics are inserted, existing topics refresh `last_active_at`, increment
  `message_count`, and replace `summary` only when a new summary is provided.
- `profile_updates` maps to `profile`. `key` is unique, so writes are
  progressive upserts of the JSON-encoded `value` with the latest
  `source_event_id`.
- `timeline_events` maps to `timeline_events`. Writes are append-only and never
  update existing rows.
- One `memory_patch` is applied inside a single SQLite transaction. If any
  Topic, Profile, or Timeline write fails, all writes from that patch roll back.
- Governed Profile correction/state and Topic state changes also commit their
  audit Event and projection update in one transaction.

The source Event remains immutable. Memory writes only reference it through
`source_event_id`.
