# 部署入口

本仓库的部署策略统一维护在 [docs/05-infra/deployment.md](docs/05-infra/deployment.md)。

## 当前部署边界

- `apps/workspace/` 是 Workspace 前台：VitePress 静态站 + 本地 HTML 仪表盘。
- `apps/persona/` 是 Persona OS 后台：本地 Node.js/TypeScript 服务，当前用于 API、Telegram Bot 和认知流程。
- `data/` 是 Persona 本地运行数据目录，包含 SQLite 数据库与 WAL 文件，不作为静态站发布内容。
- Obsidian vault 是仓库外部路径，目前由同步脚本读取本机目录，不在 Git 仓库中，也不随部署发布。

## 推荐路径

1. 本机或受控机器运行 `npm run build`，生成 `apps/workspace/.vitepress/dist/`。
2. 通过 `npm run preview` 暴露本地静态预览服务，默认面向 `127.0.0.1:4173`。
3. 使用 Cloudflare Tunnel 转发到本地 preview 服务。
4. 使用 Cloudflare Access 给外网入口加鉴权。

Persona 后台当前优先保持本地运行：`npm run dev:backend`。未来如果需要把 Persona 后台外部化，再补充独立的后端部署方案、密钥管理和数据迁移流程。

## 快速检查

- Workspace 只部署静态产物：`apps/workspace/.vitepress/dist/`。
- 本地仪表盘文件 `apps/workspace/index.html`、`detail.html`、`calendar.html` 不作为公网静态站入口。
- `data/`、`.env`、Obsidian vault 外部目录不发布。
- 详细步骤、Cloudflare Tunnel 配置、替代方案见 [docs/05-infra/deployment.md](docs/05-infra/deployment.md)。
