# Android Client UI Demo 上下文

> 更新时间：2026-09-09
>
> 用途：供后续 Android Client Agent 继续实现和评审当前 UI Demo。

## 1. 当前目标

为 `apps/android/` 重新设计一个独立的 Kotlin / Jetpack Compose 原生客户端。当前阶段先搭建可运行 Demo，验证导航、信息层级和视觉语言，不扩展服务端业务能力。

视觉参考来自用户提供的 Persona 概念图：暖纸张感、编辑式排版、鼠尾草绿与陶土色；此前确定将 D 方向的清晰高效结构作为骨架，并支持 B 方向的石墨深色模式。

## 2. 已确定的五段式导航

```text
Today       Tools       +       Chat       Settings
```

这是“四个一级页面 + 一个全局动作”：

- `Today`：主入口，日历与当天信息中心。
- `Tools`：暂时留白，工具站尚未搭建。
- `+`：不进入页面，打开快速记录 Bottom Sheet。
- `Chat`：普通、简洁、大方的 AI 聊天界面。
- `Settings`：设备、外观、提醒、同步和断开设备。

默认启动 `Today`。中央 `+` 不显示选中态，保持 56–64dp 视觉尺寸，触控区域至少 48dp。

## 3. Today 页面编排

Today 使用日历主界面，内容顺序已经确定为：

1. 日期、问候和 Persona 入口。
2. 一周日期选择条。
3. 今日重点事项。
4. Upcoming 时间轴 / Agenda。
5. Persona 一句话建议。

真实日历缓存存在时显示服务端事件；没有事件时显示明确标记的 Demo 示例数据，避免将示例误认为服务端事实。离线时保留本地缓存并显示离线状态。

## 4. 其他页面

### Tools

暂时只提供建设中空状态，不提前放入未搭建的工具站内容。

### Quick Capture

由中央 `+` 打开 Bottom Sheet，首期类型只使用 Mobile API v1 已定义的：

- `note`
- `idea`
- `journal`

输入框直接聚焦，支持系统分享文本预填，保存时显示 Loading / 成功反馈。不要在客户端自行增加服务端尚未定义的 Task 语义；日程属于 Calendar API。

### Chat

使用普通聊天布局：Persona 消息左侧、用户消息右侧、底部输入栏、发送状态和失败提示。AI 建议动作只能由用户确认后触发，不自动创建日程或写入其他数据。

### Settings

当前展示明确的本地预览状态卡片，以及外观、通知与提醒和关于 Persona 入口。
配对、同步状态和断开设备操作随 Mobile API 接入一起暂时下线。

## 5. 已实现代码

- [MainActivity.kt](../../apps/android/app/src/main/java/site/knotcloud/persona/MainActivity.kt)：五段式导航、Today、Tools、Chat、Capture Sheet、Settings。
- [PersonaTheme.kt](../../apps/android/app/src/main/java/site/knotcloud/persona/PersonaTheme.kt)：暖色 Light Theme 与石墨绿 Dark Theme，使用语义化 Material 3 色彩。
- [build.gradle.kts](../../apps/android/app/build.gradle.kts)：增加 Compose Material Icons Extended 依赖。

当前 Demo 使用 `PersonaViewModel` 提供本地 Chat/Capture 回执，并通过
`CalendarViewModel`、`CalendarRepository` 只读取现有本地日历缓存。启动流程不再
创建 Mobile API 会话、调度远端同步或展示配对页；服务端 Mobile API 实现保留，
但不属于当前五段式 Demo 的运行链路。

## 6. 客户端边界

当前 Android Demo 负责界面、交互、本地缓存展示、提醒和系统分享。Mobile API
接入与设备配对暂时下线，恢复接入时仍只能调用 `/api/mobile/v1/*`。

Android 不负责：

- 修改 `apps/workspace/**`、`apps/blog/**` 或 Persona 服务端业务实现。
- 直接访问 Persona SQLite、Obsidian Vault、Workspace 读模型或 LLM Provider。
- 复制 Conversation、Memory、Calendar 的服务端业务规则。
- 在客户端保存或调用 LLM API Key。
- 将 Mobile API 改成无认证访问，或修改数据库 schema、服务端 contract。

Mobile API 字段、认证流程和服务端 contract 仍由 Application/API Agent 维护；
数据库迁移由 Infra Agent 负责。暂时移除客户端配对流程不等于取消服务端认证。

## 7. 设计约束

- Android Material 3 原生交互，间距采用 4/8dp 节奏。
- 主要触控目标至少 48dp，避免仅依赖手势或颜色表达状态。
- 底部导航带图标和文字，并始终显示当前选中态。
- Light / Dark 两套主题都使用语义色 Token，不在页面散落硬编码颜色。
- 支持安全区域、键盘避让、Loading、Error、Offline 和空状态。
- 图标使用一致的 Material vector icon，不使用 Emoji 作为结构性图标。
- 长列表保持单一滚动区域，避免底部导航遮挡内容。

## 8. 验证结果

本次五段式与配对下线改动执行：

```bash
gradlew.bat compileDebugKotlin --no-daemon --no-parallel --max-workers=1
npm.cmd run check:workspace
npm.cmd run build
```

上述检查均通过，Android Kotlin、Workspace 入口和生产构建有效。当前 Demo
暂停 KSP 生成，并因模块全部为 Kotlin 而跳过空的 JavaCompile 任务，规避本机
Javac 无法重新打开 AGP 生成 `R.jar` 的权限问题。随后执行：

```bash
gradlew.bat clean assembleDebug --no-daemon --no-parallel --max-workers=1
```

结果：`BUILD SUCCESSFUL`。产物为
`apps/android/persona-five-tab-demo-debug.apk`，已通过 APK Signature Scheme v2
签名验证。

`git diff --check` 通过。

## 9. Mobile API v1 恢复接入（2026-09-15）

已恢复客户端对 `/api/mobile/v1/*` 的调用，仍遵守五段式导航与设计约束：

- `PersonaViewModel`：配对、Chat、Capture 走 Mobile API；未配对保持演示回执。
- `Session` + `TokenAuthenticator`：Bearer 访问令牌，过期后用 refresh token 轮换。
- `CalendarRepository`：改用 SharedPreferences JSON 缓存（避免本机 Room/KSP 与 Javac 权限问题），同步后重排提醒。
- Today：有服务端事件时显示真实日历；无数据时保留示例并标注「演示数据」。
- Settings：输入配对码连接 / 已配对可断开；配对码由网页 `POST /api/mobile/pairing-code` 生成。
- Manifest 增加 `INTERNET`；调试构建 `API_BASE_URL` 默认为 `http://10.0.2.2:3001/`。

验证：`gradlew.bat assembleDebug` → `BUILD SUCCESSFUL`，产物 `persona-mobile-api-debug.apk`。

## 10. 下一步建议

后续优先级：

1. 在真机或模拟器上检查配对、Chat 往返与日历刷新。
2. 根据真实日历事件补全事件点击、创建、编辑、删除和 `409` 冲突反馈。
3. 将 Demo 示例数据与真实空状态进一步区分。
4. 真机 LAN 场景把 `API_BASE_URL` 改为工作站局域网 IP。
5. 再决定 Tools 页面未来承载哪些已实现工具。
