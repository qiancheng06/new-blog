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
| source_event_id | UUID UNIQUE | immutable creation provenance |
| name | VARCHAR(200) UNIQUE | user-managed Project name |
| status | VARCHAR(32) | active / paused / done / archived |
| topics | JSON array | user-managed Topic labels |
| summary | TEXT | |
| state_event_id | UUID | latest lifecycle audit Event |
| state_reason | TEXT | required lifecycle reason |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | done-state timestamp |
| archived_at | TIMESTAMPTZ | archived-state timestamp |

Project is a user-managed working projection, not an inferred long-term Memory
record. Active Projects can be used as private Prompt context without entering
`memory_search`.

### todos

| Column | Type | Notes |
|------|------|------|
| id | UUID PK | |
| source_event_id | UUID UNIQUE | immutable creation provenance |
| project_id | UUID FK nullable | optional Project relationship |
| project_event_id | UUID FK nullable | latest assignment audit Event |
| project_reason | TEXT | latest assignment reason |
| title | VARCHAR(500) | user-managed task title |
| due_date | DATE nullable | optional local due date |
| status | TEXT | open / done / cancelled |
| state_event_id | UUID FK nullable | latest lifecycle audit Event |
| state_reason | TEXT | latest lifecycle reason |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | done-state timestamp |
| cancelled_at | TIMESTAMPTZ | cancelled-state timestamp |

### profile

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| key | VARCHAR(255) | interests / style / preferences |
| value | JSONB | |
| source_event_id | UUID | 来源事件 |
| updated_at | TIMESTAMPTZ | |

Profile 更新只能渐进写入。带 `cooling_required` 的 patch 不会直接进入
Profile，而是进入 `memory_proposals` 等待显式接受或拒绝，避免把单次会话
情绪直接写入长期画像。

### memory_proposals

| Column | Type | Notes |
|------|------|------|
| id | UUID PK | proposal identity |
| source_event_id | UUID FK | immutable Analysis source Event |
| proposal_type | TEXT | currently `profile` |
| proposal_key | TEXT | candidate Profile key |
| proposed_value | JSON text | candidate Profile value |
| confidence | REAL | bounded 0-1 model confidence |
| status | TEXT | pending / accepted / rejected |
| review_event_id | UUID FK | immutable accept/reject audit Event |
| review_reason | TEXT | required human reason after review |
| created_at | TIMESTAMPTZ | |
| reviewed_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

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
| source_event_id | UUID | latest `summary_ready` provenance |
| archive_path | TEXT | relative Obsidian path |
| archive_event_id | UUID | latest `daily_note_exported` provenance |
| archived_at | TIMESTAMPTZ | latest archive completion |
| finalized_at | TIMESTAMPTZ | automatic previous-day closure marker |
| created_at | TIMESTAMPTZ | |

### memory_search (derived FTS5 projection)

| Column | Type | Notes |
|------|------|------|
| entity_type | UNINDEXED TEXT | profile / topic / timeline / daily_note |
| entity_id | UNINDEXED UUID | source projection identity |
| title | FTS TEXT | key, topic name, type, or note date |
| body | FTS TEXT | JSON value, summary, or note content |
| state | UNINDEXED TEXT | active / archived / suppressed |
| source_event_id | UNINDEXED UUID | source provenance where available |
| memory_date | UNINDEXED TEXT | recency tie-breaker |

`memory_search` is never a source of truth. Triggers synchronize source writes
and startup rebuilds the entire index. Search and Prompt retrieval always filter
`state = active`; proposals are not indexed.
| updated_at | TIMESTAMPTZ | |

### conversation_jobs

| Column | Type | Notes |
|------|------|------|
| id | UUID PK | execution identity |
| source_event_id | UUID UNIQUE | immutable input Event |
| status | TEXT | pending / running / succeeded / failed |
| attempt_count | INTEGER | monotonic attempt number |
| error_code | TEXT | bounded recovery code only |
| reply_event_id | UUID UNIQUE | successful `companion_reply` Event |
| retry_event_id | UUID | latest retry audit Event |
| started_at | TIMESTAMPTZ | latest attempt start |
| finished_at | TIMESTAMPTZ | latest terminal transition |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### daily_summary_runs

| Column | Type | Notes |
|------|------|------|
| date | DATE PK | local Daily Note date |
| status | TEXT | pending / running / succeeded / failed |
| attempt_count | INTEGER | monotonic attempt number |
| error_code | TEXT | bounded recovery code only |
| archive_requested | BOOLEAN | current optional archive policy |
| started_at | TIMESTAMPTZ | latest attempt start |
| finished_at | TIMESTAMPTZ | latest terminal transition |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

## Memory patch persistence

`AnalysisResult.memory_patch` is persisted by the Memory domain through the
current SQLite projections:

- `topic_updates` maps to `topics`. `name` is unique, so writes are upserts:
  new topics are inserted, existing topics refresh `last_active_at`, increment
  `message_count`, and replace `summary` only when a new summary is provided.
- `profile_updates` maps to `profile`. `key` is unique, so writes are
  progressive upserts of the JSON-encoded `value` with the latest
  `source_event_id`. A `cooling_required` update maps to `memory_proposals`
  instead and remains outside AI context until accepted.
- `timeline_events` maps to `timeline_events`. Writes are append-only and never
  update existing rows.
- One `memory_patch` is applied inside a single SQLite transaction. If any
  Topic, Profile, Timeline, or proposal write fails, all writes from that patch
  roll back.
- Governed Profile correction/state and Topic state changes also commit their
  audit Event and projection update in one transaction.
- Proposal acceptance commits its review Event, Profile upsert, and terminal
  proposal state in one transaction; rejection commits only the review Event
  and terminal proposal state.

The source Event remains immutable. Memory writes only reference it through
`source_event_id`.
