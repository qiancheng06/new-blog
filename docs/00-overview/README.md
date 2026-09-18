# Overview

本目录是所有 AI 和协作者进入项目时的第一入口。先用这里建立共同事实，再进入具体架构域。

上一级总目录：[docs/README.md](../README.md)

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

- [current-architecture.md](current-architecture.md) — 当前真实架构（权威）
- [../07-product/stage-summary.md](../07-product/stage-summary.md) — 阶段总结与下一步方向
- [../05-infra/deployment-and-clients.md](../05-infra/deployment-and-clients.md)
- [../05-infra/release-management.md](../05-infra/release-management.md)
- [domain-map.md](domain-map.md)
- [glossary.md](glossary.md)
- [ai-loading-guide.md](ai-loading-guide.md)
- [agent-work-allocation.md](agent-work-allocation.md)
- [android-client-ui-demo-context.md](android-client-ui-demo-context.md) — Android 客户端 UI Demo 上下文与后续约束
- [../06-governance/architecture-invariants.md](../06-governance/architecture-invariants.md)

## 快速导航

### 当前事实

- [current-architecture.md](current-architecture.md)
- [domain-map.md](domain-map.md)
- [glossary.md](glossary.md)
- [../07-product/stage-summary.md](../07-product/stage-summary.md)

### AI 协作

- [ai-loading-guide.md](ai-loading-guide.md)
- [agent-work-allocation.md](agent-work-allocation.md)

### 客户端与发布

- [../05-infra/deployment-and-clients.md](../05-infra/deployment-and-clients.md)
- [../05-infra/release-management.md](../05-infra/release-management.md)

## 相关代码位置

- `apps/persona/src/main/index.ts`
- `apps/persona/src/interface/`
- `apps/persona/src/application/`
- `apps/persona/src/domain/`
- `apps/persona/src/ai-runtime/`
- `apps/persona/src/infra/`
- `apps/workspace/app/`、`apps/workspace/src/`（Next.js 工作台）
- `apps/blog/`（独立公开博客）
- `apps/android/`（独立 Kotlin/Jetpack Compose Android 客户端）
- `apps/workspace/scripts/`（同步脚本）
- `apps/workspace/.vitepress/`（私人内容站）
- `apps/workspace/legacy/`（仅迁移参考，不是当前入口）

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

## 验证口径

- 默认验收入口是 `npm.cmd run verify:local`，详见
  [../06-governance/instructions.md](../06-governance/instructions.md)。
- 本域文档修改后运行 `npm.cmd run verify:local` 确认无旧引用残留。
