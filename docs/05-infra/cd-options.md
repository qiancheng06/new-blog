# CD 方案选择：Cloudflare 与 PVE VM

本文定义 Persona Workspace 的持续交付（CD）可选方案，以及当前推荐的
运行边界。它是发布方式的决策文档，不会替代
[release-management.md](release-management.md) 中的版本、门禁和回滚规则。

## 当前事实

目前 `.github/workflows/ci.yml` 已经完成以下工作：

1. 在 Ubuntu 与 Windows 上执行 `npm run verify:ci`。
2. 校验 Docker Compose 配置并构建 `linux/amd64` 镜像。
3. `master` 推送后发布 `ghcr.io/qiancheng06/persona-nas:latest`；
   `v*` tag 发布 SemVer tag 和 commit SHA tag。

它没有让任何远端主机拉取镜像、重启 Compose 或运行发布后健康检查。因此当前是
**CI 加镜像发布**，远端部署仍是手动操作，而不是自动 CD。

## 当前目标与边界

本项目的首选生产入口为：

```text
浏览器
  -> Cloudflare Access
  -> 已有 Cloudflare Tunnel
  -> PVE VM 的 Caddy :8080
  -> Workspace / Persona API / SQLite
```

CD 只允许改变以下两类资源：

- **PVE VM**：拉取已验证的应用镜像、备份 SQLite、重启 Compose、检查健康状态。
- **Cloudflare**：保持 Tunnel、DNS 与 Access 的一次性配置；正常应用发布不修改它们。

NAS 不作为部署执行器、代码工作目录或镜像构建机。若 SQLite 数据实际位于 VM，备份也
只写入 VM 的本地持久化磁盘或其已批准的备份目标。

## 方案对比

| 方案 | 发布动作发生位置 | 是否满足“仅 CF + VM” | 优点 | 主要代价/风险 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 完全手动 | 操作者登录 VM | 是 | 最简单、权限最小 | 容易漏备份、版本和操作记录不一致 | 可作为应急回退 |
| GitHub Actions 直接 SSH 到 VM | GitHub hosted runner | 是 | 自动化直观 | 需要让 GitHub 持有长期 SSH 私钥，并让 VM 可被 Actions 访问 | 不推荐 |
| VM 自托管 GitHub Actions Runner | VM 本机 | 是 | 不需要公网 SSH；可接入 GitHub Environment 审批 | Runner 需妥善隔离，默认分支和工作流修改必须受保护 | **推荐** |
| VM 拉取式部署 Agent/定时任务 | VM 本机 | 是 | GitHub 不拥有 VM 登录权限；故障域小 | 需要维护轮询或 webhook 接收逻辑，发布反馈较弱 | 可作为更保守替代 |
| Watchtower/自动追踪 `latest` | VM 本机 | 是 | 配置少 | 没有审批、备份与版本级回滚边界，可能在不合适时升级 | 不采用 |
| Cloudflare Pages/Workers | Cloudflare | 部分 | 静态网站或边缘逻辑发布很方便 | Persona API、Node 运行时和 SQLite 不能按当前架构直接承载 | 不适用当前 Workspace + Persona |
| Cloudflare API 驱动部署 | GitHub 或 VM | 部分 | 可自动更新 DNS、Tunnel 或 Access | 每次应用发布无须更改这些控制面资源；扩大 API Token 权限 | 不作为应用 CD 主路径 |
| NAS 自托管 Runner/部署脚本 | NAS | 否 | 可接近现有存储 | NAS 不适合操作，且不属于当前授权边界 | 排除 |

## 推荐方案：VM 自托管 Runner + 版本 tag + 审批

在 PVE VM 上运行一个专用的 GitHub Actions self-hosted runner。GitHub 不主动连接
VM；Runner 从 VM 主动轮询 GitHub 并执行获准任务。Cloudflare Tunnel 仍只负责把
公网请求转发到 VM，不参与应用版本切换。

```text
创建并推送 v1.2.0 tag
  -> CI 通过
  -> GHCR 推送 persona-nas:1.2.0 和 sha-<commit>
  -> deploy workflow 请求 GitHub Environment: production
  -> 审批人批准
  -> VM runner：备份 -> pull 1.2.0 -> up -d --no-build -> 健康检查
  -> 发布结果回写到 GitHub Actions
```

### 触发规则

- 只对已推送的 `vMAJOR.MINOR.PATCH` tag 部署；不随每次 `master` 推送上线。
- CI 的 `verify` 与镜像构建必须成功，部署 job 才能执行。
- `production` GitHub Environment 必须启用 Required reviewers。
- 不接受 `latest` 作为部署输入；输入必须是 tag `vX.Y.Z` 对应的不可变镜像标签，
  或该次发布记录中的 commit SHA tag。

### VM 上的发布动作

部署脚本应按以下顺序执行，并在任一步失败时停止：

1. 确认目标镜像标签符合发布输入，且不为空。
2. 使用 SQLite Backup API 创建发布前备份。
3. `docker compose pull` 拉取指定镜像。
4. `docker compose up -d --no-build` 重建服务；不得在生产 VM 从源码 `build`。
5. 等待并检查 Caddy `/healthz`、Persona API `/health`、Workspace `/calendar`。
6. 写出不含密钥的发布结果：版本、镜像 digest、时间、健康检查和备份标识。

部署所用 `deploy/nas/.env` 虽保留现有目录名，但只存放在 VM。本地文件中的
`PERSONA_IMAGE` 由部署输入覆盖为固定 GHCR 标签；数据库目录、模型密钥、Tunnel
配置与 Access 配置不应由工作流写入。

### 最小权限

- Runner 使用专用的非管理员 OS 用户，并只被授予运行所需 Docker Compose 权限。
- Runner 只接受标签部署工作流；不要让来自 Pull Request 的代码在该 Runner 上执行。
- GitHub 仓库保护 `master`、tag 创建权限与 `.github/workflows/` 修改权限。
- GHCR 镜像为公开时无需凭据；私有时给 VM 一个仅有 `packages:read` 权限的 token，
  放在 VM 私有环境文件或 GitHub Environment secret 中。
- Cloudflare API Token 不进入常规应用部署工作流；只有确实修改 Cloudflare 配置的
  独立运维任务才可使用最小范围 Token。

## 备选方案：VM 拉取式部署 Agent

若不希望在 VM 安装 GitHub Runner，可以在 VM 放置一个受 systemd 管理的部署脚本，
由定时器查询 GitHub Release 或受签名的版本清单。发现一个被批准的新版本后，使用
与推荐方案相同的“备份、拉固定 tag、健康检查、记录”顺序部署。

该方案同样不要求公网 SSH，也不让 GitHub 保存 VM 凭据；代价是发布状态无法自然
显示在 GitHub Actions 内，需自行报告日志或提供只读状态页。它适合“VM 必须主动拉取、
不接受 Runner”的安全偏好。

## 不采用的路线

### Actions 直连 SSH

这种方式需要将私钥放入 GitHub Secret，并让 GitHub hosted runner 能访问 VM 的
SSH 服务。即使通过 Cloudflare Access/Tunnel 绕开公网端口，密钥管理与远程执行
故障面仍比 VM 主动执行更大，不适合作为首选。

### `latest` 自动更新和 Watchtower

它会绕过人工发布批准，无法清晰对应一次部署与一个版本，也不能强制在切换前进行
SQLite 备份。对带状态服务而言，这不是可接受的发布契约。

### 每次发布更新 Cloudflare 配置

Tunnel hostname、DNS 和 Access policy 是稳定的网络/认证控制面。应用镜像升级只改变
VM 内的服务，通常不应更新这些资源。把 Cloudflare API 写入普通部署流程只会扩大
Token 权限与故障范围。

### Cloudflare Pages、Workers 或 NAS 部署

Cloudflare Pages/Workers 适合静态 Blog 或边缘无状态功能，但不能直接取代当前 Persona
的 Node 服务、Docker Compose 和 SQLite 持久化。NAS 部署则与“只操作 Cloudflare 与
VM”的边界冲突。

## 回滚

回滚是一次新的、需审批的部署：选择上一个已验证的版本 tag 或 SHA 镜像，先保留当前
SQLite 备份，再执行相同的 `pull -> up -d --no-build -> health check`。不在生产 VM
修改源码或重新本地构建镜像。

如果本次发布包含不兼容数据库变更，不能假设仅切回旧镜像即可恢复；应按该版本的迁移
计划恢复相容的数据库备份后再验收。

## 实施前清单

- [ ] VM 已运行 Docker Compose，应用和 SQLite 数据目录位于 VM 本地持久化磁盘。
- [ ] Cloudflare Tunnel 已稳定指向 VM 的 Caddy 端口，Access 已配置；本次 CD 不修改它们。
- [ ] `v*` tag 镜像可从 GHCR 拉取，并记录了不可变 tag/SHA。
- [ ] GitHub `production` Environment 启用了发布审批。
- [ ] VM Runner 使用专用账户，不接收 PR job。
- [ ] 备份、部署和健康检查脚本均已在非生产或维护窗口进行一次演练。
- [ ] 已记录上一个可用镜像版本和对应 SQLite 备份位置。

## 后续实现范围

选择推荐方案后，最小实现由三部分组成：

1. 一个只由 `v*` tag 触发、绑定 `production` Environment 且指定 VM runner label 的
   `deploy` workflow。
2. 一个在 VM 运行的部署脚本，接收唯一的镜像 tag 并执行备份、拉取、启动、健康检查。
3. 对 `deploy/nas/compose.yaml` 与部署说明的微调，使生产运行只拉取 GHCR 固定镜像，
   不在 VM 上构建。

在用户明确安装 VM Runner 并建立 GitHub Environment 后，再实施以上三项；本文件本身
不创建 Runner、不写入 GitHub Secret，也不改变 Cloudflare、VM 或 NAS。

## 推荐方案完整操作清单

以下清单是 **VM 自托管 Runner + 版本 tag + GitHub Environment 审批** 的实施和
日常发布手册。示例假定生产 VM 为 Debian/Ubuntu、架构为 `x86_64`，应用根目录为
`/opt/persona`；路径可改为实际 VM 路径，但数据库和配置文件必须始终在 VM 本地磁盘。

### 0. 固化不可变边界

在开始前确认以下事项；任一项未确认时不要启用自动部署：

- [ ] Cloudflare Access、Tunnel、DNS 已经稳定地将公网域名转发至 VM 的 Caddy `:8080`。
- [ ] VM 已安装 Docker Engine 和 Compose plugin，且当前手动 Compose 部署可正常运行。
- [ ] `PERSONA_DATA_DIR` 与 `PERSONA_BACKUP_DIR` 指向 VM 本地磁盘，而非 NAS、SMB 或 NFS。
- [ ] `/persona-api` 不单独发布端口，只有 Caddy 网关绑定到 VM 的局域网地址。
- [ ] 已验证一次 SQLite Backup API 备份，并知道备份文件的位置。
- [ ] 只有受信任人员能推送 `master`、创建 `v*` tag 或修改 `.github/workflows/`。

Cloudflare 配置到此为止。正常发布不创建 Tunnel、不改 DNS、不改 Access policy，也不需要
在部署 workflow 中保存 Cloudflare API Token。

### 1. 建立 GitHub 发布控制面

在 GitHub 仓库中完成以下设置：

1. 在 **Settings → Environments** 创建 `production`。
2. 为 `production` 开启 **Required reviewers**；审批者不得是会无审查地推送生产 tag 的人。
3. 在 `master` 分支保护规则中要求 CI 通过，限制直接推送，并要求审查。
4. 限制谁可以创建 `v*` tag；正式版本只能由发布负责人创建。
5. 确认 GHCR package `ghcr.io/qiancheng06/persona-nas` 可由该仓库的 workflow 和 VM 拉取：
   - 镜像公开时，VM 不需要 GHCR 凭据；或
   - 镜像私有时，建立一个仅有 `read:packages` 的 fine-grained PAT，存放在 VM 私有配置中。
6. 不在 GitHub Repository Secret 中保存 VM 的 SSH 私钥、`deploy/nas/.env`、SQLite 文件、
   模型 API Key、Telegram Token 或 Cloudflare Token。

### 2. 准备 VM 的持久化目录和生产配置

以下命令在 **PVE VM** 执行，不在 PVE 宿主机、NAS 或个人开发机执行。首次操作前将
`/srv/persona` 替换为 VM 上的本地 SSD 路径。

```bash
sudo install -d -o 1000 -g 1000 -m 0750 /srv/persona/data
sudo install -d -o 1000 -g 1000 -m 0750 /srv/persona/backups
sudo install -d -o root -g persona-deploy -m 0750 /etc/persona
sudo install -m 0640 -o root -g persona-deploy /dev/null /etc/persona/runtime.env
```

将运行配置写入 `/etc/persona/runtime.env`。它不在 Git 仓库，也不由 workflow 覆盖：

```dotenv
# 镜像版本由部署脚本每次以环境变量覆盖；这里不填写 latest。
PERSONA_IMAGE=ghcr.io/qiancheng06/persona-nas:placeholder
PERSONA_DATA_DIR=/srv/persona/data
PERSONA_BACKUP_DIR=/srv/persona/backups
PERSONA_BACKUP_RETENTION_DAYS=30
PERSONA_GATEWAY_BIND_IP=<VM 的固定局域网 IP>
PERSONA_GATEWAY_PORT=8080
PERSONA_ALLOWED_ORIGINS=https://persona.example.com
PERSONA_TIME_ZONE=Asia/Shanghai
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
OPENAI_API_KEY=<真实服务端密钥>
PERSONA_DAILY_SUMMARY_ENABLED=true
PERSONA_OBSIDIAN_SNAPSHOT_ENABLED=false
TELEGRAM_TOKEN=
TELEGRAM_ALLOWED_CHAT_IDS=
```

校验要求：

- [ ] 仅 `root` 和后续的 `persona-deploy` 组可读取该文件。
- [ ] 它不包含 `CLOUDFLARE_TUNNEL_TOKEN`，因为当前使用已有 iKuai Tunnel。
- [ ] 生产配置从不使用 `LLM_PROVIDER=mock`。
- [ ] `PERSONA_ALLOWED_ORIGINS` 精确等于 Access 保护的 HTTPS 域名。

### 3. 安装专用 VM Runner

在 VM 创建一个仅用于部署的账户和 Docker 访问组。以下示例假定 Docker daemon 已安装；
`persona-deploy` 是受限的 Linux 组，不等同于公开登录账户。

```bash
sudo groupadd --system persona-deploy || true
sudo useradd --create-home --shell /bin/bash --groups docker,persona-deploy github-runner
sudo usermod -aG persona-deploy root
```

随后在 GitHub **Settings → Actions → Runners → New self-hosted runner** 选择 Linux x64，
并在 VM 用 GitHub 页面给出的、一次性注册命令安装 Runner。不要将注册 token 写进文档、
仓库或 shell history。安装位置建议为 `/opt/actions-runner`，所属用户为 `github-runner`。

配置 Runner 时使用专用标签，例如：

```text
self-hosted, linux, x64, persona-vm-production
```

Debian 上如果 `config.sh` 报告缺少 .NET 6.0 的 `libicu` 等依赖，先在 Runner
目录执行一次（该步骤才使用 sudo）：

```bash
cd /home/github-runner/actions-runner
sudo ./bin/installdependencies.sh
```

依赖安装完成后，`config.sh` 仍必须由 `github-runner` 用户执行，不能使用 sudo。

安装为 systemd 服务，并确认它以 `github-runner` 身份运行。Runner 只连接本仓库；不要把
它注册为组织级共享 Runner。完成后检查：

- [ ] GitHub Runners 页面显示该 Runner 为 `Idle`。
- [ ] `github-runner` 能运行 `docker version` 和 `docker compose version`。
- [ ] Runner 用户能读取 `/etc/persona/runtime.env`，但普通 VM 用户不能。
- [ ] Runner 不执行任何 `pull_request` 事件；只有受保护 tag 的发布 workflow 使用该标签。

> 注意：Docker 组通常等同于主机高权限。这里的安全边界依赖于 Runner 只运行受保护的
> 发布 workflow、分支/tag 保护与 GitHub Environment 审批，而不是把 Docker 组误认为低权限。

### 4. 将 Compose 改为“只拉镜像”的生产模式

生产 VM 不能再以 `docker compose build` 作为发布步骤。部署 workflow 会从 tag checkout
获得 `deploy/nas/compose.yaml` 与 `Caddyfile`，但启动时只拉 GHCR 镜像：

```bash
export PERSONA_IMAGE=ghcr.io/qiancheng06/persona-nas:1.2.0
docker compose \
  --project-directory /opt/persona \
  --env-file /etc/persona/runtime.env \
  -f /opt/persona/deploy/nas/compose.yaml \
  -f /opt/persona/deploy/nas/compose.existing-tunnel.yaml \
  pull
```

实施时应新增一个生产部署脚本，接收唯一参数 `vX.Y.Z`，并拒绝空值、`latest` 和不符合
SemVer 的 tag。脚本将版本转换成镜像标签 `X.Y.Z`，以 shell 环境变量覆盖
`runtime.env` 的占位 `PERSONA_IMAGE`。脚本不编辑 `runtime.env`。

脚本的固定顺序是：

```text
校验 vX.Y.Z
  -> 确认 GHCR 镜像可用
  -> SQLite Backup API 备份（标记 pre-vX.Y.Z）
  -> docker compose pull
  -> docker compose up -d --no-build --wait
  -> 容器与 /healthz、/health、/calendar 健康检查
  -> 输出版本、镜像 digest、备份标识和时间
```

脚本必须 `set -euo pipefail`，对失败返回非零退出码，并且不打印 `/etc/persona/runtime.env`
的内容或任何 secret。

### 5. 新增受审批的部署 workflow

在现有 `.github/workflows/ci.yml` 中新增 `deploy-vm` job，其关键契约如下（也可以拆成
独立 workflow，但必须保留对同一次 CI/镜像构建的依赖）：

```yaml
jobs:
  deploy:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: nas-image
    environment: production
    runs-on: [self-hosted, linux, x64, persona-vm-production]
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.ref }}
      - name: Validate release tag
        shell: bash
        run: |
          set -euo pipefail
          [[ "${GITHUB_REF_NAME}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
      - name: Deploy immutable image
        shell: bash
        run: bash deploy/vm/deploy-release.sh "${GITHUB_REF_NAME}"
```

实施时 `deploy-release.sh` 必须在仓库中创建，并由上述 workflow 调用。若 GHCR package
为私有，登录动作从 VM 私有凭据读取，或使用该 job 的最小 `packages:read` token；不要
把长期 token 写入脚本。

`environment: production` 是审批门。workflow 到达该 job 后会等待 GitHub Environment
批准，未批准时 VM Runner 不会执行部署。

### 6. 首次演练（不影响正式用户）

正式开 CD 前进行一次受控演练：

1. 创建一个仅含小改动的候选版本，例如 `v1.0.1`，确认 CI 与 GHCR tag 产物成功。
2. 在 GitHub Actions 中确认 deploy job 停在 `production` 等待审批，而不是已开始执行。
3. 批准后观察 VM Runner 日志：它应只拉取固定 tag，不进行 `git pull`、`docker compose build`
   或 Cloudflare API 调用。
4. 确认发布前 SQLite 备份在 `/srv/persona/backups` 中生成。
5. 确认 `docker compose ps` 所有必要服务为 healthy。
6. 从 VM 内、局域网和经 Cloudflare Access 的浏览器分别确认 `/healthz`、`/calendar` 与
   `/persona-api/health`。
7. 创建一条可识别的日历测试数据，重启服务后确认数据仍在。
8. 在 GitHub Actions 发布摘要中记录 tag、commit SHA、镜像 digest、备份文件名和健康检查结果。

只在上述步骤成功后，将该方案视为已完成 CD；单纯看到 Runner 绿色或容器启动并不能证明
公网入口与持久化数据正常。

### 7. 日常发布清单

每次正常发版按以下顺序：

1. 合并到受保护的 `master`，等待现有 CI 通过。
2. 更新 `package.json` 版本并创建对应的带注释 tag，例如 `v1.2.0`。
3. 推送 tag：`git push origin v1.2.0`。
4. 等待 CI 将 `persona-nas:1.2.0` 发布到 GHCR。
5. 在 GitHub Actions 核对 commit SHA、镜像 tag 和 CI 结果，然后批准 `production`。
6. 等待 VM Runner 完成备份、固定镜像部署和健康检查。
7. 保存 GitHub Actions run 链接、镜像 digest、备份标识和人工验收结果。

不应通过 SSH 登录 VM 临时改源码、执行 `git pull`、使用 `latest` 或重新 `build` 来绕过该流程。

### 8. 回滚清单

回滚是一次新的、需要 `production` 审批的部署，而不是在 VM 内手工替换容器：

1. 选择上一个已验证的版本 tag 和对应镜像 digest。
2. 保留故障版本当前 SQLite 数据，并先创建新的安全备份。
3. 用同一部署脚本对旧的固定镜像 tag 运行 `pull -> up -d --no-build -> health check`。
4. 验证公网 Workspace、Persona API、关键日历数据和后台任务状态。
5. 若数据库迁移不兼容，按该版本的恢复计划先恢复相容的 SQLite 备份；不能仅靠旧镜像回滚。
6. 在发布记录中说明故障版本、回滚版本、数据处理和后续修复责任。

### 9. 维护与故障处置

- 每月确认 Runner 在线、Docker 磁盘空间充足、GHCR 拉取仍可用、备份保留策略生效。
- Runner 离线时，发布 job 应保持排队或失败；不要自动改用 SSH 或 NAS。
- 镜像拉取失败时，保持当前健康版本运行，修复包访问或 tag 后再重新部署。
- 备份失败时，部署脚本必须停止；不得跳过 SQLite 备份继续升级。
- 健康检查失败时，保留日志和当前容器状态；根据已记录的上一个版本走审批回滚。
- Cloudflare 入口故障应由独立的 Cloudflare 运维流程处理，不应通过重发应用镜像来掩盖。
