# Delivery Layer

Delivery Layer 负责“是否说、何时说、怎么说、说多少”。当前阶段它是设计边界，不是独立运行时模块。

## Current

- 当前用户可见输出由 Companion 直接生成。
- Delivery 没有独立代码路径、队列、延迟发送或多渠道策略。
- Telegram/API/Web 入口只接收 Companion 的最终回复。
- Critic、Analysis、Memory context 默认不直接暴露给用户。

## Later

- 在回复前加入轻量策略：信息密度、语气强度、是否延后提醒。
- 支持不同通道的表达策略，例如 Telegram 更短，Workspace 可展示结构化摘要。
- 支持主动消息，但必须有事件来源、审计记录和关闭机制。

## AI 修改边界

- 可以在 prompt 中要求 Companion 更克制、更清晰或更贴近当前模式。
- 不可以新增后台主动推送、定时提醒或情绪干预，除非 Application 和 Governance 已定义规则。
- 不可以把 Delivery 写成独立微服务；当前项目保持模块化单体。
- 不可以把“愿景中的 Delivery Engine”描述成已实现能力。
