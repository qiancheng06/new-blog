# 同步规范

> // TODO: V1 — 运行时数据库与 Obsidian 同步逻辑定义。当前代码使用 SQLite；长期目标可迁移 PostgreSQL。MVP 阶段优先完成系统记忆到 Obsidian 的单向归档。

## Persona Daily Note archive contract

- Direction is one-way from the SQLite Daily Note projection to Obsidian.
- The target is `<vault>/<PERSONA_DAILY_NOTE_DIR>/YYYY-MM-DD.md`.
- Governed Persona snapshots target
  `<vault>/<PERSONA_OBSIDIAN_SNAPSHOT_DIR>/Persona OS.md` through the manual
  Application API; they are not reverse-imported into Workspace or Persona.
- Persona may create the file or replace its single managed block; all content
  outside the block belongs to the user and must be preserved byte-for-byte.
- An unmanaged same-name file is a conflict, never an implicit migration.
- Every successful request, including an unchanged export, appends an immutable
  `daily_note_exported` Event for auditability.
- Regeneration clears the projection's archive marker until the refreshed note
  is exported again.
- Reverse sync and general-purpose vault synchronization are outside the MVP.
