# 调试手册

本手册记录当前阶段的本地排错顺序。优先使用已有脚本，不新增调试框架。

## Workspace 404 Quick Check

- Primary Workspace URL is `http://127.0.0.1:5173/` after `npm.cmd run dev`
  or `npm.cmd run dev:mock`.
- Do not open `apps/workspace/index.html`; that file must not exist as an app
  entrypoint.
- Do not use `apps/workspace/legacy/*.html` as the current product entrypoint.
  Legacy HTML is migration-compatible only.
- `npm.cmd run preview` may use a different port, commonly `4173`; do not mix
  preview URLs with dev-server URLs.
- If `http://127.0.0.1:3001/api/status` returns 404, stop the stale process on
  port `3001` and restart the Persona backend or mock backend.
- If a Cloudflare Tunnel URL returns 404, check whether its service target
  points to the actual running local port. A fallback `http_status:404` means
  the tunnel is up but no matching route handled the request.
- Repository `docs/` files are not automatically published into Workspace
  routes. Open them in the repo unless a VitePress page explicitly links them.

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
