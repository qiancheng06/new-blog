# Persona

## Real-Mode Quality Gate

- Do not add real DeepSeek calls to `verify:local`.
- Use `docs/07-product/real-mode-evaluation.md` when a human is validating real Companion quality.
- Real-mode replies must keep the same visibility boundary as the prompt fixture: Companion natural language only, with Critic/Researcher/Archivist/Memory patch hidden.
- If a real response leaks JSON or hidden analysis fields, treat it as a Persona quality failure even when the HTTP request succeeds.

## Prompt Fixture Contract

- Run `npm.cmd run fixture:persona` after changing Persona prompts, prompt builder behavior, or mock LLM assumptions.
- The fixture must stay no-network and must force mock mode before importing provider adapters.
- Companion output remains the only user-visible channel. It must not request JSON, expose `memory_patch`, or reveal private Memory context internals.
- Analysis output stays hidden and structured. Mock analysis must keep deterministic `research`, `critic`, and `memory_patch` shapes.
- Runtime schema validation rejects malformed Analysis fields before Memory
  writes and reports field paths without echoing provider or user content.
- History context must filter non-message events and keep only the latest bounded conversation window.

Persona 是认知表达域，负责系统如何理解、分析和回应用户。

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
