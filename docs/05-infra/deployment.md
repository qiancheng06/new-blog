# 部署策略

> 隐私优先；Workspace 静态发布，Persona 后台先本地运行；公网访问通过 Cloudflare Tunnel + Access 鉴权。

## 部署边界

| 部分 | 当前定位 | 是否部署 | 说明 |
|------|----------|----------|------|
| `apps/workspace/` | Workspace 前台 | 部署静态产物 | `npm run build` 生成 `apps/workspace/.vitepress/dist/` |
| `http://127.0.0.1:5173/` | Workspace 主入口 | 本地开发/预览 | 由 VitePress dev server 提供 |
| `apps/workspace/legacy/*.html` | Legacy standalone HTML assets | 不公网部署 | 仅用于迁移兼容/历史参考，不作为当前主入口 |
| `apps/persona/` | Persona OS 后台 | 当前本地运行 | API、Telegram Bot、认知流程，默认端口 `3001` |
| `data/` | Persona 本地数据 | 不部署到静态站 | 当前包含 `persona-os.db`、WAL/SHM 等运行数据 |
| Obsidian vault | 仓库外部内容源 | 不入仓、不直接部署 | 当前路径由同步脚本读取，例如 `C:\Users\33831\OneDrive\obsidian\obsidian\` |
| `docs/` | 项目文档 | 默认不发布 | 作为仓库内协作文档 |

## 架构图

```text
用户浏览器
  │
  ├─ 家庭内网: http://127.0.0.1:4173 或局域网地址
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
        ├─ Workspace preview: http://127.0.0.1:4173
        │   └─ apps/workspace/.vitepress/dist/
        │
        └─ Persona backend: http://127.0.0.1:3001
            └─ apps/persona/ + data/
```

## Workspace 静态站部署

Workspace 的发布对象是 VitePress 构建产物，不是仓库根目录，也不是 `apps/workspace/legacy/*.html` 这类 legacy standalone HTML 文件。

```bash
cd C:\Users\33831\Desktop\code\projects\blog
npm run build
npm run preview
```

当前脚本会构建 `apps/workspace`，构建产物位于：

```text
apps/workspace/.vitepress/dist/
```

`npm run preview` 使用仓库脚本中的 VitePress preview 配置，默认服务地址面向 `127.0.0.1`，端口通常是 `4173`。如果端口被占用，以命令输出为准，并同步更新 Tunnel 的 `service` 地址。

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
    service: http://127.0.0.1:4173
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

如果不使用 Cloudflare Tunnel，也可以把 `apps/workspace/.vitepress/dist/` 上传到 VPS，由 Nginx 服务静态文件，并在 Nginx 或上游网关处加鉴权。

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
rsync -avz apps/workspace/.vitepress/dist/ user@vps:/var/www/persona-workspace/
```

如需 Basic Auth、Authelia、Tailscale 或其他访问控制，应在部署前单独记录鉴权边界和账号恢复方式。

## 上线前检查清单

- [ ] 仓库保持 private。
- [ ] 已在拥有 Obsidian vault 的机器上完成同步。
- [ ] `npm run build` 成功生成 `apps/workspace/.vitepress/dist/`。
- [ ] `npm run preview` 可在本机访问 Workspace 静态站。
- [ ] Cloudflare Tunnel 的 `service` 指向实际 preview 地址。
- [ ] Cloudflare Access 已限制允许访问者。
- [ ] `data/` 未被发布到静态服务器或 CDN。
- [ ] `.env`、API Key、Telegram Token 未进入静态产物。
- [ ] Persona 后台如需长期运行，已有本机进程管理、日志和备份安排。
