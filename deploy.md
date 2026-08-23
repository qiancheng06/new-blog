# 部署入口

当前推荐部署目标是 N5 Pro 上的 Docker Compose。完整操作见
[docs/05-infra/pve-nas-deployment.md](docs/05-infra/pve-nas-deployment.md)。快速启动参考见
[deploy/nas/README.md](deploy/nas/README.md)，架构与安全边界见
[docs/05-infra/deployment.md](docs/05-infra/deployment.md)。

## 当前部署形态

- `workspace`：Next.js 工作台和可安装 PWA，容器内监听 `5173`。
- `persona-api`：Persona API、SQLite、后台任务与调度，容器内监听 `3001`。
- `gateway`：Caddy 同源网关，`/persona-api/*` 转发后端，其余请求转发 Workspace。
- `cloudflared`：只建立出站 Tunnel，不开放路由器入站端口。
- `backup`：通过 SQLite Backup API 生成一致性备份。

公网只访问 Cloudflare Access 保护的 Workspace 域名。Persona API、SQLite、
`.env` 和 Obsidian Vault 不作为独立公网资源发布。博客与私人内容站保持独立部署。

```bash
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml build
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml up -d
```
