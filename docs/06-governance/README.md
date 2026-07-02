# Governance

Governance 是协作、约束和质量守门域。

## 本域职责

- 架构不变原则
- AI 协作规则
- 编码标准
- 调试手册
- 历史文档使用规则

## 本域不负责

- 不承载产品愿景
- 不定义具体 Prompt
- 不设计 UI
- 不替代领域文档

## 常读文档

- [architecture-invariants.md](architecture-invariants.md)
- [instructions.md](instructions.md)
- [coding-standards.md](coding-standards.md)
- [debug-playbook.md](debug-playbook.md)
- [principles.md](principles.md)

## 相关代码位置

- 全局适用

## AI 修改前检查项

- 先读架构不变原则
- 不根据 archive 文档直接改当前实现
- 不为未闭环 MVP 引入复杂能力
- 不越权修改用户未要求的文件

## 跨域协作规则

- 任何跨域重构必须更新对应域 README
- 任何新增外部依赖必须说明原因和影响范围
- 任何违反不变原则的需求必须先停下来确认

## 验证口径

- 默认验收入口是 `npm.cmd run verify:local`，详见 [instructions.md](instructions.md)。
- 默认验证只覆盖可在仓库和本机 mock 环境中稳定复现的检查。
- 真实 Telegram/LLM、长驻监听、浏览器人工点击和 Obsidian vault 完整性属于本机权限验收，不作为默认验证前提。
