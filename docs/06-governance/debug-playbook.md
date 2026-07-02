# 调试手册

本手册记录当前阶段的本地排错顺序。优先使用已有脚本，不新增调试框架。

## Current

默认验证命令：

```bash
npm.cmd run verify:local
```

常用局部命令：

```bash
npm.cmd run build:backend
npm.cmd run smoke:api
npm.cmd run sync
npm.cmd run build
```

网页打不开时优先检查：

- 使用 `http://127.0.0.1:5173/`，不要直接打开迁移后的 HTML 文件路径。
- 后端状态接口是 `http://127.0.0.1:3001/api/status`。
- 如果 `/api/status` 返回 404，通常是旧后端进程占用端口，需要重启当前 Persona 后端。

## Later

- 增加按域划分的故障清单。
- 增加日志、token、成本和延迟的可观测规范。
- 增加端到端 Runtime Demo Gate 的人工检查记录。

## AI 修改边界

- 可以补充已验证过的命令和现象。
- 不可以要求默认安装新工具或外部服务。
- 不可以把 smoke/mock 结果描述成真实 LLM、真实 Telegram 或真实 Obsidian 全链路已验证。
- 不可以修改 `apps/` 或 package scripts 来适配本文档；若命令不一致，应先报告。
