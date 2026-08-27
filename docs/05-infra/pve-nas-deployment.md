# Persona PVE/NAS 部署手册

本文是当前 Persona MVP 的完整部署手册，目标是在 N5 Pro 的 Proxmox VE（PVE）上运行工作台，并让手机以 PWA 访问日历、AI 和记忆功能。

本版本只对外提供 Workspace 一个入口。博客、VitePress 私人内容站和 Obsidian 自动同步不纳入首轮公网运行。

## 1. 当前架构

PVE 宿主机只负责虚拟化；应用运行在一台 Debian 虚拟机里的 Docker Compose 中。

```text
手机 PWA / 桌面浏览器
        |
        v
Cloudflare Access（GitHub 登录）
        |
现有 iKuai Cloudflare Tunnel
        |
        v
PVE VM 固定内网 IP:8080
     Caddy :80
       |------------------ /persona-api/* -> persona-api :3001 -> SQLite
       |
       +------------------ /*             -> workspace :5173

PVE
└── Debian 12 VM
    └── Docker Compose
        ├── workspace
        ├── persona-api
        └── caddy
```

浏览器只访问一个来源，例如 `https://persona.changwt.cc`。浏览器请求
`/persona-api/*`，Caddy 在 Docker 私有网络内转发到 API，因此不会因为多个容器产生跨域问题。

当前推荐模式复用 iKuai 上已有的 Cloudflare Tunnel，PVE VM 不启动 `cloudflared`；Compose 使用一个自建 `persona-nas` 应用镜像启动 Workspace、Persona API 和备份任务，Caddy 使用官方镜像。若将来需要 VM 独立连接 Tunnel，仍可启用 `dedicated-tunnel` profile。后续可以拆成 Workspace/API 两个自建镜像，但不是首轮 PWA 上线的前置条件。

## 2. PVE 虚拟机

推荐使用完整 VM，不把 Docker 直接装在 PVE 宿主机，也不把 Docker-in-LXC 作为第一版生产环境。

### 推荐规格

| 资源 | 日常运行 | 首次构建建议 |
| --- | ---: | ---: |
| vCPU | 2 | 4 |
| 内存 | 4 GB | 8 GB |
| 系统盘 | 40 GB | 40 GB |
| 数据盘 | 本地 SSD，100 GB 起 | 本地 SSD，100 GB 起 |
| 架构 | x86_64 | x86_64 |

创建 Debian 12 或 Ubuntu 24.04 VM，网卡桥接到 `vmbr0`，给 VM 配置 DHCP 保留地址或静态地址。

数据盘在 VM 内挂载到本地路径，例如：

```text
/srv/persona/data       SQLite 运行数据
/srv/persona/backups    SQLite 备份
/srv/persona/vault      可选的 Obsidian Vault
```

不要把 SQLite 运行目录放到 SMB/NFS 网络共享。PVE 快照可以作为升级保护，但不能替代独立备份。

### VM 防火墙边界

- 只允许局域网管理 SSH。
- 不把 `3001`、`5173` 或 Caddy 的 `80` 发布到路由器公网。
- Cloudflare Tunnel 从 VM 主动连接 Cloudflare，不需要端口转发。
- PVE 管理端口只允许管理网段访问。

## 3. 安装 Docker

以下命令在 Debian/Ubuntu VM 内执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

重新登录 VM 后确认：

```bash
docker --version
docker compose version
```

不要在 PVE 宿主机执行项目的 Docker Compose 命令。

## 4. 准备持久化目录

在 VM 内执行，路径按实际 SSD 挂载点调整：

```bash
sudo mkdir -p /srv/persona/data
sudo mkdir -p /srv/persona/backups
sudo chown -R 1000:1000 /srv/persona/data /srv/persona/backups
```

容器中的 `node` 用户使用 UID 1000。首次启动会在数据目录创建空的 `persona-os.db`。

## 5. Cloudflare Tunnel 和 Access

### 5.1 创建 Tunnel

在 Cloudflare Zero Trust 控制台：

1. 创建一个 dashboard-managed Tunnel。
2. 添加公共主机名 `persona.changwt.cc`，或你选择的 Persona 子域名。
3. 服务地址填写 `http://<PVE_VM_LAN_IP>:8080`，本机填写 `http://192.168.50.61:8080`。
4. 创建 Self-hosted Access Application，主机名使用同一个 `persona.changwt.cc`。
5. 添加 GitHub Identity Provider。
6. Allow 规则只包含实际使用的 GitHub 账号。
7. 复用 iKuai 连接器时，不需要把 Tunnel Token 放进 PVE VM；不要在 VM 内启动第二个 `cloudflared`。

Access 应用和 Tunnel 主机名必须完全一致。不要给 `persona-api` 单独创建公网域名。
当前已有 Tunnel 的连接器需要能够访问 PVE VM 的固定局域网 IP；PVE 防火墙只允许该连接器所在局域网访问 Caddy 端口。

### 5.2 公网安全边界

- 只公开 `https://persona.changwt.cc`。
- Persona API 端口 `3001` 不发布到宿主机。
- `PERSONA_ALLOWED_ORIGINS` 只填写 `https://persona.changwt.cc`。
- 不使用 `*` CORS。
- API Key、Telegram Token、Tunnel Token 只放 VM 的 `deploy/nas/.env`。

## 6. 获取代码和配置

完整项目已经合并到 GitHub 默认 `master` 分支。VM 内执行：

```bash
sudo mkdir -p /opt
sudo git clone -b master https://github.com/qiancheng06/new-blog.git /opt/persona
sudo chown -R "$USER":"$USER" /opt/persona
cd /opt/persona
cp deploy/nas/.env.example deploy/nas/.env
chmod 600 deploy/nas/.env
```

编辑 `deploy/nas/.env`：

```dotenv
PERSONA_IMAGE=persona-nas:local
PERSONA_DATA_DIR=/srv/persona/data
PERSONA_BACKUP_DIR=/srv/persona/backups
PERSONA_BACKUP_RETENTION_DAYS=30
PERSONA_GATEWAY_BIND_IP=192.168.50.61
PERSONA_GATEWAY_PORT=8080

PERSONA_ALLOWED_ORIGINS=https://persona.changwt.cc
CLOUDFLARE_TUNNEL_TOKEN=复用iKuai Tunnel时留空

# NAS 使用真实服务端模型，不使用 mock。
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
OPENAI_API_KEY=sk-your_deepseek_key_here

PERSONA_ANALYSIS_ENDPOINT=
PERSONA_ANALYSIS_MODEL=
PERSONA_ANALYSIS_API_KEY=
PERSONA_TIME_ZONE=Asia/Shanghai
PERSONA_DAILY_SUMMARY_ENABLED=true
PERSONA_OBSIDIAN_SNAPSHOT_ENABLED=false
```

NAS 使用真实服务端模型。真实模型密钥只进入后端容器，不会写入前端或 PWA。CI 和本地契约测试仍可显式使用 `mock`，但不代表生产运行模式。

## 7. 构建和启动

在 `/opt/persona` 执行：

```bash
docker compose \
  --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  config

docker compose \
  --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  build

docker compose \
  --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  up -d

docker compose \
  --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  ps
```

预期服务：

- `persona-api`：健康检查 `/health` 通过。
- `workspace`：健康检查 `/calendar` 通过。
- `gateway`：健康检查 `/healthz` 通过。
- 现有 Tunnel 模式下，`cloudflared` 不在 VM 内运行；iKuai 连接器访问 Caddy 的固定内网地址。

现有 Tunnel 模式下，Compose 只把 Caddy 发布到 PVE VM 的固定局域网端口，例如本机的 `192.168.50.61:8080`；Persona API 仍不发布。若改用 VM 内专用 Tunnel，则使用 `dedicated-tunnel` profile，并移除 existing-tunnel override。

## 8. 手机 PWA 验收

1. 手机浏览器打开 `https://persona.changwt.cc/calendar`。
2. 完成 Cloudflare GitHub 登录。
3. 确认月、周、日视图可以切换。
4. 确认点击日期只改变选中日期，不自动切换视图。
5. 创建全天和定时事件。
6. 创建、修改、删除自定义标签。
7. 用电脑和手机同时修改同一事件，确认冲突返回 `409` 并提示刷新。
8. iPhone Safari 使用“添加到主屏幕”；Android Chrome 使用“安装应用”。
9. 断网后允许查看已加载页面，创建、编辑、删除必须禁用；恢复网络后重新刷新。
10. 重启 Compose 后确认日历数据仍存在。

PWA 的 Service Worker 只缓存图标、静态资源和离线页，不缓存 Persona API、日历、AI 回复、记忆或密钥。

## 9. 数据、备份和恢复

Persona 的 SQLite 位于：

```text
/srv/persona/data/persona-os.db
```

数据库可能同时产生 WAL/SHM 文件。不要只复制某一个 SQLite 文件作为在线备份。

### 每日备份

执行：

```bash
docker compose \
  --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  --profile maintenance run --rm backup
```

建议使用 PVE/NAS 任务调度器每日运行，备份目录保留至少 30 天。

### 升级前备份

```bash
PERSONA_BACKUP_LABEL=pre-upgrade \
docker compose \
  --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  --profile maintenance run --rm backup
```

升级前同时创建 PVE VM 快照。快照用于快速回退，SQLite 备份用于独立恢复。

## 10. 手动发布流程（当前 CD）

当前仓库的 GitHub Actions 会验证代码并构建 `linux/amd64` 镜像，但不会自动推送镜像或登录 NAS。当前最稳妥的发布方式是由操作者在 VM 内执行：

```bash
cd /opt/persona
git fetch origin
git checkout master
git pull --ff-only origin master

# 先做 SQLite 备份，再构建和重启
docker compose --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml -f deploy/nas/compose.existing-tunnel.yaml \
  --profile maintenance run --rm backup

docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml -f deploy/nas/compose.existing-tunnel.yaml build
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml -f deploy/nas/compose.existing-tunnel.yaml up -d
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml -f deploy/nas/compose.existing-tunnel.yaml ps
```

不要在生产 VM 上直接跟随不稳定分支。稳定发布应使用已验证的 commit 或 tag。

### 回滚

1. 确认目标旧 commit 或 tag。
2. 先保留当前 SQLite 备份。
3. 在代码目录切换到已知可用版本。
4. 重新 `docker compose build` 和 `up -d`。
5. 验证 Workspace、API 健康状态和日历数据。

数据库 schema 变更可能不支持直接回退，因此必须先备份；不要用旧镜像覆盖新数据库而跳过恢复验证。

## 11. GitHub CI/CD

### 当前 CI

工作流文件是 `.github/workflows/ci.yml`，触发条件为：

- push 到任意分支。
- Pull Request。

`verify` job 在 Ubuntu 和 Windows 矩阵中执行：

1. Node.js 22。
2. `npm ci`。
3. `npm run verify:ci`。
4. Workspace、Blog 和后端契约测试。
5. 检查构建过程没有修改已跟踪文件。

`nas-image` job 依赖 `verify` 全部通过后执行：

1. 校验 Compose 配置。
2. 使用 Buildx 构建 `linux/amd64`。
3. 使用 GitHub Actions cache 加速 Docker 构建。
4. Pull Request 只验证镜像构建；`master` 自动发布 `latest`，`v*` 版本标签发布版本镜像和 commit SHA 镜像到 GHCR。普通开发分支 push 不触发工作流。

### 当前已知阻塞

目前 Ubuntu 的 `verify:ci` 仍失败，因此 `nas-image` 会被跳过。Windows 验证通过。修复 Ubuntu CI 前，不应把这次提交作为生产发布依据。

### 推荐发布门禁

```text
Pull Request
  -> Ubuntu + Windows verify
  -> linux/amd64 image build
  -> 人工确认
  -> NAS 备份
  -> NAS build/up
  -> 手机验收
```

### 后续自动 CD（暂未启用）

稳定后可以增加以下流程，但不应把密钥写入仓库：

```text
master push
  -> verify
  -> build linux/amd64
  -> 推送 ghcr.io/qiancheng06/persona-workspace:<commit>
  -> 推送 ghcr.io/qiancheng06/persona-api:<commit>
  -> NAS 手动批准部署
  -> pull 固定 tag
  -> 备份 SQLite
  -> compose up -d
```

首轮不建议让 GitHub Actions 直接 SSH 进入家庭 NAS 自动部署。这样会扩大公网密钥权限和故障半径。后续若启用自动 CD，应使用 GitHub Environment 审批、短期 deploy key、固定镜像 tag 和可回滚的 release 记录。

## 12. 故障排查

### `persona-api` 不健康

```bash
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml -f deploy/nas/compose.existing-tunnel.yaml logs --tail=200 persona-api
```

重点检查 `PERSONA_DATA_DIR` 权限、端口 `3001` 是否启动、SQLite 是否位于本地 SSD，以及 `.env` 中的配置格式。

### `workspace` 不健康

```bash
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml -f deploy/nas/compose.existing-tunnel.yaml logs --tail=200 workspace
```

重点检查镜像构建是否完成、`/app/apps/workspace/.next` 是否存在，以及 Workspace 是否监听 `0.0.0.0:5173`。

### 手机能打开页面但 API 失败

依次检查：

1. `PERSONA_ALLOWED_ORIGINS` 是否精确等于 `https://persona.changwt.cc`。
2. Caddy 是否将 `/persona-api/*` 转发到 `persona-api:3001`。
3. Cloudflare Access 是否保护了同一个主机名。
4. 浏览器请求是否仍错误指向 `127.0.0.1:3001`。
5. `cloudflared` 是否能连接 Tunnel。

### PWA 无法安装

- 必须使用 HTTPS；手机直接访问局域网 HTTP 地址通常不满足 PWA 安装条件。
- 确认 `/manifest.webmanifest`、`/sw.js` 和图标返回 200。
- 使用生产构建和 `next start`，开发服务器不注册 Service Worker。
- 清除旧站点数据后重新打开，再尝试安装。

## 13. 上线清单

- [ ] PVE VM 已创建，系统盘和数据盘分离。
- [ ] VM 内 Docker Compose 可用。
- [ ] SQLite 数据目录位于本地 SSD。
- [ ] GitHub `master` 已通过 Ubuntu 和 Windows CI。
- [ ] NAS 构建的 `linux/amd64` 镜像通过健康检查。
- [ ] Cloudflare Tunnel 已配置，未做路由器端口转发。
- [ ] Cloudflare Access 只允许指定 GitHub 账号。
- [ ] `deploy/nas/.env` 权限为 600，且未进入 Git。
- [ ] Workspace、Persona API、Caddy 和 cloudflared 均正常运行。
- [ ] 每日 SQLite 备份任务已配置，并完成一次恢复演练。
- [ ] 手机 PWA 已安装并完成日历验收。
- [ ] 已验证重启 VM/Compose 后数据仍存在。

相关配置文件：

- `deploy/nas/compose.yaml`
- `deploy/nas/Caddyfile`
- `deploy/nas/.env.example`
- `.github/workflows/ci.yml`
