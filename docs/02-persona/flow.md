# 认知流程

本文件定义 Persona 域在当前阶段的认知调用边界。它描述“怎么组织回复”，不定义 HTTP、Telegram、数据库 schema 或 Workspace UI。

## Current

当前实现是模块化单体内的最小闭环：

1. Application 先把外部输入保存为 Event。
2. AI Runtime 读取 Memory 域提供的上下文文本。
3. Prompt Builder 组装 Companion 与 Analysis 所需 prompt。
4. Companion 生成唯一用户可见回复。
5. Analysis 异步产出 `memory_patch`。
6. Memory 域决定 patch 如何写入 Topic、Profile、Timeline。

Note、Idea、Journal 走同一条 Event -> Analysis -> Memory 路径，但不调用
Companion，也不创建用户可见回复。它们的 Event 与 Analysis job 原子创建，
失败后复用现有任务恢复 API。Todo 和 Project 仍是用户管理的工作投影，
不会因为这条 Capture 路径自动进入长期 Memory。

当前不要把 Researcher、Critic、Archivist 当作独立可调度 Agent。它们是 Persona 设计中的认知角色，部分能力仍处于文档/愿景阶段。

## Later

- 为 Researcher、Critic、Archivist 增加明确的调用时机和输出协议。
- 引入可审计的认知链路 trace。
- 将 mode、delivery、novelty 变成可配置策略。

这些能力必须建立在 Event -> Memory -> Companion 的本地闭环稳定之后。

## AI 修改边界

- 可以修改 Prompt Builder 的组织规则，但不能绕过 Companion 直接把 Critic/Analysis 输出给用户。
- 可以调整 Analysis 的 JSON schema，但必须同步 `prompt-pack.md` 和现有解析代码。
- 不可以在 Persona 域直接写 SQLite 或创建新的存储路径；需要交给 Memory/Infra。
- 不可以声明多 Agent 编排已经实现，除非代码中已有对应入口和验证命令。
