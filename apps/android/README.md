# Persona Android Client

这是 Persona 的独立 Android 客户端项目，使用 Kotlin 和 Jetpack Compose。它与
`apps/workspace/` 的 Next.js 工作台、`apps/blog/` 的公开博客是三个不同的前端项目。

## 职责

- 提供 Android 原生的 Today、Tools、快速记录、Chat 和 Settings 五段式界面。
- 通过 Mobile API v1 完成设备配对、Chat、Capture 与 Calendar 同步。
- 未配对时保持本地演示模式；配对后走 Bearer Token 与服务端事实源。
- 负责系统分享与日历提醒体验。

## 不负责

- 不直接访问 SQLite、Obsidian Vault 或生成的 Web 读模型。
- 不实现 Conversation、Memory、Calendar 等服务端业务规则。
- 不复用 Workspace 的 React 组件、CSS、页面路由或博客皮肤。
- 不在客户端保存 LLM API key，也不直接调用 LLM Provider。

## 协作边界

Android 客户端只能依赖 `docs/04-application/mobile-api-v1.md` 中记录的接口。接口字段或认证流程变化时，由 Application Agent 先更新 Mobile API 合同和服务端 contract，再由 Android Client Agent 适配客户端。

Android 的本地数据模型、缓存策略和 UI 可以独立演进，但不能把客户端缓存或
Demo 数据当作 Persona 的事实源。重要写入必须通过 Mobile API，由 Persona
Application 处理 Event、版本校验和持久化。

## 当前接入范围

| 能力 | 接口 | 客户端入口 |
| --- | --- | --- |
| 配对 / 刷新 / 撤销 | `POST /pair`、`/token/refresh`、`/session/revoke` | Settings → 输入配对码 |
| 聊天 | `POST /chat` | Chat 页 |
| 速记 | `POST /captures` | 中央 `+` Capture Sheet |
| 日历只读同步 | `GET /calendar` | Today 页 + WorkManager 同步 |
| 设备同步 | `GET /bootstrap` | 配对成功后可扩展使用 |

未配对时 Chat / Capture 使用本地演示回执；Today 显示示例数据并标注「演示数据」。配对成功后状态变为「已连接」，日历从服务端拉取并缓存到应用私有存储（JSON，不依赖 Room/KSP）。

## 开发与验证

在 Android Studio 中打开本目录，或在 Windows 下执行：

```bash
gradlew.bat assembleDebug
```

调试包默认 `API_BASE_URL=http://10.0.2.2:3001/`（模拟器访问本机 Persona API）。真机请改成局域网 IP，并保证 Persona API 监听可达。

配对码由网页侧生成：

```bash
# 先启动 Persona API（:3001）
npm.cmd run dev:backend
# 或 mock
npm.cmd run dev:backend:mock

# 生成一次性配对码（生产应经 Cloudflare Access 保护的 Workspace 设置页）
curl -X POST http://127.0.0.1:3001/api/mobile/pairing-code
```

服务端合同由仓库根目录覆盖：

```bash
npm.cmd run contract:mobile
```

Android 改动不需要运行 Next.js 构建，但涉及 Mobile API 合同的改动必须同时通知 Application Agent。
