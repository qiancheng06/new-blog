# Persona

Persona 是认知表达域，负责系统如何理解、分析和回应用户。

## 真实模式质量门禁

- 不向 `verify:local` 添加真实 DeepSeek 调用。
- 人工验证真实 Companion 质量时使用 `docs/07-product/real-mode-evaluation.md`。
- 真实模式回复必须保持与 prompt fixture 相同的可见性边界：只输出 Companion
  自然语言，Critic/Researcher/Archivist/Memory patch 隐藏。
- 如果真实响应泄漏 JSON 或隐藏分析字段，即使 HTTP 请求成功也视为 Persona
  质量失败。

## Prompt Fixture 契约

- 修改 Persona prompt、prompt builder 行为或 mock LLM 假设后，运行
  `npm.cmd run fixture:persona`。
- fixture 必须保持无网络，并在导入厂商适配器前强制 mock 模式。
- Companion 输出仍是唯一用户可见通道。它不得请求 JSON、暴露 `memory_patch`
  或透露私有 Memory 上下文内部信息。
- Analysis 输出保持隐藏与结构化。mock analysis 必须保持确定性的
  `research`、`critic`、`memory_patch` 形状。
- 运行时 schema 校验在 Memory 写入前拒绝畸形 Analysis 字段，并只报告字段
  路径，不回显厂商或用户内容。
- Companion 回复是不可变 `system/companion_reply` Event，通过 `in_reply_to`
  关联其输入 Event。
- 历史上下文保留最近 10 条用户与 Companion Event，过滤无关 Event，且始终
  作为私有 prompt 上下文。

## 本域职责

- Companion 对外表达
- Researcher、Critic、Archivist 等认知算子
- Prompt、风格、模式、表达策略
- 决定内部分析如何被 Companion 消化后表达
- 定义 Prompt Builder 的输出边界：Companion 是唯一用户可见输出；Critic、Researcher、Archivist 默认隐藏；Memory context 只作为上下文

## 本域不负责

- 不直接持久化 Memory
- 不实现 HTTP、Telegram、数据库适配
- 不直接展示 UI
- 不绕过 Companion 暴露 Critic 输出
- 不把 Memory context 原文、内部标签、置信度或检索过程直接暴露给用户

## 常读文档

- [prompt-pack.md](prompt-pack.md)
- [style-guide.md](style-guide.md)
- [researcher.md](researcher.md)
- [critic.md](critic.md)
- [archivist.md](archivist.md)
- [delivery.md](delivery.md)
- [mode-model.md](mode-model.md)

## 相关代码位置

- `apps/persona/src/ai-runtime/prompts/persona.ts`
- `apps/persona/src/ai-runtime/prompts/prompt-builder.ts`
- `apps/persona/src/ai-runtime/operators/process-message.ts`
- `apps/persona/src/infra/llm/deepseek.ts`
- `apps/persona/src/domain/persona/`

## AI 修改前检查项

- 确认用户可见输出仍由 Companion 统一表达
- Critic 结果默认隐藏
- Memory context 只作为私有上下文参与生成，不进入最终回复
- 不把单次情绪直接写入长期画像
- Prompt 修改要检查返回 JSON 是否仍能被现有代码解析

## 跨域协作规则

- 需要写入 Topic/Profile/Timeline 时，交给 Memory 域
- 需要上下文检索时，交给 Application/Memory 域
- 需要模型供应商调整时，交给 Infra 域

## 验证口径

- Prompt/算子修改后运行 `npm.cmd run fixture:persona`（无网络契约）。
- 默认本地门禁：`npm.cmd run verify:local`。
- 真实 Companion 质量评估使用 `docs/07-product/real-mode-evaluation.md`。
