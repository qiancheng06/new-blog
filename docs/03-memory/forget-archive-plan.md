# Profile And Topic Forget/Archive Plan

Status: P13 design plan.

This document defines the next governed step after Profile correction. It is a
plan, not an implemented schema migration.

## Goals

- Support hiding or retiring incorrect Profile/Topic projections without
  physically deleting source Events.
- Preserve the Event audit chain.
- Keep Workspace from directly editing SQLite or raw Memory rows.
- Make default Memory reads exclude suppressed rows once the projection layer is
  implemented.

## Non-Goals

- No physical deletion of Events.
- No SQL/admin cleanup API exposed to Workspace.
- No generic CRUD editor for Profile, Topics, or Timeline.
- No raw `memory_patch` write endpoint.
- No automatic topic/profile forgetting based on LLM judgement alone.

## Terms

Correction:
An append-only Event that updates the current projected value for a Profile key.
Implemented today through `POST /api/memory/profile/corrections`.

Suppression:
A governed decision that keeps the original Event and row for audit, but hides
the projected Profile/Topic row from default context building and Workspace
lists.

Archive:
A softer state for rows that remain queryable in management/debug views but no
longer participate in active context ranking.

Physical Delete:
Permanent row removal. This remains disallowed for normal Memory management and
should be reserved for explicit admin/data-retention tooling outside Workspace.

## Proposed Events

Add Event types:

```text
memory_profile_suppression
memory_profile_restore
memory_topic_suppression
memory_topic_restore
```

Payload shape:

```json
{
  "target_id": "profile-or-topic-row-id",
  "target_key": "optional profile key or topic name",
  "reason": "manual governance reason",
  "mode": "suppress | archive | restore"
}
```

Metadata:

```json
{
  "purpose": "memory_governance"
}
```

Events are immutable. Restoring must append a restore Event; it must not edit
the original suppression Event.

## Proposed Schema

Profile projection fields:

```sql
ALTER TABLE profile ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
  CHECK (state IN ('active', 'archived', 'suppressed'));
ALTER TABLE profile ADD COLUMN state_event_id TEXT REFERENCES events(id);
ALTER TABLE profile ADD COLUMN state_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE profile ADD COLUMN state_updated_at TEXT;
```

Topic projection fields:

```sql
ALTER TABLE topics ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
  CHECK (state IN ('active', 'archived', 'suppressed'));
ALTER TABLE topics ADD COLUMN state_event_id TEXT REFERENCES events(id);
ALTER TABLE topics ADD COLUMN state_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE topics ADD COLUMN state_updated_at TEXT;
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_profile_state_updated ON profile(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_state_active ON topics(state, last_active_at DESC);
```

SQLite migration note:
`CREATE TABLE IF NOT EXISTS` will not add columns to existing local databases.
Implementation must include an idempotent migration path that checks
`PRAGMA table_info(profile)` and `PRAGMA table_info(topics)` before running
`ALTER TABLE`.

## Read Semantics

Default active reads:

- `getMemoryContext()`
- `buildMemoryContextText()`
- `GET /api/memory`
- `GET /api/memory/profile`
- `GET /api/memory/topics`
- Workspace Memory/Profile panel

These should exclude `state = 'suppressed'` by default.

P14 must implement this filtering in the Memory domain read layer, not only in
HTTP/API handlers. If `getMemoryContext()` still returns archived or suppressed
rows, Companion will continue seeing hidden memories even when Workspace lists
look correct.

Management/debug reads may accept:

```text
state=active|archived|suppressed|all
```

Timeline rows should not get suppression in P13. Timeline is append-only and
must be handled later with correction or commentary Events.

## Write Semantics

Suppression flow:

1. Application validates target row exists.
2. Application appends a governance Event.
3. Memory domain updates only projection state fields on the target row.
4. API returns `eventId` and the updated row.

Restore flow:

1. Application validates target row exists.
2. Application appends a restore governance Event.
3. Memory domain sets `state = 'active'` and updates state provenance fields.
4. API returns `eventId` and the updated row.

Archive flow:

Archive can use the same suppression endpoint with `mode = "archive"`, but UI
copy must distinguish archive from suppress:

- archive: not active, still visible in management views
- suppress: hidden from default reads because it is wrong, unsafe, or stale

## Proposed API

Do not expose `PATCH /api/memory/profile/:id` or `DELETE`.

Proposed endpoints:

```text
POST /api/memory/profile/state
POST /api/memory/topics/state
```

Profile request:

```json
{
  "id": "profile-row-id",
  "state": "suppressed",
  "reason": "incorrect long-term inference"
}
```

Topic request:

```json
{
  "id": "topic-row-id",
  "state": "archived",
  "reason": "no longer active"
}
```

Response:

```json
{
  "eventId": "governance-event-id",
  "item": {
    "id": "row-id",
    "state": "suppressed",
    "state_event_id": "governance-event-id"
  }
}
```

## Workspace UX

The current Memory/Profile panel may add action controls only after backend
state projection exists.

Allowed controls:

- Archive
- Suppress
- Restore

Required UI copy:

- Explain that actions hide/retire projections, not source Events.
- Require a reason.
- Show the resulting governance Event id.

Disallowed controls:

- Delete
- Edit row id
- Raw JSON patch to Memory
- Direct database cleanup

## Tests

Backend contract:

- Invalid JSON returns 400.
- Missing target id returns 400.
- Unknown target id returns 404.
- Invalid state returns 400.
- Successful Profile suppression appends Event.
- Profile `state_event_id === eventId`.
- Default Profile list excludes suppressed rows.
- `state=all` includes suppressed rows.
- Restore appends a separate Event and returns row to active reads.

Memory domain:

- Existing databases receive new columns through idempotent migration.
- `getMemoryContext()` excludes suppressed rows.
- Archive rows are excluded from context but visible in management reads.
- Physical Event rows are never deleted.

Workspace contract:

- No `DELETE` or raw patch routes.
- Suppress/archive controls must call Application APIs only.
- Offline/error states do not mutate local UI as if the action succeeded.

## Rollout

1. Add idempotent SQLite migration support for projection state fields.
2. Add domain helpers for profile/topic state transitions.
3. Add Application governance use cases.
4. Add API contract tests.
5. Update Workspace panel with reason-required actions.
6. Re-run `npm.cmd run verify:local` and permissioned `npm.cmd run build`.

## Open Questions

- Should `archived` rows be excluded from Companion context immediately, or
  down-ranked until a later ranking model exists?
- Should Topic archive affect related Projects later?
- Should suppression support expiry/review dates?
- Should Obsidian write-back receive governance Event summaries before UI
  actions are enabled?
