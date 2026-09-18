# Persona Android Client UI 设计规范

> 版本：0.1 Demo
>
> 更新时间：2026-09-09
>
> 适用范围：`apps/android/**` 的 Kotlin / Jetpack Compose 原生客户端。

本文档是 Android 客户端的视觉与交互基线。它描述客户端如何呈现和组织已发布的能力，不定义 Conversation、Calendar、Capture 或 Memory 的服务端业务规则。

## 1. 设计定位

Persona 是一个安静、可靠的个人空间：帮助用户看清今天要做什么、记录当下想法，并在需要时与 AI 对话。

视觉方向：

- A 的温度：暖纸张感、个人化、克制的编辑式排版。
- D 的结构：清晰、高效、可扫描、适合单手操作。
- B 的暗色模式：石墨背景、柔和浅色文字、低刺激夜间体验。

核心原则：

1. 先呈现“现在该关注什么”，再呈现功能入口。
2. 每个页面只有一个主要动作。
3. 信息靠尺寸、留白、层级和语义颜色区分，不只依赖颜色。
4. 复杂选项渐进展开，首屏保持安静。
5. 客户端只负责呈现、交互和本地状态，事实以服务端 API 为准。

## 2. 导航结构

```text
Today       Tools       +       Chat       Settings
```

这是四个一级页面加一个全局动作：

| 入口 | 类型 | 内容 |
| --- | --- | --- |
| Today | 一级页面 | 日期、周历、今日重点、Upcoming、Persona 建议 |
| Tools | 一级页面 | 当前留白，仅展示工具站建设中 |
| `+` | 全局动作 | 打开快速记录 Bottom Sheet |
| Chat | 一级页面 | AI 对话界面 |
| Settings | 一级页面 | 设备、外观、通知、同步和断开设备 |

导航规则：

- 默认启动 `Today`。
- 底部导航保留图标和文字，当前页面有清晰选中态。
- `+` 不参与页面选中态，不清空当前页面状态。
- 页面切换使用 `launchSingleTop` 和状态恢复，返回时保留滚动位置和输入内容。
- 一级页面不超过 4 个，中央 `+` 是唯一主操作。
- 支持 Android 系统返回和 Predictive Back。

## 3. Token 架构

实现时遵循三层 Token：

```text
Primitive Tokens → Semantic Tokens → Component Tokens
```

页面和组件不应散落新的原始颜色或尺寸。主题切换只覆盖 Semantic Tokens。

### 3.1 Primitive 色彩

#### Light 基础色

| Token | 值 | 用途 |
| --- | --- | --- |
| `paper-500` | `#F7F1E8` | 页面背景 |
| `paper-100` | `#FFFAF3` | 卡片和输入面 |
| `ink-900` | `#232821` | 主文字 |
| `sage-700` | `#4E674C` | 主色、确认动作 |
| `sage-100` | `#DCE4D4` | 主色容器 |
| `clay-600` | `#B45D3A` | 次要强调、提醒 |
| `stone-400` | `#B9B2A7` | 边框 |

#### Dark 基础色

| Token | 值 | 用途 |
| --- | --- | --- |
| `graphite-950` | `#111411` | 页面背景 |
| `graphite-900` | `#1A1E1A` | 卡片和输入面 |
| `graphite-800` | `#262B26` | 次级 Surface |
| `warm-white-100` | `#F4EBDD` | 主文字 |
| `night-sage-300` | `#AFC89A` | 主色、确认动作 |
| `night-sage-800` | `#344431` | 主色容器 |
| `night-clay-300` | `#E49A78` | 次要强调、提醒 |
| `graphite-outline` | `#777D73` | 边框和分隔线 |

### 3.2 Semantic 色彩

| Semantic Token | Light | Dark | 语义 |
| --- | --- | --- | --- |
| `background` | `paper-500` | `graphite-950` | 页面底色 |
| `surface` | `paper-100` | `graphite-900` | 卡片、底栏、输入框 |
| `surface-variant` | `#ECE5DA` | `graphite-800` | 次级卡片、Persona 建议 |
| `on-background` | `ink-900` | `warm-white-100` | 页面主文字 |
| `on-surface` | `ink-900` | `warm-white-100` | Surface 上的文字 |
| `on-surface-variant` | `#62685F` | `#C7C8BF` | 辅助文字 |
| `primary` | `sage-700` | `night-sage-300` | 主操作和选中态 |
| `primary-container` | `sage-100` | `night-sage-800` | 问候卡、设备卡 |
| `secondary` | `clay-600` | `night-clay-300` | 次级强调和提醒 |
| `error` | Material Error | Material Dark Error | 错误和危险动作 |

颜色要求：

- 正文与背景至少达到 4.5:1 对比度。
- UI 边界和图标至少达到 3:1 对比度。
- 状态必须同时使用文字、图标或形状，不允许只用红绿颜色表达。
- Dark Mode 使用降饱和的浅色 Token，不直接反转 Light Mode 颜色。

### 3.3 间距、圆角和层级

| Token | 值 | 用途 |
| --- | --- | --- |
| `space-1` | 4dp | 图标与文字的微间距 |
| `space-2` | 8dp | 紧凑组件间距 |
| `space-3` | 12dp | 控件内部间距 |
| `space-4` | 16dp | 标准组件间距 |
| `space-5` | 20dp | 页面水平边距、卡片内边距 |
| `space-6` | 24dp | 页面分区间距 |
| `space-8` | 32dp | 大区块间距 |
| `touch-min` | 48dp | 最小触控区域 |
| `nav-height` | 80dp | 底部导航区域 |
| `fab-size` | 58dp | 中央快速记录按钮 |

圆角：

- 普通控件：12–16dp。
- 输入框和主要卡片：20–22dp。
- 胶囊、头像、FAB：`CircleShape` 或完全圆角。
- 同一层级避免混用多个不同圆角。

阴影与层级：

- 优先用 Surface 色阶区分层级。
- 卡片只使用轻微 tonal elevation，不使用厚重阴影。
- Bottom Sheet 通过遮罩和层级表达，不用装饰性模糊。

## 4. 字体规范

使用 Android 系统字体作为正文，标题可使用 `FontFamily.Serif`，形成参考图中的编辑感。

| 角色 | 建议字号 | 字重 | 行高 | 用途 |
| --- | ---: | --- | ---: | --- |
| Display | 38sp | Regular | 44sp | 品牌或引导标题 |
| Headline Large | 32sp | Regular | 38sp | 页面标题 |
| Headline Medium | 27sp | Regular | 34sp | 次级页面标题 |
| Title Large | 22sp | Medium | 28sp | 分区标题、主要卡片标题 |
| Title Medium | 16sp | SemiBold | 22sp | 卡片标题、设置项 |
| Body Large | 16sp | Regular | 24sp | 正文和事件标题 |
| Body Medium | 14sp | Regular | 21sp | 辅助说明 |
| Label Large | 14sp | SemiBold | 20sp | 按钮和导航标签 |

正文不得低于 14sp；重要说明和输入内容优先使用 16sp。支持系统字体放大，不因字号变化强制截断长文本。

## 5. 页面规范

### 5.1 Today

页面顺序固定：

```text
Today 标题与日期
→ 一周日期选择条
→ 问候卡
→ 今日重点
→ Upcoming 时间轴
→ Persona 建议卡
→ 离线 / 同步状态
```

要求：

- Today 是默认入口，不直接展示完整月历网格。
- 一周选择条支持选择日期，提供“回到今天”按钮。
- 今日重点最多优先展示 3 项。
- Upcoming 使用时间、色点、标题和箭头组成时间轴行。
- 没有真实事件时可以显示 Demo 数据，但必须标记“示例内容”。
- 真实服务端数据覆盖 Demo 数据后，不再显示示例标记。
- 离线时展示已缓存日历，不允许伪装成已同步。

### 5.2 Tools

当前仅保留空状态：

```text
Tools

        [工具图标]
    工具站正在搭建中
这里会逐步加入更顺手的个人工具。
```

空状态应居中、安静、无虚假入口。待工具站真实能力完成后，再增加工具列表。

### 5.3 Quick Capture

由中央 `+` 打开 Bottom Sheet：

```text
Write it down
先记下来，之后再慢慢整理。

[ 笔记 ] [ 想法 ] [ 日记 ]

[ 多行输入框 ]

[ 保存记录 ]
```

- 默认类型为 `note`。
- 首期只使用 `note`、`idea`、`journal`。
- 输入框打开后直接获得焦点。
- 系统分享文本自动预填。
- 保存按钮是唯一主要 CTA。
- 有未保存内容时关闭 Sheet 需要确认。
- 保存成功后提供明确反馈，不丢失输入内容。

### 5.4 Chat

```text
Persona                              [状态图标]
在这里慢慢想清楚

[ Persona 消息 ]
                         [ 我的消息 ]

[ 输入框：说点什么… ] [发送]
```

- Persona 消息靠左，用户消息靠右。
- 用户消息使用 primary，Persona 消息使用 surface。
- 消息气泡最大宽度约为屏幕 82%。
- 输入栏固定在内容底部，并避让软键盘。
- 发送中显示“Persona 正在思考…”。
- 错误提示靠近输入栏，并提供重试路径。
- AI 建议动作必须由用户确认后执行。

### 5.5 Settings

分组顺序：

```text
Settings
→ 本地预览状态卡片
→ 偏好：外观、通知与提醒
→ 应用：关于 Persona
```

配对与连接管理暂时不出现在当前 Demo 中，状态卡必须明确说明“本地演示模式”，
不能伪装成已连接服务端。

## 6. 核心组件规范

| 组件 | 默认 | 交互状态 |
| --- | --- | --- |
| Primary Button | `primary` 背景、反色文字、高度 52–54dp | pressed、disabled、loading |
| Outlined Button | 透明背景、outline 边框 | pressed、disabled |
| Card | Surface、20–22dp 圆角 | 普通、可点击、空状态 |
| Navigation Item | 图标 + 文字 | selected、pressed、disabled |
| FAB | primary、58dp、圆形 | pressed、disabled |
| Input | 透明或 Surface、20–24dp 圆角 | focused、error、disabled、loading |
| Bottom Sheet | Surface、顶部圆角 | open、dismiss、unsaved |
| Status Chip | 图标 + 文本 | synced、syncing、offline、error |

状态优先级：`disabled` > `loading` > `active` > `focused` > `pressed` > `default`。

## 7. 动效与反馈

- 按压反馈在 80–150ms 内出现。
- 颜色和背景状态切换约 150ms。
- 页面或 Sheet 位移动效约 200–300ms。
- 使用透明度和位移，不动画化会造成布局抖动的宽高。
- Bottom Sheet 从 `+` 的空间位置展开，关闭速度略快于打开。
- 动效表达因果关系，不做装饰性连续动画。
- 用户启用减少动效时，降级为淡入淡出或直接切换。

## 8. 无障碍与设备适配

- 所有可点击控件触控区域至少 48dp，控件之间至少 8dp 间距。
- 图标按钮必须提供内容描述；装饰性图标不重复朗读可见文字。
- 选中、展开、加载、失败和离线状态必须可被 TalkBack 理解。
- 不以颜色作为唯一状态指示。
- 支持系统字体缩放，长标题优先换行。
- 页面内容避开状态栏、刘海、导航栏和手势区域。
- 软键盘出现时，输入框和发送按钮不能被遮挡。
- 在小屏手机、较大手机、横屏和平板宽度上检查布局。
- 保持一个主要滚动区域，避免嵌套滚动冲突。

## 9. 客户端边界

### 当前本地 Demo 策略

当前五段式 Demo 直接进入主界面，不显示配对页，也不创建 Mobile API 会话或
启动远端同步。Today 使用本地缓存或明确标记的示例日程，Chat 和 Capture 使用
本地 Demo 回执。

服务端 Mobile API v1 的 Bearer Token 合同暂时保留。客户端流程下线不代表服务端
开放未鉴权访问；恢复远端能力前，需要由 Application/API Agent 与 Android Client
Agent 共同确定新的接入时机和迁移方案。

本规范不授权 Android 修改服务端协议或业务规则。Android 只消费 [mobile-api-v1.md](mobile-api-v1.md) 中记录的接口。

允许：

- 页面、组件、主题、动画和交互状态。
- 本地缓存和未来同步 UI。
- 日历提醒、系统分享和客户端错误恢复。

不允许：

- 直接访问 SQLite、Obsidian、Workspace 读模型或 LLM Provider。
- 在客户端复制 Conversation、Memory 或 Calendar 业务规则。
- 将 Demo 数据写入服务端或作为事实源。
- 在 Android 保存 LLM API Key。

## 10. Compose 实现映射

建议保持以下组件层级：

```text
PersonaTheme
├── PersonaApp
├── PersonaBottomBar
├── TodayScreen
│   ├── WeekCalendar
│   ├── PriorityRow
│   └── AgendaRow
├── ToolsScreen
├── CaptureSheet
├── ChatScreen
│   └── ChatBubble
└── SettingsScreen
```

主题 Token 集中在 `PersonaTheme.kt`。页面只使用 `MaterialTheme.colorScheme` 和 `MaterialTheme.typography`，不得在页面内新增散落的原始色值。

## 11. 验收清单

- [ ] 五段式导航顺序为 `Today / Tools / + / Chat / Settings`。
- [ ] Today 首屏包含日期、周历、问候、今日重点、Upcoming、Persona 建议。
- [ ] Tools 保持建设中空状态，没有虚假工具入口。
- [ ] `+` 打开速记 Bottom Sheet，支持 Note / Idea / Journal。
- [ ] Chat 保持简洁聊天布局，支持发送中和错误状态。
- [ ] Settings 明确显示本地预览状态，并包含外观、通知和关于入口，不出现配对或断开设备操作。
- [ ] Light / Dark 主题都可读，正文对比度至少 4.5:1。
- [ ] 主要触控区域至少 48dp，支持 TalkBack 和系统字体放大。
- [ ] 软键盘、安全区域和系统返回行为正常。
- [ ] 真实数据、Demo 数据、离线缓存状态有明确区分。
- [ ] Android 代码不越过 Mobile API v1 边界。
