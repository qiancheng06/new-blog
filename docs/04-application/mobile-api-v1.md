# Persona Mobile API v1

> 当前状态：服务端合同保留，但 Android 五段式 Demo 已暂时移除配对入口和远端
> 会话，不调用这些接口。此状态不表示 API 可以匿名访问。

移动端接口使用独立 Bearer Token，不读取浏览器 Cookie。网页设置页面（由现有 Cloudflare Access 保护）调用 `POST /api/mobile/pairing-code` 生成一次性、五分钟有效的配对码。

## 认证

`POST /api/mobile/v1/pair` 接收 `{ code, name, appVersion }`，返回 `deviceId`、15 分钟 `accessToken` 和 90 天 `refreshToken`。刷新时提交 `{ refreshToken }`；刷新令牌轮换，旧令牌立即失效。`POST /session/revoke` 撤销当前设备。

服务端仅保存所有令牌的 SHA-256 哈希。设备撤销后访问和刷新均返回 401。配对失败按来源地址限流，并写入服务端审计日志（后续可接入统一审计表）。

## 数据接口

- `GET /bootstrap?from=YYYY-MM-DD&to=YYYY-MM-DD`：返回设备信息、日历和最近速记。
- `GET /calendar?from=...&to=...`：返回 `events`、`tags`、`timeZone`。
- `POST /calendar/events`、`PATCH /calendar/events/:id`、`DELETE /calendar/events/:id`：复用 Calendar 应用服务和版本字段。事件的 `reminder` 为 `{kind:"none"}`、定时事件提前分钟数或全天事件本地 `HH:mm`，现有事件迁移为无提醒。
- `POST /chat`：接收 `{ text, requestId? }`，返回非流式 `{ reply, eventId }`。
- `GET|POST /captures`：复用 Capture 应用服务，类型为 `note`、`idea` 或 `journal`。

所有写入使用现有版本校验；版本冲突返回 409，客户端应重新获取范围后提示用户。未知 JSON 字段由客户端忽略，v1 发布周期内服务端不删除现有字段。
