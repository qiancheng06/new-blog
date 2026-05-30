# 上线部署方案

> 隐私优先，自建服务器 + 鉴权访问

## 核心问题

- Obsidian vault 内容不在 Git 仓库中，无法 CI 自动构建
- 仓库设为 **private**，代码和数据不对外公开
- VitePress 站点需通过鉴权访问，而非全网公开

## 架构图

```
你 (手机/笔记本)
    │
    ├── 家庭内网: http://192.168.x.x:8080     ← 直接访问，无鉴权
    │
    └── 外网: https://your-domain.com          ← 有鉴权
                │
                ▼
            Cloudflare Tunnel (无需公网IP)
                │
                ▼
            Cloudflare Access (鉴权)
                │
                ▼
            你的电脑 / VPS
            .vitepress/dist/ (静态文件)
```

## 方案对比

| 方案 | 成本 | 难度 | 外网可访问 | 推荐场景 |
|------|------|------|-----------|----------|
| **A. 本地局域网** | 免费 | ⭐ | ❌ | 仅在家用 |
| **B. 家庭服务器 + DDNS** | 电费 | ⭐⭐ | ✅ 需公网IP | 有公网IP + 旧电脑 |
| **C. 云服务器 VPS** | ¥20-50/月 | ⭐⭐⭐ | ✅ | 最稳定，随时访问 |
| **D. Cloudflare Tunnel** | 免费(需域名) | ⭐⭐ | ✅ | 无公网IP 时最佳 |

## 推荐方案：Cloudflare Tunnel + Access

### 为什么选它

| 条件 | 说明 |
|------|------|
| 无需公网 IP | 中国家庭宽带大多没有公网 IPv4 |
| 免费 | Tunnel + Access 都有免费额度 |
| 安全 | 不暴露服务器端口，无扫描风险 |
| 鉴权开箱即用 | Cloudflare Access 支持 Google/GitHub 一键登录 |
| 速度快 | Cloudflare CDN 全球节点缓存静态资源 |

### 前提

- 一个域名（约 ¥30/年，例如 `your-domain.com`）
- 域名 DNS 托管到 Cloudflare（免费）
- 一台能运行 Node.js 的电脑（就是你现在的电脑，或云服务器）

### 步骤

#### 1. 本地安装 cloudflared

```bash
winget install cloudflare.cloudflared
# 或下载 exe: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

#### 2. 登录 Cloudflare 并创建隧道

```bash
cloudflared tunnel login
cloudflared tunnel create my-blog
```

执行后会在 `~/.cloudflared/` 下生成证书和隧道配置文件。

#### 3. 配置 DNS 路由

```bash
cloudflared tunnel route dns my-blog your-domain.com
```

#### 4. 配置隧道转发

创建 `~/.cloudflared/config.yml`：

```yaml
tunnel: my-blog
credentials-file: C:\Users\你的用户名\.cloudflared\my-blog.json

ingress:
  - hostname: your-domain.com
    service: http://localhost:4173
  - service: http_status:404
```

#### 5. 本地启动 VitePress preview

```bash
# 在 blog 项目目录下
npm run build
npx vitepress preview . --port 4173
```

#### 6. 运行隧道

```bash
cloudflared tunnel run my-blog
```

#### 7. 设置 Cloudflare Access（鉴权）

在 Cloudflare Dashboard：
1. Zero Trust → Access → Applications → Add an application
2. 选择 Self-hosted
3. 输入域名 `your-domain.com`
4. 策略：允许指定邮箱 / Google 登录 / GitHub 登录
5. 保存

之后访问 `https://your-domain.com` 就会先跳转到登录页，验证通过后才显示你的站点。

#### 8. （可选）设置成 Windows 服务，开机自启

```bash
cloudflared service install
```

或使用 pm2 让 vitepress preview 持续运行：

```bash
npm install -g pm2
pm2 start --name "blog" npx -- vitepress preview . --port 4173
pm2 save
pm2 startup
```

### 完整启动流程（重启后）

```bash
# terminal 1: VitePress
cd C:\Users\33831\Desktop\code\projects\blog
npm run build
npx vitepress preview . --port 4173

# terminal 2: Cloudflare Tunnel
cloudflared tunnel run my-blog
```

或使用 pm2 一键启动：

```bash
pm2 start-all
```

## 鉴权方式对比

| 方式 | 实现难度 | 安全性 | 体验 |
|------|----------|--------|------|
| **Nginx Basic Auth** | 极简 | ⭐⭐⭐ | 弹窗输入密码 |
| **Cloudflare Access** (推荐) | 中等 | ⭐⭐⭐⭐⭐ | Google/GitHub 一键登录 |
| **Authelia** | 复杂 | ⭐⭐⭐⭐⭐ | 自建 SSO，支持 2FA |
| **Tailscale** | 中等 | ⭐⭐⭐⭐⭐ | 组网访问，无暴露端口 |

## 上线前检查清单

- [ ] 仓库已设为 **private**
- [ ] 已配置 `base: './'`（当前配置可通过 `npm run build` 正常构建）
- [ ] `detail.html` 中的 `filePath` 已去除（sync-projects.js 中删除文件路径泄露）
- [ ] Cloudflare Tunnel 配置完成
- [ ] Cloudflare Access 鉴权策略已设置
- [ ] 域名 DNS 已托管到 Cloudflare
- [ ] pm2 / 服务已设为开机自启

## 输出文件说明

| 文件 | 上线后位置 | 说明 |
|------|------------|------|
| `.vitepress/dist/` | 服务器静态根目录 | VitePress 构建产物 |
| `index.html` | 不部署，仅本地使用 | 仪表盘（内嵌项目/待办/知识数据） |
| `detail.html` | 不部署，仅本地使用 | 项目详情 + 内联编辑 |
| `calendar.html` | 不部署，仅本地使用 | 日历月视图 |
| `projects/*.md` | 不部署 | 项目进度源文件（gitignored） |
| `docs/` | 不部署，仅本地使用 | 项目文档 |

## 替代方案：VPS + Nginx

如果选择购买 VPS 而非 Tunnel：

```bash
# VPS 上
apt install nginx apache2-utils ssl-cert

# Basic Auth
htpasswd -c /etc/nginx/.htpasswd admin

# Nginx 配置 /etc/nginx/sites-available/blog
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    auth_basic "私人知识库";
    auth_basic_user_file /etc/nginx/.htpasswd;

    root /var/www/blog/.vitepress/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 上传本地构建产物到服务器
rsync -avz .vitepress/dist/ user@vps:/var/www/blog/.vitepress/dist/
```

### VPS 推荐

| 服务商 | 最低配置 | 价格 |
|--------|----------|------|
| 阿里云轻量 | 2C 1G | ¥24/月 |
| 腾讯云轻量 | 2C 2G | ¥30/月 |
| 雨云 | 1C 1G | ¥9.9/月 |
| 甲骨文免费 | 4C 24G | 免费（注册难） |
