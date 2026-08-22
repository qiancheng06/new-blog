# Infra

Infra 负责外部依赖、运行时环境与适配器。

## 本域职责

- 数据库连接与 schema 初始化。
- LLM 厂商适配器。
- Telegram API 适配器。
- Obsidian 文件系统路径与同步运行时。
- 配置、部署、日志与健康检查。
- 支撑 Application 健康/状态 API 的运行时信号。

## 本域不负责

- 业务规则。
- 记忆语义。
- Companion 表达策略。
- Workspace 内容模型变更。
- LLM 厂商内部的 Prompt 或业务上下文组装。
- Workspace 可观测面板 UI 或指标解读。

## Event 读取边界

SQLite 保存完整的不可变 Event 供内部处理与审计，但 Infra 行不是 HTTP
契约。Application 暴露白名单化的 Event Feed 投影，省略 raw payload、
metadata 与 Telegram chat/user/message 标识。Feed 搜索只考虑受限的用户可读
文本、摘要或原因字段；私有标识既不返回也不可搜索。显式标记为非用户可见的
Event 没有公开预览或可搜索内容。Conversation History 遵循同一条规则，同时
把输入/回复 Event 关联到持久化 Conversation job；它只暴露受限可见文本、
时间戳、job 状态与受限错误码。

## LLM 边界

`apps/persona/src/infra/llm/deepseek.ts` 是厂商适配器。它只负责把已组装好的
消息翻译成 DeepSeek API 请求、发送并解析厂商响应。

Prompt 与上下文组装属于 AI runtime 的 prompt 层，当前位于
`apps/persona/src/ai-runtime/prompts/prompt-builder.ts`。厂商不得添加
"近期对话"、"记忆上下文"、"用户意图"或"分析指令"等域标签。

DeepSeek 适配器把 Analysis 响应解析为 JSON，并在返回 AI Runtime 之前校验
完整运行时形状。校验失败只报告 schema 路径；错误中不包含厂商输出与用户内容。

设置 `LLM_PROVIDER=mock` 用于无网络 smoke 测试。mock 厂商返回确定性的
Companion 回复与 Memory patch，同时保持与真实 DeepSeek 厂商相同的
`callCompanion` / `callAnalysis` 接口。

Daily Summary 的日期边界使用 `PERSONA_TIME_ZONE`（IANA 时区，默认
`Asia/Shanghai`）。厂商只接收所选本地日期的受限上下文。mock 模式在无网络
调用的情况下返回确定性 Daily Note。

`PERSONA_DAILY_SUMMARY_ENABLED` 默认 `true`，`PERSONA_DAILY_SUMMARY_TIME`
默认 `00:05`。完整 Persona 运行时在该本地时间结束前一天的总结。需要只暴露
手动 Daily Summary API 时，把 enabled 标志设为 `false`。

## 本地后端入口

- `npm run dev:backend`：在 3001 启动真实本地 Persona 运行时，包括 API 与 Telegram bot。
- `npm run dev:backend:mock`：以 `LLM_PROVIDER=mock`、禁用 Telegram 的方式在 `http://127.0.0.1:3001` 启动相同 API 表面。用于无需真实模型的本地 Workspace demo。
- `npm run dev:mock`：启动或复用两个本地 demo 服务：Workspace（`http://127.0.0.1:5173/`）与 Persona mock API（`http://127.0.0.1:3001`）。
- `apps/workspace/start-blog.bat`：同一 mock demo 流程的 Windows 启动器，等待 Workspace dev server 与 Persona mock API 后打开仪表盘。
- 如果 3001 已被旧后端进程占用，先停止该进程/窗口再重启 `dev:backend` / `dev:backend:mock`。旧后端可能表现为 `http://127.0.0.1:3001/api/status` 返回 404。

## 真实模式就绪

修改真实模式启动行为前，先运行无网络 infra 契约：

```bash
npm.cmd run check:infra
```

启动真实模式前，运行面向人的运行时诊断：

```bash
npm.cmd run diagnose:runtime
```

它打印厂商配置、Telegram 配置、本地 SQLite 存在性、schema 存在性与 Obsidian
vault 路径形状的脱敏就绪状态。它不会调用 DeepSeek、调用 Telegram、启动长驻
服务、导入 DB pool 或初始化数据库。

真实 DeepSeek 模式使用 `LLM_PROVIDER=deepseek` 并要求 `OPENAI_API_KEY`。
变量名保留兼容性，但当前适配器将其作为 bearer token 发送到
`https://api.deepseek.com/v1/chat/completions`。

`TELEGRAM_TOKEN` 可选。为空时 Persona 启动 API 并跳过 Telegram。启用 Telegram
启动时，空或占位 token 会在 bot 启动前通过 preflight 失败。运行时 Telegram
轮询错误以 `[telegram startup error]` 或 `[telegram bot error]` 记录，不应视为
Workspace API 契约变更。

启用 Telegram 时，`TELEGRAM_ALLOWED_CHAT_IDS` 必须包含一个或多个以逗号分隔的
可信数字 chat ID。其他 chat 的更新在创建 Event 前被丢弃。白名单默认
fail-closed：空列表绝不意味着公开访问。

被授权的 Telegram 消息使用由 `chat_id + message_id` 派生的确定性 Event id。
因此跨进程重启的轮询重投递保持幂等。重复投递被确认但不会再次调用模型或
Telegram 回复；针对已存在标识的冲突内容通过常规 handler 错误路径记录日志。

Persona API 默认绑定 `API_HOST=127.0.0.1`。浏览器访问受限于
`PERSONA_ALLOWED_ORIGINS`；默认列表包含 5173 与 5174 的本地 Workspace 开发
来源。非 loopback host 必须是带上游鉴权的显式部署选择。

`SIGINT`、`SIGTERM` 与编程式 `runtime.stop()` 走同一条优雅关闭路径。Persona
停止接收 API 与 Telegram 输入后，等待最多 25 秒让受追踪的
Analysis/Memory 后台工作收敛。`/health` 是稳定的进程存活探针；`/ready` 检查
SQLite schema 与 LLM 配置；`/api/status` 增加可选组件降级与运行计数器。
这些端点只暴露受限状态与计数，绝不包含任务输入、配置路径、私有内容、厂商
输出、密钥或原始错误。

Telegram 与 Obsidian 可选。Telegram 轮询生命周期失败、配置的 vault 不可用、
自动 Daily Summary 运行失败、Persona Snapshot 运行失败或
Conversation/Analysis job 失败会使 `/api/status` 标记为 `degraded`，而
`/ready` 仍成功。数据库或 LLM 配置失败使 `/ready` 返回 `503`。

自动 Daily Summary 生成被追踪为优雅关闭的后台工作。它按日期单飞，只在成功
完成全天生成后才把 Daily Note 标记为 finalized。如果 Obsidian 归档随后失败，
重试从归档阶段继续而不再次调用模型。`daily_summary_runs` 状态机在重启后
存活、恢复被中断的尝试，并优先处理最旧的未完成日期。重试延迟从 15 分钟增长
到最多 6 小时。运行时状态只暴露日期、计数与受限状态，绝不包含原始错误或
笔记内容。未完成的运行在启动时采用当前归档设置，因此禁用 Obsidian 会释放
归档-only 失败。

自动 Persona Snapshot 导出使用 `PERSONA_OBSIDIAN_SNAPSHOT_ENABLED` 与
`PERSONA_OBSIDIAN_SNAPSHOT_TIME`（在 `PERSONA_TIME_ZONE` 中默认 `00:15`）。
未设置 enabled 标志时，已配置 Vault 则启用调度器、空 Vault 保持禁用。显式
`true` 要求 `OBSIDIAN_VAULT_PATH`。`persona_snapshot_runs` 为每个本地计划日
持久化一个幂等状态机，恢复被中断的尝试，以同样的 15 分钟到 6 小时受限退避
重试最旧未完成日期，且只存状态、日期、尝试计数、受限错误码与成功审计 Event
id。调度器在优雅关闭期间受追踪。手动 Snapshot 导出相互独立，不满足或修改
计划行。

对话执行状态在重启后存活。输入 Event 创建与 job 创建同事务提交。Companion
回复 Event 创建与 job 的 `succeeded` 转换也同事务提交。启动时把 pending/
running job 标记为 `interrupted` 失败；Web 幂等重放或受审计的重试 API 可
开启新尝试。Job 行只暴露受限状态、计数、错误码与 Event id。它们绝不持久化
Prompt、回复、厂商输出、原始错误或浏览器幂等键。

Todo capture 使用同样的持久化 Event 边界。Web 或 Telegram `todo` Event 与其
`todos` 投影同事务提交；完成、取消与重新打开追加审计 Event 并原子更新投影。
Telegram 重投递复用源 Event 与投影。运行时启动幂等地为合法历史 `todo`
Event 恢复缺失投影，只报告聚合的恢复/跳过计数。`/api/status` 只暴露聚合
Todo 计数；Prompt 上下文只暴露受限的未完成标题与截止日期，绝不暴露 Todo id
或已终态条目。

Note、Idea、Journal capture 使用不可变 Event，不创建独立可变表。Web 幂等键
使用与聊天请求不同的命名空间。Event 插入与 pending Analysis job 创建是原子
的；无回复的 Analysis 尝试随后使用现有有序 Memory 提交与恢复机制。Capture
列表/详情 API 暴露文本与受限 job 状态，绝不暴露 raw payload、Telegram
chat/user/message 标识、厂商输出或错误。

Project capture 遵循同样的 Event/投影模式。运行时启动在 Todo 回填前回填合法
历史 Project Event，以便安全恢复关联。Project 生命周期与详情变更与其审计
Event 原子。`/api/status` 暴露聚合生命周期计数；私有 Prompt 上下文只包含
受限的活动名称、摘要与主题标签。Project 与 Todo 不在 FTS Memory 索引中。

Working State 是当前 Project、活跃主题标签、未决问题与稳定 S1 模式的单一
SQLite 投影。需要原因的 API 更新追加审计 Event 并原子更新单例。Project
完成/归档在同一 Project 事务中清除匹配的当前 Project。`/api/status` 只暴露
模式、关联存在性与聚合主题/问题计数；Prompt 上下文不包含内部 id。Working
State 在 Profile 与 FTS Memory 索引之外。

Analysis job 状态在进程重启后存活。启动时 pending 或 running 的 job 被标记
为带受限 `interrupted` 码的失败，并可通过受审计的 Application API 重试。
健康/状态暴露聚合 job 计数；诊断与 job API 都不包含 Prompt、消息、厂商响应
或原始错误。Analysis 完成日志只暴露计数，不含模型内容。

标记 `cooling_required` 的 Analysis Profile 更新被存入 `memory_proposals`，
而不是丢弃或复制进活动 Profile。运行时状态只暴露 pending 提案计数。提案
审阅是同步本地事务：接受时写入审计 Event、Profile 值与终态提案状态；拒绝时
写入审计 Event 与终态状态而不改 Profile。

记忆检索使用带 trigram tokenizer 的 SQLite FTS5。`memory_search` 是基于
Profile、Topics、Timeline 与 Daily Notes 的可重建投影。Schema 触发器同步写入，
`initializeDb()` 在每次运行时启动时重建索引，包括从 search 出现前创建的
数据库升级。数据库就绪要求虚拟表存在。Prompt 检索在索引查询失败时回退到
近期 Memory，而 `/api/memory/search` 仍是显式诊断表面。

默认 AI 门禁不得调用真实 DeepSeek 或 Telegram 服务。本地 demo 与需要确定性
离线行为的测试使用 `LLM_PROVIDER=mock`。

需要人工运行的真实网络验证时，使用
[`../07-product/real-mode-evaluation.md`](../07-product/real-mode-evaluation.md)。
它覆盖 DeepSeek 质量、Telegram 端到端行为、Workspace 真实后端检查、回滚与
证据捕获。

人工真实模式测试后，使用 `npm.cmd run cleanup:real-mode -- --tag <id>` 预览
带标签的评估数据。审查后加 `--apply`；自动清理只删除来源关联的 timeline 行，
并把 Events/Profile/Topics 报告给人工治理审查。

## Obsidian Vault 路径

Workspace 同步与 VitePress 从 `OBSIDIAN_VAULT_PATH` 读取外部 Obsidian vault。

在仓库根 `.env` 中设置：

```text
OBSIDIAN_VAULT_PATH=C:\Users\33831\OneDrive\obsidian\obsidian
```

当前回退保留本机原始路径，但新机器与 AI worker 应把 `.env` / `.env.example`
视为事实来源。vault 在仓库外，不得提交。

Persona 把生成的 Daily Notes 归档到 `PERSONA_DAILY_NOTE_DIR` 下，默认
`persona/daily-notes`。该值必须是相对目录，且不得包含 `.` 或 `..` 段。vault
与最终规范目录都必须位于仓库外、配置的 vault 内；符号链接或 junction 逃逸
被拒绝。

Persona Snapshot 使用 `PERSONA_OBSIDIAN_SNAPSHOT_DIR`（默认
`persona/snapshots`），写入确定性的 `Persona OS.md`。它与 Daily Note 导出
共享同样的规范路径检查与原子写入器。

每个归档使用确定性文件名 `YYYY-MM-DD.md` 与原子临时文件重命名。Persona 只
拥有 `<!-- PERSONA:DAILY_NOTE -->` 与 `<!-- /PERSONA:DAILY_NOTE -->` 之间的
块。Persona Snapshot 类似地只拥有 `<!-- PERSONA:SNAPSHOT -->` 到
`<!-- /PERSONA:SNAPSHOT -->`。后续导出替换匹配的唯一块，保留其周围的用户
Markdown。存在同名文件但没有恰好一个有效托管块时，视为冲突且不修改。

## 常读文档

- [deployment.md](deployment.md)
- [../00-overview/current-architecture.md](../00-overview/current-architecture.md)
- [../00-overview/deployment-and-client-architecture.md](../00-overview/deployment-and-client-architecture.md)
- [../06-governance/debug-playbook.md](../06-governance/debug-playbook.md)

## 相关代码位置

- `apps/persona/src/infra/db/pool.ts`
- `apps/persona/src/infra/db/schema.sql`
- `apps/persona/src/infra/config/index.ts`
- `apps/persona/src/infra/llm/deepseek.ts`
- `apps/persona/src/interface/telegram/bot.ts`
- `apps/workspace/scripts/sync-projects.js`
- `apps/workspace/scripts/watch.js`
- `apps/workspace/.vitepress/config.ts`
- `docs/05-infra/deployment.md`

## AI 修改前检查项

- 当前后端存储是 SQLite，不是 PostgreSQL。
- `OPENAI_API_KEY` 当前用于 DeepSeek API 调用。
- `npm.cmd run check:infra` 必须保持无网络；它只校验配置形状与真实模式 preflight 行为。
- `npm.cmd run diagnose:runtime` 必须保持无网络，且不得打印原始密钥或私有数据。
- 真实 DeepSeek 与 Telegram 检查属于 `docs/07-product/real-mode-evaluation.md`，不属于默认 AI 门禁。
- 本地 Obsidian 路径必须通过 `OBSIDIAN_VAULT_PATH` 配置；不要向 Workspace 脚本或 VitePress 配置新增硬编码用户路径。
- 除非任务明确要求，不要新增基础设施依赖。
- LLM 厂商或模型参数变更必须与 Persona 运行时行为同步。
- 暴露给 Workspace 的健康、日志与运行时计数必须走 Application 读 API；不要让 Workspace 直接读取 `data/`、`.env`、厂商日志或数据库文件。

## 验证口径

- 配置/真实模式 preflight：`npm.cmd run check:infra`（无网络）。
- 运行时诊断：`npm.cmd run diagnose:runtime`（无网络，脱敏）。
- 数据库 schema 契约：`npm.cmd run contract:db-schema`。
- 默认本地门禁：`npm.cmd run verify:local`。