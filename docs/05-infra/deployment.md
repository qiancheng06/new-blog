# 部署策略

> 隐私优先；当前支持本机、局域网/VPN，以及 Cloudflare Tunnel + Access 保护的单用户公网入口。Persona API 不能脱离网关直接暴露到公网。

> PVE、Docker Compose、Cloudflare、PWA、SQLite 备份和 GitHub CI/CD 的完整执行手册见 [PVE/NAS 部署手册](./pve-nas-deployment.md)。本文件保留架构边界和替代部署说明。

## 部署边界

| 部分 | 当前定位 | 是否部署 | 说明 |
|------|----------|----------|------|
| `apps/workspace/` | Next.js Workspace | 部署 Next.js 应用 | `npm run build` 生成 Workspace 产物 |
| `apps/blog/` | 独立 Next.js 公开博客 | 单独部署或与 Workspace 同机运行 | `npm run build:blog` 生成 Blog 产物 |
| `http://127.0.0.1:5173/` | Workspace 主入口 | 本地开发/预览 | 由 Next.js dev server 提供 |
| `http://127.0.0.1:5175/` | 公开博客 | 独立 Next.js Blog 应用 | 文章来自同步生成物 |
| `apps/workspace/legacy/*.html` | Legacy standalone HTML assets | 不公网部署 | 仅用于迁移兼容/历史参考，不作为当前主入口 |
| `apps/persona/` | Persona OS 后台 | 当前本地运行 | API、Telegram Bot、认知流程，默认端口 `3001` |
| `data/` | Persona 本地数据 | 不部署到静态站 | 当前包含 `persona-os.db`、WAL/SHM 等运行数据 |
| Obsidian vault | 仓库外部内容源 | 不入仓、不直接部署 | 当前路径由同步脚本读取，例如 `C:\Users\33831\OneDrive\obsidian\obsidian\` |
| `docs/` | 项目文档 | 默认不发布 | 作为仓库内协作文档 |

## 架构图

```text
用户浏览器
  │
  ├─ 家庭内网: http://127.0.0.1:5173 或局域网地址
  │
  └─ 外网: https://your-domain.com
        │
        ▼
    Cloudflare Access
        │
        ▼
    Cloudflare Tunnel
        │
        ▼
    本机 / VPS
        │
        ├─ Workspace Next.js: http://127.0.0.1:5173
        │   └─ apps/workspace/.next/
        │
        ├─ Blog Next.js: http://127.0.0.1:5175
        │   └─ apps/blog/.next/
        │
        └─ Persona backend: http://127.0.0.1:3001
            └─ apps/persona/ + data/
```

## 当前局域网跨端运行

桌面浏览器、手机浏览器和未来 Windows App 使用同一 Persona API。SQLite 只由后端进程打开，客户端不能读取或复制数据库文件。

在 `.env` 中使用主机的实际局域网地址，例如：

```dotenv
API_HOST=0.0.0.0
PERSONA_ALLOWED_ORIGINS=http://192.168.1.20:5173
NEXT_PUBLIC_PERSONA_API_BASE=http://192.168.1.20:3001
NEXT_PUBLIC_BLOG_BASE_URL=http://192.168.1.20:5175
```

然后分别启动：

```bash
npm run dev:backend
npm run dev:lan
npm run dev:blog:lan
```

- Windows 防火墙只允许“专用网络”访问 `3001`、`5173` 和 `5175`。
- `PERSONA_ALLOWED_ORIGINS` 必须填写精确来源，不使用 `*`。
- 手机访问 `http://192.168.1.20:5173`；日历、记忆和对话都通过 `:3001` API 使用中心 SQLite。
- API 离线时日历保留当前已加载数据，但禁用创建、修改和删除，不生成离线写队列。
- VPN 使用方式相同，只需将环境变量换成稳定的 VPN 地址。

本轮没有账号系统。公网访问必须先增加 Cloudflare Access、OIDC 或其他服务端认证，不能只依赖 CORS。

## N5 Pro Docker Compose（当前推荐）

仓库提供 `deploy/nas/compose.yaml` 和现有 iKuai Tunnel 专用的
`deploy/nas/compose.existing-tunnel.yaml`，在 N5 Pro 的 x86_64 Docker 环境运行：

```text
Cloudflare Access + Tunnel
  -> gateway:80
     -> /persona-api/* -> persona-api:3001 -> /app/data/persona-os.db
     -> /*             -> workspace:5173
```

- Workspace 构建使用 `NEXT_PUBLIC_PERSONA_API_BASE=/persona-api`，公网域名不写死在镜像中。
- 推荐复用 iKuai 上已有 Tunnel，通过固定的 PVE VM 局域网 IP 和 Caddy 端口访问；此模式不在 VM 内启动 `cloudflared`。
- 如果使用 VM 内独立 Tunnel，启用 `dedicated-tunnel` profile；不要让两个连接器共同承载同一个主机名。
- `PERSONA_ALLOWED_ORIGINS` 必须是 Access 保护的精确 HTTPS Workspace 来源。
- `PERSONA_DATA_DIR=/app/data` 把运行库固定到容器持久化挂载；本地未设置时仍使用仓库根 `data/`。
- 首次启动从空 SQLite 开始，实时数据库放 NAS 本地 SSD，不能放 SMB/NFS 共享。
- `backup` maintenance profile 使用 SQLite Backup API，适合 NAS 定时任务每日调用。
- NAS 生产运行使用真实服务端模型，不使用 mock；CI 和契约测试仍可显式使用 mock。
- Tunnel Token 与模型密钥只放 `deploy/nas/.env`，该文件已被 Git 忽略。

具体准备、启动、备份和升级命令见
[`../../deploy/nas/README.md`](../../deploy/nas/README.md)。

## Workspace 静态站部署

Workspace 的发布对象是 Next.js 应用，不是 VitePress 静态产物，也不是 `apps/workspace/legacy/*.html` 这类 legacy standalone HTML 文件。部署前需要在能访问 Obsidian vault 的环境执行 `npm.cmd run sync`，或准备等价的生成数据产物。

```bash
cd C:\Users\33831\Desktop\code\projects\blog
npm run build
npm run preview
npm run build:blog
npm run preview:blog
```

当前脚本会构建 `apps/workspace`，构建产物位于：

```text
apps/workspace/.next/
```

`npm run preview` 使用 Next.js preview 配置，默认服务地址为 `127.0.0.1:5173`。私人 VitePress 内容站需要单独运行 `npm.cmd run dev:content`，默认地址为 `127.0.0.1:5174`。
公开博客使用独立的 `apps/blog` 构建和预览命令，默认地址为 `127.0.0.1:5175`。

## Cloudflare Tunnel + Access

### 适用场景

- 家庭宽带没有公网 IP。
- 不希望开放本机或 VPS 入站端口。
- 需要 Google/GitHub/邮箱等鉴权后访问 Workspace 静态站。

### 前提

- 一个域名，例如 `your-domain.com`。
- 域名 DNS 托管到 Cloudflare。
- 本机或 VPS 可以运行 Node.js、npm 和 `cloudflared`。

### 创建隧道

```bash
winget install cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create persona-workspace
cloudflared tunnel route dns persona-workspace your-domain.com
```

### 配置转发

创建或更新 `~/.cloudflared/config.yml`：

```yaml
tunnel: persona-workspace
credentials-file: C:\Users\你的用户名\.cloudflared\persona-workspace.json

ingress:
  - hostname: your-domain.com
    service: http://127.0.0.1:5173
  - hostname: blog.your-domain.com
    service: http://127.0.0.1:5175
  - hostname: content.your-domain.com
    service: http://127.0.0.1:5174
  - service: http_status:404
```

运行：

```bash
cloudflared tunnel run persona-workspace
```

### 设置 Access 鉴权

在 Cloudflare Dashboard：

1. 进入 Zero Trust -> Access -> Applications。
2. 新增 Self-hosted application。
3. 填写 `your-domain.com`。
4. 设置允许访问的邮箱、Google 登录或 GitHub 登录策略。
5. 保存并访问 `https://your-domain.com` 验证登录流程。

## Persona 后台部署状态

Persona 当前不是静态发布对象，优先本地运行：

```bash
cd C:\Users\33831\Desktop\code\projects\blog
npm run dev:backend
```

当前后端运行依赖：

- `.env` 中的 API Key、Bot Token 等本地密钥。
- `data/persona-os.db` 及其 WAL/SHM 文件。
- `apps/persona/src/infra/db/schema.sql` 初始化 schema。
- `apps/persona/src/infra/config/index.ts` 中的运行时配置读取逻辑。
- `PERSONA_ANALYSIS_*` 服务端模型配置；后台任务不会保存或复用浏览器临时 API Key。

未来如果需要部署到 VPS 或其他主机，应单独处理：

- `.env` 和密钥注入方式。
- `data/` 目录持久化、备份、迁移和权限。
- API 端口 `3001` 的内网暴露或反向代理。
- Telegram Bot webhook / polling 模式选择。
- Persona API 是否需要纳入 Cloudflare Access 或其他服务端鉴权。

## 数据与内容目录

### `data/`

`data/` 是 Persona 后台运行时数据目录。它不是 Workspace 静态站的一部分，不应上传到 CDN 或静态服务器根目录。

当前代码会在仓库根目录下使用：

```text
data/persona-os.db
```

SQLite WAL 模式还会产生：

```text
data/persona-os.db-wal
data/persona-os.db-shm
```

部署 Persona 后台前，必须先明确该目录的备份、恢复和权限策略。

SQLite 当前同时保存 Event、Memory、Daily Note、Calendar 和 `background_jobs`。备份应使用 SQLite 一致性备份方式或停服务后同时复制主库、WAL 和 SHM，不能只复制前端生成 JSON。

### Obsidian vault 外部路径

Obsidian vault 当前位于仓库外部，由 Workspace 同步脚本读取本机路径：

```text
C:\Users\33831\OneDrive\obsidian\obsidian\
```

同步脚本当前读取其中的：

```text
todo/
knowledge/
blog/
```

因此 CI/CD 不能假设仓库自身包含完整内容源。构建 Workspace 静态站前，应先在拥有 vault 的机器上运行同步流程，或未来把 vault 路径参数化后由受控环境挂载。

## 替代方案：VPS + Nginx

如果不使用 Cloudflare Tunnel，也可以把 Next.js 应用部署到 VPS，由 Node.js 运行 `npm.cmd run start`，并在 Nginx 或上游网关处加鉴权。

示例：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    root /var/www/persona-workspace;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

上传静态产物时只同步 dist 内容：

```bash
rsync -avz apps/workspace/.next/ user@vps:/var/www/persona-workspace/.next/
```

如需 Basic Auth、Authelia、Tailscale 或其他访问控制，应在部署前单独记录鉴权边界和账号恢复方式。

## 上线前检查清单

- [ ] 仓库保持 private。
- [ ] 已在拥有 Obsidian vault 的机器上完成同步。
- [ ] `npm run build` 成功生成 `apps/workspace/.next/`。
- [ ] `npm run preview` 可在本机访问 Workspace 静态站。
- [ ] Cloudflare Tunnel 的 `service` 指向实际 preview 地址。
- [ ] Cloudflare Access 已限制允许访问者。
- [ ] `data/` 未被发布到静态服务器或 CDN。
- [ ] `.env`、API Key、Telegram Token 未进入静态产物。
- [ ] Persona 后台如需长期运行，已有本机进程管理、日志和备份安排。
