# 架构不变原则（Architecture Invariants）

> 本文件是 Persona OS 最高优先级的架构约束。任何 Vibe Coding Agent 进入项目时，必须首先阅读并遵守以下 8 条不可违反原则。

---

## 1. Event 是唯一输入单位

所有外部输入（Telegram、Web、API）必须先转换为 Event 再进入系统。不允许直接写入 Memory 或绕过 Event Core。

## 2. Companion 是默认输出层

用户看到的所有回复，默认经过 Companion 表达。其他 Operator 的输出不直接暴露给用户。

## 3. Critic 默认隐藏

Critic 的分析结果进入内部结构，不被直接展示。是否表达由 Companion 决定。

## 4. Obsidian 是长期记忆主库

当前代码使用 SQLite 作为运行时主库；长期目标可迁移 PostgreSQL。Obsidian 是长期可视化、人工审计和不可变归档层。

## 5. 原始事件不可修改

一旦入库，原始 Event 内容不可变更。修正只能通过追加校正事件（Correction Event）。

Workspace 可观测面板只能展示只读状态和事件摘要；它不能修改、删除、重放原始 Event，也不能通过面板状态反向补写 Memory 或 Profile。

## 6. Profile 只能渐进更新

用户画像禁止全量替换。每次更新必须是增量合并，来源可追溯。

## 7. 情绪不可直接写入长期画像

单次会话中的情绪波动不可写入 Profile。需经过冷却窗口（建议 24 小时）和交叉验证。

## 8. 所有复杂能力必须建立在 MVP 闭环完成之后

在 `Telegram → Event → Memory → Companion → Daily Summary → Obsidian` 链路稳定运行 30 天之前，不允许引入向量库、图数据库、多模型路由、Insight Engine 等进阶能力。

新增可观测能力优先记录在 `docs/01-workspace/`（展示面板）、`docs/04-application/`（只读查询出口）、`docs/05-infra/`（运行信号、日志、健康检查）中；跨域边界或不可违反约束变化再同步到 `docs/06-governance/`。
