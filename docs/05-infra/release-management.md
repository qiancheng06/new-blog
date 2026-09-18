# 版本与发布管理

本文定义 Persona Workspace 的版本、CI、镜像和远端部署责任边界。发布由
`Release/Operations Agent` 负责，业务 Agent 只提交功能代码和必要的 contract，不直接操作生产环境。

## 责任边界

Release/Operations Agent 负责：

- 维护根目录 `package.json` 的项目版本号和发布记录。
- 管理 Git tag、GitHub Actions、Docker 镜像标签和 release commit。
- 在 CI 通过后执行或协调 NAS/远端部署、健康检查、回滚和发布证据记录。
- 保持 Workspace、Blog、Android 和 Persona 的构建入口可重复执行。

它不负责修改业务实现、API 业务规则、Memory schema、Obsidian 内容或前端交互。

## 版本规则

- 项目发布版本使用 SemVer：`MAJOR.MINOR.PATCH`。
- 根目录 `package.json` 的 `version` 是当前单体发布版本的基准。
- 正式发布 tag 使用 `vMAJOR.MINOR.PATCH`，例如 `v1.2.0`。
- `MAJOR` 表示不兼容的公开 API 或部署契约变化；`MINOR` 表示向后兼容的新功能；`PATCH` 表示修复和不改变契约的调整。
- Mobile API、前端读模型和其他跨项目接口可以有自己的协议版本，例如 `mobile/v1`；协议版本不因普通补丁版本自动改变。
- 不使用 `latest` 作为唯一生产依据。生产部署必须记录不可变的版本 tag 或 commit SHA。

## 发布门禁

创建版本 tag 前至少确认：

1. Workspace、Blog、Android 和 Persona 的相关检查已通过。
2. `npm.cmd run verify:ci` 通过，且 CI 构建没有改写受跟踪文件。
3. `npm.cmd run check:deploy` 通过，Compose 配置和部署契约有效。
4. 生成数据已在可访问 Obsidian Vault 的环境同步，或部署包已包含等价的读模型产物。
5. 生产配置、数据库、Vault 和镜像版本均有回滚记录。

GitHub Actions 当前在 `master` 和 `v*` tag 上验证代码并构建 `linux/amd64` 镜像；版本 tag 还会生成对应的 SemVer 与 commit SHA 镜像标签。是否推送、部署或回滚必须以远端发布记录为准，不能只看 CI 的绿色状态。

## 发布记录

每次正式发布应记录：

- 版本号、Git tag、commit SHA 和发布时间。
- CI 运行地址或运行编号。
- 使用的 Docker 镜像完整标签。
- 远端主机/Compose 配置和健康检查结果。
- 数据库备份位置、回滚目标和操作者。
- 已知问题以及是否需要同步更新 Android 或 Mobile API。

发布记录可以放在 GitHub Release、部署系统或受控的运维日志中，不把密钥、Token、SQLite 内容或私人对话写入仓库。

## 回滚原则

- 应用回滚优先切换到上一个已验证的镜像 tag，不在生产机临时修改源码。
- 数据库迁移必须与应用版本兼容，并提供独立的备份与恢复步骤。
- 回滚后重新检查 Workspace、Blog、Persona API、Android API 入口和 Cloudflare/Caddy 健康状态。
- 发布 Agent 只能回滚发布产物，不能删除 Event、Memory、Obsidian 内容或绕过数据治理规则。
