# Overview

本目录是所有 AI 和协作者进入项目时的第一入口。先用这里建立共同事实，再进入具体架构域。

## 本域职责

- 说明项目当前真实架构和合并状态
- 维护跨域术语、领域地图和 AI 加载顺序
- 区分当前实现、半实现能力和长期愿景

## 本域不负责

- 不定义具体 UI 细节
- 不维护 Prompt 内容
- 不设计数据库表细节
- 不记录历史路线和旧方案

## 常读文档

- [current-architecture.md](current-architecture.md)
- [deployment-and-client-architecture.md](deployment-and-client-architecture.md)
- [domain-map.md](domain-map.md)
- [glossary.md](glossary.md)
- [AI_LOADING_GUIDE.md](AI_LOADING_GUIDE.md)
- [agent-work-allocation.md](agent-work-allocation.md)
- [next-agent-task-queue.md](next-agent-task-queue.md)
- [../06-governance/checkpoint-review-packet.md](../06-governance/checkpoint-review-packet.md)
- [../06-governance/architecture-invariants.md](../06-governance/architecture-invariants.md)

## 相关代码位置

- `apps/persona/src/main/index.ts`
- `apps/persona/src/interface/`
- `apps/persona/src/application/`
- `apps/persona/src/domain/`
- `apps/persona/src/ai-runtime/`
- `apps/persona/src/infra/`
- `apps/workspace/scripts/`
- `apps/workspace/.vitepress/`
- `apps/workspace/legacy/` (legacy standalone HTML assets, not the primary browser entrypoint)
- `apps/workspace/scripts/`

## AI 修改前检查项

- 先判断任务属于哪个架构域
- 确认当前实现和愿景设计是否混在一起
- 跨域修改时同时阅读相关域的 README
- 不根据 `99-archive/` 的历史文档直接改当前实现

## 跨域协作规则

- Workspace 变更影响用户可见界面时，通知 Application 域
- Persona 变更影响记忆写入时，通知 Memory 域
- Memory schema 或 DB 变更必须通知 Infra 与 Governance 域
- 任何绕过 Event 的输入路径都必须先做架构评审
