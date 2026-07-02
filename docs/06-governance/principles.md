# 设计原则

本文件是架构原则的简短工作版。不可违反的硬约束以 `architecture-invariants.md` 为准。

## Current

- 当前项目采用模块化单体，不按微服务拆分。
- 当前运行时数据库是 SQLite；PostgreSQL 是长期可迁移目标。
- 架构域目录用于多 AI 分工：Workspace、Persona、Memory、Application、Infra、Governance、Product。
- 业务闭环优先于复杂平台能力。

## Later

- 当本地闭环稳定后，再评估事件总线、任务队列、多模型路由等扩展。
- 当数据规模和协作需求明确后，再评估 PostgreSQL、对象存储或向量检索。
- 当多 AI 分工稳定后，再细化每个域的代码所有权。

## AI 修改边界

- 修改原则前必须先检查 `architecture-invariants.md`。
- 不可以用“未来微服务设计”覆盖当前模块化单体事实。
- 不可以把愿景能力写成已完成实现。
- 不可以在文档中引导 AI 绕过架构域边界直接改其它层。
