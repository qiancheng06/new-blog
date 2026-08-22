# 同步规范（Sync Spec）

> 当前运行时主库是 SQLite；长期目标可迁移 PostgreSQL。本文件描述 Obsidian
> 与运行时数据之间的单向同步边界。

## 总体方向

- 内容主库：Obsidian Vault（knowledge / todo / blog）与 `apps/workspace/projects/*.md`。
- 前端读模型：`apps/workspace/public/data/`（projects.json / todos.json /
  knowledge.json / blog-posts.json + blog/*.md），由 `sync-projects.js` 生成，忽略 git。
- Persona 运行时事实源：SQLite（events / projects / todos / working_state /
  calendar / memory / daily_notes 等投影）。
- 反向写入：Persona 只向 Obsidian 写 Daily Note 与 Persona Snapshot 托管块，
  不反向覆盖知识 / 待办 / 博客。

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

## 博客同步

- 源：`<vault>/blog/*.md`（frontmatter: title / date / tags）。
- 读模型：`public/data/blog-posts.json`（文章元数据）+ `public/data/blog/<slug>.md`
  （正文副本），供独立博客 `:5175` 渲染。
- `watch.js` 监听 blog 目录，变更后自动重新生成。

## 验证

```bash
npm.cmd run sync
npm.cmd run watch
```
