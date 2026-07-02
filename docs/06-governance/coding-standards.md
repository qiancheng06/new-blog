# 编码规范

本文件给多 AI 协作提供最小编码约定。更细规则以后再沉淀，当前以不破坏架构边界为优先。

## Current

- 当前后端是 TypeScript 模块化单体，入口位于 `apps/persona/src/`。
- Workspace 位于 `apps/workspace/`，不要和 Persona 后端互相直接引用内部文件。
- 运行时数据默认写入根目录 `data/`，当前数据库是 SQLite。
- 业务流程应经过 Application 层；Persona/Memory/Infra 不应互相绕行。

## Later

- 引入更细的 lint/format/typecheck 分层规则。
- 为每个架构域补充 owner、允许导入方向和测试策略。
- 将稳定接口沉淀为可复用的类型契约。

## AI 修改边界

- 不要为了单个任务大规模重命名、搬迁或格式化无关文件。
- 不要在 docs-only 任务中修改 `apps/`、`package.json` 或数据库 schema。
- 不要新增框架、微服务、workspace package 或构建系统，除非用户明确要求。
- 修改代码后至少运行与改动范围匹配的本地验证；文档改动优先运行 `npm.cmd run verify:local`。
