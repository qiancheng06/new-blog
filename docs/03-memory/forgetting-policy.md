# 遗忘策略

遗忘策略定义 Memory 何时压缩、降权或停止使用旧信息。当前阶段重点是“不误删、不伪造、不越权”。

## Current

- 当前实现使用 SQLite 作为运行时存储。
- Event 是不可变事实源，不做物理删除或改写。
- Topic/Profile/Timeline 可以渐进更新，但必须保留来源事件引用。
- 当前没有自动遗忘引擎、长期压缩任务或 Obsidian 自动归档闭环。

## Later

- 为低置信度 Profile 增加冷却期和复核流程。
- 将过旧、低频、低价值 Topic 标记为 inactive，而不是直接删除。
- 生成可人工审阅的 Daily/Weekly memory summary。
- 在长期目标中可迁移 PostgreSQL；当前文档和代码仍按 SQLite 实现描述。

## AI 修改边界

- 可以提出降权、合并、归档建议，但不能删除原始 Event。
- 不可以把一次性情绪、玩笑或假设写成长期 Profile。
- 不可以绕过 Memory 域直接改数据库。
- 不可以把 Obsidian 描述为当前唯一运行时主库；当前运行时主库是 SQLite。
## Current Inspection Boundary

Current inspection APIs are read-only. They can expose stats and recent
Topic/Profile/Timeline rows, but they cannot delete, archive, or rewrite memory.

Safe archive/delete behavior is a later governed design. Prefer corrective
events, inactive markers, or deactivation flags before considering physical
deletion. Event rows remain immutable facts and must not be physically deleted
by Memory flows.
