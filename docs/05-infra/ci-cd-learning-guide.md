# 从提交到生产：本项目 CI/CD 实战拆解

这篇文档不是命令抄写，而是把本项目的一次发布拆开，说明每一层为什么存在、它验证了什么，以及失败时应该看哪里。读完后，应该能回答三个问题：

1. 一次 Pull Request 和一次生产发布分别经过哪些阶段？
2. 为什么镜像已经构建成功，VM 仍然可能部署失败？
3. 如何从日志判断问题属于 GitHub、Runner、Docker、应用还是 Cloudflare？

## 1. 先看全链路

当前生产路径是：

```text
代码提交 / Pull Request
        │
        ▼
GitHub Actions：Ubuntu + Windows 验证
        │
        ▼
Docker Buildx 构建 linux/amd64 镜像
        │
        ▼
推送到 GHCR：ghcr.io/qiancheng06/persona-nas
        │
        ▼ 仅 v* 版本标签
Production 环境审批
        │
        ▼
VM 上的 self-hosted Runner
        │
        ▼
备份 SQLite → 拉取固定版本 → Compose 重建
        │
        ▼
API / Workspace / Gateway 健康检查
        │
        ▼
Cloudflare Tunnel / Access → workbench.knotcloud.site
```

这里有两个容易混淆的边界：

- **CI** 证明代码可以验证、镜像可以构建；它不代表生产服务已经更新。
- **CD** 只在版本标签上执行，并且只更新 VM。安卓不需要构建或部署到这台 VM；安卓客户端是独立交付物。

## 2. CI 与 CD 到底有什么不同

### CI：持续集成

CI 的问题是：“这次提交能不能被项目接受？”

`.github/workflows/ci.yml` 中的 `verify` Job 在 `ubuntu-latest` 和 `windows-latest` 两个平台运行：

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest]
```

每个平台都会：

1. 检出代码。
2. 使用 Node.js 22。
3. 执行 `npm ci`，按 lockfile 安装依赖。
4. 执行 `npm run verify:ci`。
5. 用 `git diff --exit-code` 确认验证过程没有改写受版本控制的文件。

两个系统都通过，才允许进入 NAS 镜像构建。矩阵的意义不是“多跑一次”，而是提前发现路径、脚本、换行符或平台 API 差异。

### CD：持续交付/部署

CD 的问题是：“哪个已经验证过的版本，应该在什么条件下更新生产 VM？”

本项目的 `deploy-vm` 有几个硬门槛：

- 只接受 `vMAJOR.MINOR.PATCH` 形式的标签，例如 `v1.0.5`。
- 必须先通过 `nas-image`。
- 必须使用标签对应的代码，而不是工作区当前分支。
- 必须匹配 VM Runner 标签 `persona-vm-production`。
- 必须通过 GitHub 的 `production` Environment 审批。
- 同一时间只允许一个 `persona-production` 部署。

因此，“CI 绿了”与“生产已经更新”是两个不同的事实。

## 3. Workflow 的三类触发

当前工作流由以下事件触发：

```yaml
on:
  pull_request:
  push:
    branches:
      - master
    tags:
      - "v*"
```

### Pull Request

Pull Request 会执行验证和 Compose 配置检查，也会构建镜像，但不会把镜像推送到 GHCR。这样可以验证构建是否可行，又不会让每个临时分支产生生产镜像。

### 推送到 `master`

`master` 会执行完整 CI，并推送可供后续使用的镜像标签，例如 `latest` 和 commit SHA 标签。它本身不会触发 VM 部署。

### 推送版本标签

推荐在修复已经合并到 `master` 后创建标签：

```bash
git checkout master
git pull origin master
git tag -a v1.0.5 -m "release: v1.0.5"
git push origin v1.0.5
```

标签会触发镜像版本 `1.0.5`，然后在前置任务通过且审批完成后运行 VM 部署。生产镜像使用去掉 `v` 的版本号，这是脚本把 `v1.0.5` 映射为 `:1.0.5` 的结果。

> 标签一旦推送就应视为不可变发布记录。发现问题时创建下一个版本，不要覆盖已有标签。

## 4. NAS 镜像和 GHCR

`nas-image` 使用 Docker Buildx 构建 `linux/amd64` 镜像：

```yaml
platforms: linux/amd64
images: ghcr.io/${{ github.repository_owner }}/persona-nas
```

GHCR 是镜像仓库，不是生产服务器。GitHub Actions 负责构建和推送；VM 上的 Runner 负责登录 GHCR 并拉取镜像。

第一次 `docker pull` 可能很慢，因为需要下载完整镜像层。以后如果某些层没有变化，Docker 会复用缓存，只下载新增层。下载过程消耗 VM 网络流量、磁盘空间、解压时的 CPU/IO 和 GitHub Actions 执行时间。

镜像层下载完成并不等于部署成功，后面仍可能在挂载、启动、健康检查或应用配置阶段失败。

## 5. Self-hosted Runner 在做什么

VM `192.168.50.61` 上运行了一个名为 `github-runner` 的 Linux 用户和 Runner 服务。Workflow 通过标签选择它：

```yaml
runs-on: [self-hosted, linux, x64, persona-vm-production]
```

Runner 的工作方式是主动向 GitHub 轮询任务；GitHub 不需要直接 SSH 登录 VM。Runner 用户被授予 Docker 权限，因此可以执行 Compose，但普通部署命令不需要 `sudo`。

可以在 VM 上用以下命令检查 Runner：

```bash
sudo systemctl status actions.runner.qiancheng06-new-blog.persona-vm.service
id github-runner
docker version
docker ps
```

常见状态含义：

- **queued**：还没有可用的匹配 Runner，或 Runner 正忙。
- **waiting**：通常在等待 Environment 审批等保护规则。
- **in_progress**：Job 已经交给 Runner 执行。
- **completed / failure**：任务已经结束，需要看失败的具体 Step。

## 6. Production 审批为什么存在

`deploy-vm` 使用：

```yaml
environment: production
```

这个 Environment 可以设置审批人和其他保护规则。它把“代码验证通过”与“允许触碰生产 VM”分开：

1. CI 验证代码和镜像。
2. 人工查看版本、变更和检查结果。
3. 点击 **Review deployments → Approve and deploy**。
4. Job 才继续在 VM 上运行。

如果只有自己维护项目，可以把 Required approvals 设置为 0；如果保留审批，则每个满足保护规则的生产部署都需要一次批准。这个批准不是每次 `git pull` 都要做，而是每次触发生产部署的 Job 都要经过。
## 7. VM 部署脚本的顺序

入口脚本是 [`deploy/vm/deploy-release.sh`](../../deploy/vm/deploy-release.sh)。它有意保持为一条直线：

### 7.1 校验输入和配置

脚本先检查版本标签、运行时环境文件和两个 Compose 文件：

```text
/opt/persona/deploy/nas/.env
/opt/persona/deploy/nas/compose.yaml
/opt/persona/deploy/nas/compose.existing-tunnel.yaml
```

Workflow 通过 `PERSONA_RUNTIME_ENV_FILE` 明确指定 VM 的环境文件，避免脚本默认路径与实际安装路径不一致。真实环境文件不提交到 Git，因为其中可能有模型 API Key 和其他 Token。

### 7.2 防止并发发布

脚本用 `/tmp/persona-deploy.lock` 和 `flock` 防止两个部署同时操作同一个 Compose 项目。Workflow 还使用 `concurrency: persona-production`，两层共同保护生产状态。

### 7.3 先备份 SQLite

备份服务运行 `deploy/nas/backup-sqlite.mjs`，将：

```text
/opt/persona/runtime/data/persona-os.db
```

备份到：

```text
/opt/persona/runtime/backups/
```

备份标签类似 `pre-v1-0-5`。备份失败会立即停止部署，不会继续替换服务。

### 7.4 拉取不可变镜像

脚本将版本标签转换为固定镜像：

```text
ghcr.io/qiancheng06/persona-nas:1.0.5
```

这里不使用 `latest`，这样日志、回滚和故障复现都有明确版本。

### 7.5 启动并等待服务健康

Compose 使用：

```bash
docker compose up -d --no-build --wait --wait-timeout 180
```

三个核心服务都必须健康：

- `persona-api`：检查 `http://127.0.0.1:3001/health`。
- `workspace`：检查 `http://127.0.0.1:5173/calendar`。
- `gateway`：检查 Caddy 的 `http://127.0.0.1/healthz`。

最后脚本还会从容器内部再次请求这三个端点。容器是 `Up` 只能证明进程没有退出，不能证明依赖、路由和应用已经可用；健康检查就是为了捕获这种差异。

## 8. 公网边界

当前 VM 内部服务由 Caddy 统一入口，Cloudflare/iKuai Tunnel 负责把公网请求送到 VM 的 `8080`：

```text
https://workbench.knotcloud.site
        ↓ Cloudflare Access
http://192.168.50.61:8080
        ↓ Caddy
/calendar       → workspace:5173
/persona-api/*  → persona-api:3001
```

应用运行时的允许来源必须与公网入口一致：

```env
PERSONA_ALLOWED_ORIGINS=https://workbench.knotcloud.site
```

Cloudflare Tunnel、Access 和 DNS 属于基础设施控制面，不由普通应用发布脚本修改。应用发布只更新 VM 上的容器；如果公网入口返回 404、Access 页面或连接错误，应把排查范围放到 Cloudflare/iKuai 配置和 VM 的 `8080` 监听，而不是重复推送镜像。

## 9. 真实故障复盘：为什么“镜像成功”仍然会失败

### 故障一：`Caddyfile` 找不到

日志：

```text
bind source path does not exist: .../new-blog/Caddyfile
```

根因是脚本曾经强制设置 `--project-directory` 为仓库根，Compose 因而把 `./Caddyfile` 解释成仓库根下的文件；实际文件在 `deploy/nas/Caddyfile`。

修复是移除这个项目根覆盖，让 Compose 根据 Compose 文件所在目录解析相对路径。这个例子说明：看到“文件不存在”时，先比较**日志中的实际路径**和**仓库中的真实路径**，不要先重复下载镜像。

### 故障二：SQLite `SQLITE_CANTOPEN`

日志：

```text
SqliteError: unable to open database file
code: 'SQLITE_CANTOPEN'
```

根因不是数据库文件消失，而是备份服务把数据目录以只读 bind mount 提供给 `better-sqlite3` 在线备份；在目标 VM 上该备份方式需要可写挂载才能完成。

修复是只对 `backup` 服务取消数据目录的 `read_only` 挂载。应用服务仍保持只读根文件系统和原来的数据挂载约束。备份代码本身仍以 `readonly: true` 打开数据库，并且只写入备份目录。

### 故障三：Gateway unhealthy，但 Caddy 已启动

日志：

```text
gateway is unhealthy
wget: server returned error: HTTP/1.1 404 Not Found
```

原来的 Caddyfile 虽然写了 `@health path /healthz` 和 `respond @health 200`，但后面的无条件 `handle` 把请求先转发给 Workspace，健康检查因此得到 404。

修复为明确的优先路由：

```caddyfile
handle /healthz {
  respond 200
}
```

然后才是 `/persona-api/*` 和 Workspace 的兜底路由。现在应同时验证 Caddy 配置和实际响应：

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl -i http://127.0.0.1:8080/healthz
```
## 10. 出错时按边界排查

不要看到红色就重跑全部流程。先根据失败 Step 分类：

| 失败位置 | 优先检查 | 通常不该先做 |
| --- | --- | --- |
| Verify | Node、依赖、测试输出、平台差异 | 重启 VM |
| Build NAS image | Dockerfile、Buildx、GHCR 权限 | 改 Cloudflare |
| Runner queued | Runner 服务、标签、在线状态 | 修改应用代码 |
| Environment waiting | Production 审批和保护规则 | 重推相同标签 |
| `docker pull` | VM 网络、GHCR 登录、磁盘空间 | 删除数据库 |
| 备份失败 | `.env` 路径、数据目录、备份目录权限 | 直接跳过备份 |
| Compose mount | Compose 文件路径和 bind source | 重新构建镜像 |
| API unhealthy | API 日志、数据库、环境变量 | 先看浏览器 |
| Gateway unhealthy | Caddyfile、端口、上游响应 | 反复拉镜像 |
| 公网 404/Access | Cloudflare Tunnel、Access、DNS、VM `8080` | 修改安卓代码 |

VM 上最小的一组检查命令：

```bash
docker compose -p persona-nas ps
docker ps -a
docker logs --tail 200 persona-nas-persona-api-1
docker logs --tail 200 persona-nas-workspace-1
docker logs --tail 200 persona-nas-gateway-1
docker inspect persona-nas-gateway-1
df -h
test -r /opt/persona/deploy/nas/.env && echo env-readable
```

如果需要查看部署脚本本身的实际 Compose 参数，可以在 Runner 工作目录中执行：

```bash
bash -x deploy/vm/deploy-release.sh v1.0.5
```

生产环境不要把带 Token 的完整命令或 `.env` 内容贴到 Issue、PR 或聊天中。

## 11. 版本、备份与回滚

一次成功发布至少应留下三条可追踪信息：

1. Git 标签，例如 `v1.0.5`。
2. GHCR 镜像，例如 `persona-nas:1.0.5`。
3. 发布前备份，例如 `...-pre-v1-0-5.sqlite`。

当前脚本没有自动回滚步骤。发现新版本不健康时：

1. 保留失败日志，不要删除刚生成的备份。
2. 确认上一个可用镜像标签，例如 `1.0.4`。
3. 在允许发布的前提下重新执行上一版本的部署流程。
4. 再检查 API、Workspace、Gateway 和公网入口。

回滚代码版本不等于回滚数据版本。SQLite 数据迁移、应用兼容性和备份恢复必须分别确认；不要因为容器可以启动就认为数据已经安全恢复。

## 12. 时间限制和资源消耗

本项目当前 Job 限制为：

| Job | `timeout-minutes` | 主要耗时 |
| --- | ---: | --- |
| Verify | 20 | 安装依赖、跨平台验证 |
| Build NAS image | 20 | Docker 构建和推送 |
| Deploy production VM | 30 | 拉镜像、解压、启动和健康等待 |

`docker pull` 没有单独的脚本级超时时，会占用部署 Job 的剩余时间；如果 GHCR 网络很慢，最终会由 Job 的 30 分钟上限终止。部署时间还可能包含 Environment 审批等待，但只有任务真正交给 Runner 后，VM 才会消耗部署资源。

## 13. 学习练习

可以不改代码，先尝试回答下面的问题，再到 Workflow 和脚本中找证据：

1. 为什么 Pull Request 构建镜像但不推送 GHCR？
2. 为什么生产部署使用 `v1.0.5`，而不是 `latest`？
3. 为什么三个容器都是 `Up`，Gateway 仍可能被判定为失败？
4. `needs: nas-image` 和 `environment: production` 分别保护什么？
5. 如果 `docker pull` 成功但备份失败，生产容器是否应该被替换？为什么？
6. 如果 VM 内部 `/healthz` 是 200，但公网是 404，应先检查哪个边界？
7. 为什么 Android 调试包的 `10.0.2.2:3001` 不应被直接写进 VM 的 Compose 配置？
8. 下次从 `master` 发布前，如何确认域名、环境文件和镜像标签都来自同一版本？

建议的实践顺序是：先画出上面的链路，再手动读一遍 `ci.yml`，最后用一次失败日志练习“定位到拥有该问题的边界”。能解释每一步的输入、输出和失败归属，就已经真正掌握了这套 CI/CD，而不只是记住了几个命令。
