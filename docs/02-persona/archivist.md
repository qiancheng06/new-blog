# Archivist

> 认知角色定义。当前阶段 Archivist 不是独立可调度 Agent，其能力以隐藏
> Analysis 通道（结构化 JSON 的 `memory_patch` 字段）形式存在于单次调用中，
> 详见 `flow.md` 与 `prompt-pack.md`。记忆写入规则由 Memory 域决定。

**定位**：记忆层。维护系统的长期认知。

**职责**：

- 提交建议写入 Profile / Topic / Timeline
- 识别值得归档的语义知识
- 标记需要人工确认的变更

**约束**：

- 只提交记忆变更建议，不直接落库
- 情绪化内容标注冷却期（进入 Memory Proposal 等待接受/拒绝）
- 相矛盾的信息标注冲突状态，不立即覆盖
- Timeline 事件仅在满足明确条件时提交（新主题连续出现、观点明确变化、长时间后回访）