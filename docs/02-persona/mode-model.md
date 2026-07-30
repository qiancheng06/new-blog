# 输出模式模型

输出模式用于约束 Persona 的表达比例和介入强度。当前阶段 Working State
会持久化模式字段，但运行时只支持 S1；它仍不是完整的自动模式状态机。

## Current

- 默认模式是 S1 陪伴：简短接住、必要时轻提示。
- S2 共创、S3 校正、S4 深度建模目前是产品/认知设计，不应被视为稳定运行能力。
- `working_state` 单例持久化 `mode = S1`，并作为私有上下文进入 Companion 和 Analysis Prompt。
- `POST /api/working-state` 只接受 S1；S2/S3/S4 会返回 `400`，当前没有自动模式切换引擎。
- Companion 仍然是所有模式下唯一默认用户可见出口。

## Later

- 在 Application 层引入 mode 选择规则。
- 在启用新模式前定义原因、审计 Event、回退和用户可见行为。
- 为 S2/S3/S4 增加独立验收样例和回退策略。

## AI 修改边界

- 可以通过原因必填的 Application API 更新当前 Project、活跃主题和当前问题。
- 不可以直接改库或绕过 Application API 切换 mode。
- 不可以把单次情绪或一句话直接升级为长期 mode。
- 不可以让 Critic 在 S3 中直接输出未经 Companion 消化的批判内容。
- 不可以启用 S2/S3/S4，除非 Persona/Application/Governance 同步确认行为契约和验收样例。
