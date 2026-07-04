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
- [memory-schema.md](memory-schema.md)
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

## Memory patch write API

`apps/persona/src/domain/memory/store.ts` provides the minimal domain write API for
persisting `AnalysisResult.memory_patch` after the source Event has already been
inserted.

- `applyMemoryPatch(patch, { sourceEventId })`: writes topic, profile, and
  timeline changes in one domain call.
- `upsertTopicUpdates(updates)`: creates topics by name or refreshes existing
  topics, increments `message_count`, and updates `last_active_at`.
- `upsertProfileUpdates(updates, { sourceEventId })`: progressively updates
  profile keys by replacing the JSON value and latest source event reference.
  Updates marked `cooling_required` are skipped until a later verified flow.
- `appendTimelineEvents(events, { sourceEventId })`: appends immutable timeline
  rows. Existing timeline rows are never updated.
- `getMemoryContext({ topicLimit, profileLimit, timelineLimit })`: reads the
  latest topic, profile, and timeline rows for AI runtime context.
- `inspectMemory({ topicLimit, profileLimit, timelineLimit })`: returns a
  read-only inspection snapshot with stats plus topic/profile/timeline rows for
  tests, debug panels, and future management UI.
- `buildMemoryContextText()`: formats the current memory context into a compact
  text block that Persona can include in its system prompt.

This API does not mutate Events. The caller is responsible for inserting the
Event first and passing the saved Event id as `sourceEventId`.

## Current read loop

`apps/persona/src/ai-runtime/operators/process-message.ts` now reads memory before
calling Companion:

1. Application saves the incoming Event.
2. AI runtime loads recent Memory through `buildMemoryContextText()`.
3. Companion receives the base prompt plus long-term memory context.
4. Analysis runs asynchronously and returns a `memory_patch`.
5. Memory writes the patch with the saved Event id as provenance.

This is the current minimal memory loop. It is intentionally simple: Memory
decides how rows are read and written, while Persona only consumes formatted
context and proposes future patches.

## Read-only inspection contract

Current Memory inspection is read-only. It may expose:

- counts for `topics`, `profile`, and `timeline_events`
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
through SQLite files or domain stores directly. The current read-only routes are:

- `GET /api/memory`
- `GET /api/memory/topics?limit=&offset=&name=`
- `GET /api/memory/profile?limit=&offset=&key=`
- `GET /api/memory/timeline?limit=&offset=&type=&date=&sourceEventId=`
- `GET /api/memory/sources`

These routes are implemented through `apps/persona/src/application/memory.ts`.
They do not edit, archive, delete, merge, or rewrite Memory. `ProfileRow.value`
is returned as the stored JSON string; UI parsing/editing belongs to a later
governed management flow.

## Timeline type normalization

LLM analysis is runtime JSON, so Memory must validate it even when TypeScript
types are narrower. `timeline_events.type` is normalized before insert:

- accepted values: `insight`, `shift`, `milestone`
- unknown values from a provider are stored as `insight`

This prevents provider output such as `decision` from violating the SQLite
constraint. The no-network `npm.cmd run inspect:memory` contract covers this
normalization.

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
