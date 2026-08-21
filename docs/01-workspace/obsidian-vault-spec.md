# Obsidian Vault 规格

Obsidian 是 Persona OS 的长期可视化与人工审计层。SQLite 和不可变 Event
仍是运行时事实源；Markdown 文件不能反向覆盖运行时投影。

## 当前目录

```text
<OBSIDIAN_VAULT_PATH>/
└── persona/
    ├── daily-notes/
    │   └── YYYY-MM-DD.md
    └── snapshots/
        └── Persona OS.md
```

- `PERSONA_DAILY_NOTE_DIR` 配置 Daily Note 目录，默认 `persona/daily-notes`。
- `PERSONA_OBSIDIAN_SNAPSHOT_DIR` 配置 Persona Snapshot 目录，默认
  `persona/snapshots`。
- `PERSONA_OBSIDIAN_SNAPSHOT_ENABLED` 控制每日自动 Snapshot；未显式配置时，
  有 Vault 则启用、无 Vault 则禁用。
- `PERSONA_OBSIDIAN_SNAPSHOT_TIME` 配置本地执行时间，默认 `00:15`，时区沿用
  `PERSONA_TIME_ZONE`。
- 两个配置都必须是无 `.`/`..` 的相对目录，最终规范路径必须位于 Vault
  内并且位于仓库外。

## 所有权边界

Persona 只拥有以下托管块：

```text
<!-- PERSONA:DAILY_NOTE --> ... <!-- /PERSONA:DAILY_NOTE -->
<!-- PERSONA:SNAPSHOT --> ... <!-- /PERSONA:SNAPSHOT -->
```

托管块外的用户内容必须原样保留。同名文件如果没有且仅有一个对应托管块，
导出返回冲突并保持文件不变。所有写入先写同目录临时文件，再原子替换；符号链接、
junction、目录逃逸和仓库内 Vault 均被拒绝。

## Persona Snapshot

`POST /api/archives/obsidian/snapshot` 手动刷新 `Persona OS.md`，内容包括：

- active Profile，值转换为可读文本；
- active Topic，包含摘要、消息计数和最近活跃时间；
- Timeline；
- 所有状态的 Project，包含摘要、主题和更新时间。

每类最多导出 500 条，超出时文件和 API 都明确标记 `truncated`。archived 或
suppressed Profile/Topic、pending/rejected Memory proposal、原始 Event、Prompt、
provider 输出和 Telegram 标识不会进入 Snapshot。

文件内容只由投影数据决定，因此数据未变化时导出状态为 `unchanged`，不会重写
Markdown。每次成功请求仍追加一个不含记忆正文的
`system/persona_snapshot_exported` 审计 Event。缺失或不可访问的 Vault 返回
`503`，同名用户文件冲突返回 `409`，失败路径不追加审计 Event。

完整 Persona Runtime 每天自动刷新一次 Snapshot。启动时会补偿最近一个已经到期
但未成功的计划日；`persona_snapshot_runs` 以计划日为幂等键，持久化
pending/running/succeeded/failed、attempt、有限错误码和成功审计 Event id，不存储
记忆正文或原始错误。中断的 running attempt 在下次启动时转为可重试失败，最旧的
未完成计划优先；失败退避从 15 分钟增长到最多 6 小时。调度失败令运行状态
degraded，但不阻断 API readiness。手动 API 不创建调度运行记录。

## Daily Note

Daily Note 使用确定性文件名 `YYYY-MM-DD.md`。手动或调度归档更新托管块并追加
`system/daily_note_exported` Event；Daily Note 投影同时记录 archive path、Event
和时间。重新生成当日摘要会清除旧归档状态，等待下一次归档刷新。

## 验证

```bash
npm.cmd run contract:obsidian-archive
npm.cmd run contract:obsidian-snapshot-scheduler
```

该契约在系统临时目录创建真实 Vault，覆盖创建、更新、幂等、用户内容保留、治理
过滤、审计、冲突、目录逃逸和临时文件清理，不访问用户真实 Vault。
调度契约额外覆盖时区边界、同日单飞、持久化失败、重试计划和启动恢复。
