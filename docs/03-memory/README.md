# Memory

Memory 是系统自动沉淀的记忆域，负责 Event、Topic、Profile、Timeline 和 Daily Note。

## 本域职责

- Event 作为不可变事实源
- Topic/Profile/Timeline/Daily Note 的模型和更新规则
- 记忆合并、遗忘、冷却窗口和来源追溯
- 为 Context 和 Persona 提供可检索材料

## 本域不负责

- 不管理用户主动创建的 Knowledge、Project、Todo、Blog
- 不直接调用 LLM 生成对外回复
- 不实现 UI
- 不直接处理外部输入，输入必须先成为 Event

## 常读文档

- [event-schema.md](event-schema.md)
- [data-model.md](data-model.md)
- [forgetting-policy.md](forgetting-policy.md)
- [../06-governance/architecture-invariants.md](../06-governance/architecture-invariants.md)

## 相关代码位置

- `apps/persona/src/domain/event/types.ts`
- `apps/persona/src/domain/event/store.ts`
- `apps/persona/src/domain/memory/`
- `apps/persona/src/infra/db/schema.sql`
- `apps/persona/src/infra/db/pool.ts`

## AI 修改前检查项

- 原始 Event 不可修改，只能追加校正事件
- Profile 只能渐进更新，必须保留来源
- 情绪类判断需要冷却和交叉验证
- schema 变更必须同步 Infra 和 Governance 文档

## 跨域协作规则

- Persona 产出的 memory patch 由 Memory 域决定如何落库
- Workspace 主动内容不自动等同于 Memory
- Infra 负责数据库适配，Memory 负责业务语义

## 验证口径

- 记忆读取/写入契约：`npm.cmd run inspect:memory`。
- 记忆检索契约：`npm.cmd run contract:memory-search`。
- 提案治理与事务契约：`npm.cmd run contract:memory-transaction`。
- 默认本地门禁：`npm.cmd run verify:local`。

## Memory patch write API

`apps/persona/src/domain/memory/store.ts` provides the minimal domain write API for
persisting `AnalysisResult.memory_patch` after the source Event has already been
inserted.

- `applyMemoryPatch(patch, { sourceEventId })`: writes topic, profile, timeline,
  and cooled Profile proposals in one domain transaction.
- `upsertTopicUpdates(updates)`: creates topics by name or refreshes existing
  topics, increments `message_count`, and updates `last_active_at`.
- `upsertProfileUpdates(updates, { sourceEventId })`: progressively updates
  profile keys by replacing the JSON value and latest source event reference.
  Updates marked `cooling_required` never enter Profile directly; they are
  persisted as pending `memory_proposals` for explicit review.
- `appendTimelineEvents(events, { sourceEventId })`: appends immutable timeline
  rows. Existing timeline rows are never updated.
- `getMemoryContext({ topicLimit, profileLimit, timelineLimit })`: reads the
  latest topic, profile, and timeline rows for AI runtime context.
- `inspectMemory({ topicLimit, profileLimit, timelineLimit })`: returns a
  read-only inspection snapshot with stats plus topic/profile/timeline rows for
  tests, debug panels, and future management UI.
- `buildMemoryContextText()`: formats the current memory context into a compact
  text block that Persona can include in its system prompt.
- `searchMemory(query, { limit })`: searches active Profile, Topic, Timeline,
  and Daily Note projections through the derived SQLite FTS index.

This API does not mutate Events. The caller is responsible for inserting the
Event first and passing the saved Event id as `sourceEventId`.

## Daily Note projection

`apps/persona/src/domain/daily-note/store.ts` owns the SQLite projection for one
Daily Note per local calendar date. Application generation follows these rules:

- source Events remain immutable
- user messages, notes, todos, ideas, journals, and linked Companion replies form
  a bounded private summary context
- each generation appends a `system/summary_ready` Event
- the Daily Note upsert and audit Event are committed in one transaction
- regenerating a date preserves the Daily Note id and updates its
  `source_event_id` to the latest `summary_ready` Event
- a successful Obsidian archive records `archive_path`, `archive_event_id`, and
  `archived_at` on the projection and appends a `daily_note_exported` Event
- regenerating a date clears those archive fields so stale archive state is not
  presented as current; the next archive request refreshes the managed block
- manual generation leaves `finalized_at` empty; the runtime scheduler sets it
  only when closing the previous local date
- a finalized note is an idempotency marker for automatic generation; an
  unarchived finalized note lets recovery resume at Obsidian archive without
  repeating the model call
- `daily_summary_runs` persists one scheduler state machine per target date;
  interrupted `running` attempts become retryable after restart and retain only
  bounded error codes, never note content or provider output

The public read shape parses `highlights` and `topic_distribution` into arrays
and objects; their SQLite columns remain JSON text.

## Governed Obsidian snapshot

`POST /api/archives/obsidian/snapshot` exports a bounded, readable projection
without changing Memory state. It includes active Profile and Topic rows,
Timeline, and Project working state. Archived/suppressed Memory and all pending
or rejected proposals stay out of the file, matching Prompt/search visibility.

The deterministic Markdown managed block is derived only from projection data,
so a repeated export can be `unchanged`. Every successful request appends a
`persona_snapshot_exported` Event with path/status/count metadata but no Memory
content. The Snapshot is an audit view, not a new source of truth or a reverse
write path into SQLite.

The full runtime refreshes this view once per configured local day. A durable
`persona_snapshot_runs` row makes each schedule date single-flight and supports
startup compensation, interrupted-attempt recovery, and bounded retries. Run
state contains no Memory text. Manual exports remain available without changing
scheduled-run state.

## Current read loop

`apps/persona/src/ai-runtime/operators/process-message.ts` now reads memory before
calling Companion:

1. Application saves the incoming Event.
2. AI runtime searches Memory using the current user text and also loads bounded
   recent active Memory.
3. Companion receives relevant results first, followed by deduplicated recent
   long-term context.
4. Analysis runs asynchronously and returns a `memory_patch`.
5. Analysis calls may overlap, but Memory commits follow input reservation order.
6. Memory writes stable patch items and pending cooled proposals with the saved
   Event id as provenance.

A failed Analysis releases its queue slot so later Memory commits continue. If
Companion fails before Analysis is scheduled, the reservation is cancelled for
the same reason. This keeps replies responsive without allowing an older,
slower patch to overwrite newer Profile state.

## Durable Analysis jobs

Every asynchronous Analysis is represented by one `analysis_jobs` row keyed by
its immutable source Event. The state machine is `pending -> running ->
succeeded|failed`; attempts use privacy-safe error codes and never persist user
text, provider output, or raw exception messages.

Memory projection writes and `succeeded` commit in one database transaction.
Manual retries are allowed only from `failed`, append an
`analysis_retry_requested` Event, and increment `attempt_count`. Jobs left in
`pending` or `running` after a process interruption become failed with
`error_code = interrupted` on the next runtime start.

Profile updates compare source Event timestamps. A recovered older Analysis may
still add its previously unwritten Topic or Timeline evidence, but it cannot
replace Profile state already sourced from a newer Event.
When timestamps tie, Event insertion order breaks the tie. Governed manual
Profile corrections explicitly bypass this automatic stale-source guard.

This is the current minimal memory loop. It is intentionally simple: Memory
decides how rows are read and written, while Persona only consumes formatted
context and proposes future patches.

## Query-aware retrieval

`memory_search` is a derived SQLite FTS5 table using the trigram tokenizer. It
indexes active-state metadata for Profile, Topic, Timeline, and Daily Note
projections. Source tables remain authoritative:

- insert/update/delete triggers synchronize runtime writes
- `initializeDb()` rebuilds the complete index from source projections
- exact substring matches rank first; trigram term matches provide broader
  Chinese and Latin recall
- one- and two-character searches use the exact substring path
- archived or suppressed Profile/Topic rows remain indexed with their state but
  are excluded from all search and Prompt retrieval
- pending/rejected proposals are never indexed
- Prompt retrieval catches index failures and falls back to bounded recent
  Memory; the explicit search API still reports failures for diagnosis

Relevant results are capped and each formatted item is truncated before Prompt
assembly. FTS rows are not provenance and must never be edited directly.

## Cooling and proposal review

`cooling_required` is a governance boundary, not a discard flag. Each valid
cooled Profile update becomes one deduplicated pending `memory_proposals` row.
Pending and rejected values are excluded from Profile and therefore cannot
enter Companion prompts.

Application exposes:

- `GET /api/memory/proposals?status=&sourceEventId=&limit=&offset=`
- `POST /api/memory/proposals/:id/review`

Review requires `decision = accept|reject` and a non-empty reason. Acceptance
atomically appends a `memory_proposal_accepted` Event, writes the proposed value
to Profile, and marks the proposal accepted. Rejection appends a
`memory_proposal_rejected` Event and leaves Profile unchanged. A proposal can be
reviewed only once; later attempts return a conflict.

## Read-only inspection contract

Current Memory inspection is read-only. It may expose:

- counts for active `topics`, active `profile`, `timeline_events`, and pending
  Memory proposals
- recent `TopicRow` records ordered by activity
- recent `ProfileRow` records ordered by update time
- recent `TimelineEventRow` records ordered by date and creation time

It must not delete, archive, rewrite, or directly mutate Events. Any future
delete/archive behavior must be modeled as a separate governed flow with clear
provenance and should prefer deactivation or corrective events over physical
deletion.

Run the no-network inspection contract from the repository root:

```bash
npm.cmd run inspect:memory
```

## Application read API

Workspace and debug panels must read Memory through Application HTTP APIs, not
through SQLite files or domain stores directly. The current read routes are:

- `GET /api/memory`
- `GET /api/memory/topics?limit=&offset=&name=`
- `GET /api/memory/profile?limit=&offset=&key=`
- `GET /api/memory/timeline?limit=&offset=&type=&date=&sourceEventId=`
- `GET /api/memory/sources`
- `GET /api/memory/search?q=&limit=`
- `GET /api/memory/proposals?status=&sourceEventId=&limit=&offset=`

These routes are implemented through `apps/persona/src/application/memory.ts`.
These reads do not edit, archive, delete, merge, or rewrite Memory.
`ProfileRow.value` and proposal values are returned as stored JSON strings.

## Timeline type normalization

LLM analysis is runtime JSON, so Memory must validate it even when TypeScript
types are narrower. `timeline_events.type` is normalized before insert:

- accepted values: `insight`, `shift`, `milestone`
- unknown values from a provider are stored as `insight`

This prevents provider output such as `decision` from violating the SQLite
constraint. The no-network `npm.cmd run inspect:memory` contract covers this
normalization.

## Governed Profile Corrections

P12 introduces one governed write operation:

```text
POST /api/memory/profile/corrections
```

Request:

```json
{
  "key": "communication_style",
  "value": ["prefers concise planning"],
  "reason": "manual correction from Workspace"
}
```

This is not a generic edit/delete API. The Application layer first appends a
`memory_profile_correction` Event with `metadata.purpose = "memory_governance"`.
Memory then updates the Profile row through the normal domain write path and
sets `source_event_id` to the correction Event id.

Do not add profile delete, raw Memory patch, or SQL/admin cleanup routes without
a separate schema/projection design. Forgetting or hiding profile facts requires
a later governed flow; physical deletion must not be used as a shortcut.

## Real-Mode Evaluation Cleanup Boundary

Real-mode evaluation must use a unique `evaluationRunId` / tag before sending
test messages. Workspace `/api/chat` accepts `evaluationRunId`; Telegram can use
the local `PERSONA_EVALUATION_RUN_ID` environment variable before
`npm.cmd run dev:backend`.

Preview tagged test data:

```bash
npm.cmd run cleanup:real-mode -- --tag eval-20260703-real-mode
```

Apply the safe cleanup portion:

```bash
npm.cmd run cleanup:real-mode -- --tag eval-20260703-real-mode --apply
```

Automatic cleanup is intentionally narrow:

- `timeline_events` with `source_event_id` pointing to tagged Events may be
  deleted because they are append-only Memory rows.
- `profile` rows are listed for review, not deleted automatically. Profile is an
  upsert table, so deleting a row may remove a long-term fact that existed before
  the test.
- `topics` are listed for review, not deleted automatically. Topics currently do
  not store `source_event_id`.
- `events` are listed for review, not deleted automatically. Events remain the
  immutable fact source unless a separate governance/admin cleanup is approved.
