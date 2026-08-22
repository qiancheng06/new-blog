# API 契约与冒烟测试边界

只要测试保持在启动、健康检查和事件读取边界内，该 API 层就能在不调用真实 LLM 的情况下支持冒烟测试。

## 当前 HTTP 契约

### `GET /health`

响应 `200`:

```ts
{
  status: "ok",
  uptime: number,
  events_today: number,
  background_tasks: {
    pending: number
  },
  analysis_jobs: {
    pending: number,
    running: number,
    succeeded: number,
    failed: number
  }
}
```

`/health` 是进程存活探针。即使依赖检查失败，它也保持 `200` 并返回稳定的旧版结构；依赖的就绪状态属于 `/ready`。

### `GET /ready`

当 SQLite schema 访问和所选 LLM 配置可用时，返回 `200` 及 `status: "ready"`。当任一核心组件失败时，返回 `503` 及 `status: "not_ready"`。Telegram、Obsidian、Daily Summary 调度、失败的 Analysis 任务和待处理的后台工作仍保持可见，但不会阻塞就绪状态。

```ts
{
  status: "ready" | "not_ready",
  components: RuntimeComponents
}
```

### `POST /api/chat`

请求:

```ts
{
  text: string,
  page?: string,
  requestId?: string
}
```

`requestId` 是一个不透明的 1-128 字符幂等键（idempotency key），使用字母、数字、`.`、`_`、`:` 或 `-`。浏览器也可以改走 `Idempotency-Key` 请求头发送相同的值。两者同时出现时必须一致。

成功响应 `200`:

```ts
{
  reply: string,
  eventId: string,
  replyEventId: string,
  duplicate: boolean,
  conversationJobId: string,
  conversationJobStatus: "succeeded"
}
```

`eventId` 标识不可变的用户输入 Event。`replyEventId` 标识关联的 `system/companion_reply` 输出 Event，其 `in_reply_to` 指回输入 Event。

首个被接受的请求在一个事务中持久化输入 Event 和 Conversation 任务。使用相同键的并发请求共享一次 Companion 调用。已完成的回放（replay）直接返回存储的回复，不再进行模型调用或创建回复 Event。使用不同输入重用键返回 `409`。失败的响应返回有限的 `eventId` 和 `conversationJobId` 恢复标识，不暴露 provider 错误；使用相同键回放会创建一次有审计记录（audited）的重试尝试。

```ts
{ error: "idempotency key conflict" } // 409
{
  reply: string,
  error: "processing failed",
  eventId: string,
  conversationJobId: string
} // 500, retryable with the same request key or job retry API
```

### Event Feed API

`GET /api/events` 按 Event 时间倒序返回隐私安全的 Event 投影（projection）。可选查询参数为 `source=telegram|system|web`、`type`、`q`、`since`、`before`、`limit` 和 `offset`。

```ts
{
  items: Array<{
    id: string,
    source: "telegram" | "system" | "web",
    type: string,
    timestamp: string,
    createdAt: string,
    preview: string,
    purpose: string | null,
    visibility: string | null
  }>,
  events: EventFeedRecord[],
  limit: number,
  offset: number
}
```

`events` 是 `items` 的兼容别名。`GET /api/events/:id` 返回 `{ event: EventFeedRecord }`，当 Event 不存在时返回 `404`。无效的 source、type 或时间范围返回 `400`；分页会被规范化为非负 offset 和 1 到 100 之间的 limit。

Feed 永远不会返回原始 `payload` 或 `metadata`。Telegram 的 `chat_id`、`user_id` 和 `message_id` 值既不暴露也不可搜索。搜索仅限于有限的用户可读 `text`、`summary` 和 `reason` 字段。具有显式非 `user` visibility 的 Event 在 feed 中仍可分类，但其 preview 为空且内容不参与搜索。

### Conversation History API

`GET /api/conversations` 按输入时间倒序返回持久化的用户/Companion 轮次。可选查询参数为 `source=web|telegram`、`status=pending|running|succeeded|failed`、`q`、`since`、`before`、`limit` 和 `offset`。

```ts
{
  items: Array<{
    id: string,
    sourceEventId: string,
    replyEventId: string | null,
    source: "web" | "telegram",
    status: "pending" | "running" | "succeeded" | "failed",
    errorCode: "companion_error" | "reply_error" | "state_error" | "interrupted" | null,
    userText: string | null,
    assistantText: string | null,
    timestamp: string,
    replyTimestamp: string | null,
    createdAt: string,
    updatedAt: string
  }>,
  limit: number,
  offset: number
}
```

`GET /api/conversations/:id` 按 Conversation 任务 id 返回 `{ conversation }`，否则返回 `404`。无效的 source、status 或时间范围返回 `400`；分页被规范化为非负 offset 和 1 到 100 之间的 limit。每个返回的文本字段限制为 16,000 个字符。

该读模型将 Conversation 任务连接到其不可变的输入/回复 Event，但永远不会返回原始 payload 或 metadata。Telegram 标识符、Web 页面上下文、评估标签和重试元数据既不暴露也不可搜索。格式错误或显式非 `user` 的 Event 内容以 `null` 返回，且不参与搜索。失败的轮次通过有限的状态和错误码保持可见，以便 UI 无需 provider 细节即可解释缺失的回复。

### `POST /api/daily-summaries`

生成或刷新一份 Daily Note。日期在 `PERSONA_TIME_ZONE` 中解释；省略时默认为该时区的当前日期。

```ts
{ date?: "YYYY-MM-DD" }
```

成功响应 `200`:

```ts
{
  note: {
    id: string,
    date: string,
    summary: string,
    highlights: string[],
    topicDistribution: Record<string, number>,
    sourceEventId: string,
    archivePath: string | null,
    archiveEventId: string | null,
    archivedAt: string | null,
    finalizedAt: string | null,
    createdAt: string,
    updatedAt: string
  },
  summaryEventId: string,
  eventCount: number
}
```

生成只读取该本地日期内受限的用户/Companion 事件窗口。它以原子方式追加一个 `system/summary_ready` Event，并对唯一的 Daily Note 执行 upsert。刷新日期会保留 Note id 并追加一条新的审计 Event。手动生成时 `finalizedAt` 为空。运行时调度器会在其配置的关闭时间之后将上一本地日期定稿（finalize）。

### `GET /api/daily-summaries`

按日期倒序返回 `{ items: DailyNote[] }`。可选查询参数为 `limit` 和 `offset`。

### `GET /api/daily-summaries/:date`

对精确的 `YYYY-MM-DD` 日期返回 `{ note: DailyNote }`，当没有 Daily Note 存在时返回 `404`。

### `POST /api/daily-summaries/:date/archive`

将现有的 Daily Note 归档到配置的 Obsidian vault。发送一个空的 JSON 对象并带上 `Content-Type: application/json`:

```ts
{}
```

成功响应 `200`:

```ts
{
  note: DailyNote,
  archiveEventId: string,
  relativePath: string,
  status: "created" | "updated" | "unchanged"
}
```

该操作只写入 Persona 管理的 Markdown 块，保留该块之外的内容，追加一个 `system/daily_note_exported` 审计 Event，然后在 Daily Note 投影上记录相对路径和审计 Event id。同名但没有唯一受管块的文件返回 `409`，且永远不会被覆盖。缺失、不可访问或不安全的 vault 返回 `503`。

### `POST /api/archives/obsidian/snapshot`

将当前受管（governed）的 Persona 投影导出到 `<PERSONA_OBSIDIAN_SNAPSHOT_DIR>/Persona OS.md`。发送一个空的 JSON 对象并带上 `Content-Type: application/json`。

```ts
{
  snapshotEventId: string,
  relativePath: string,
  status: "created" | "updated" | "unchanged",
  exportedAt: string,
  dataUpdatedThrough: string | null,
  counts: {
    profile: number,
    topics: number,
    timeline: number,
    projects: number
  },
  truncated: {
    profile: boolean,
    topics: boolean,
    timeline: boolean,
    projects: boolean
  }
}
```

确定性的受管块包含活跃的 Profile/Topic 行、Timeline 和 Projects，每个类别最多 500 条记录。被抑制/归档的 Memory 和 Memory 提案保持排除。成功的请求追加一个 `system/persona_snapshot_exported` 审计 Event，其中只包含路径、状态、计数和截断标志。该 Event 永远不会重复 Memory 文本。

受管块之外的用户 Markdown 会被保留。投影数据相同时返回 `unchanged`；同名文件但没有任何有效受管块时返回 `409`。缺失、不可访问或不安全的 Vault 配置返回 `503`，且不产生审计 Event。

错误响应:

```ts
{ error: "invalid json" }      // 400
{ error: "json object required" } // 400
{ error: "text is required" }  // 400
{ error: "request body too large" } // 413
{ error: "content-type must be application/json" } // 415
{
  reply: string,
  error: "processing failed"
}                              // 500
```

### `GET /api/status`

响应 `200`:

```ts
{
  status: "ok" | "degraded" | "not_ready",
  ready: boolean,
  components: RuntimeComponents,
  uptime: number,
  events_today: number,
  background_tasks: {
    pending: number
  },
  analysis_jobs: {
    pending: number,
    running: number,
    succeeded: number,
    failed: number
  },
  conversation_jobs: {
    pending: number,
    running: number,
    succeeded: number,
    failed: number
  },
  memory: {
    topics: number,
    profile: number,
    timelineEvents: number,
    pendingProposals: number
  },
  todos: {
    open: number,
    done: number,
    cancelled: number,
    overdue: number,
    dueToday: number
  },
  projects: {
    active: number,
    paused: number,
    done: number,
    archived: number
  },
  captures: {
    notes: number,
    ideas: number,
    journals: number
  },
  working_state: {
    mode: "S1",
    hasCurrentProject: boolean,
    activeTopicCount: number,
    currentQuestionCount: number
  },
  recent_events: Array<{
    id: string,
    source: string,
    type: string,
    timestamp: string,
    preview: string
  }>
}
```

`RuntimeComponents` 只包含有限的状态和计数：数据库、LLM provider/mode、Telegram 生命周期、Obsidian 可用性、Daily Summary 调度器状态、Persona Snapshot 调度器状态、Conversation/Analysis 任务计数，以及待处理的后台任务数。两个调度器组件只暴露状态、目标/完成日期、下次运行时间、失败次数和累计的持久化运行计数。它们从不包含配置的路径、令牌、提示词、消息内容、provider 输出或原始错误。可选组件失败会将整体状态改为 `degraded`，而不会改变 `ready`。

### Capture API

Capture 是不可变的 `note`、`idea` 或 `journal` Event。它没有可编辑的投影，也从不产生 Companion 回复。

`POST /api/captures` 接受 Web 输入:

```ts
// request
{
  type: "note" | "idea" | "journal",
  text: string,
  requestId?: string
}

// response 202 for a new Capture; 200 for an idempotent replay
{
  duplicate: boolean,
  capture: {
    id: string,
    source: "web" | "telegram",
    type: "note" | "idea" | "journal",
    text: string,
    timestamp: string,
    createdAt: string,
    analysis: {
      jobId: string,
      status: "pending" | "running" | "succeeded" | "failed",
      errorCode: string | null
    }
  }
}
```

`Idempotency-Key` 可以替代 `requestId`；两者同时提供时必须一致。使用已更改类型或文本的键返回 `409`。源 Event 和待处理的 Analysis 任务以原子方式提交。Analysis 在没有 Conversation 任务或 `companion_reply` 的情况下运行，成功的 Memory 写入保留 Capture Event 作为溯源（provenance）。失败的任务使用现有的 Analysis 重试 API。

`GET /api/captures` 返回 `{ items, limit, offset }`。可选查询参数为 `type=note|idea|journal|all`、`source=web|telegram|all`、`q`、`limit` 和 `offset`。`GET /api/captures/:id` 返回单个 Capture 或 `404`。这些读模型从不暴露原始 Event payload、Telegram chat/user/message 标识符、提示词或 provider 输出。

Telegram 的 `/n`/`/note`、`/i`/`/idea` 和 `/j`/`/journal` 复用这条无回复的 Analysis 路径。Todo 和 Project 命令不这么做。

### Working State API

`GET /api/working-state` 返回持久化的单例（singleton）:

```ts
{
  workingState: {
    id: "primary",
    current_project_id: string | null,
    active_topics: string[],
    current_questions: string[],
    mode: "S1",
    state_event_id: string | null,
    state_reason: string,
    updated_at: string
  }
}
```

`POST /api/working-state` 应用部分更新，且必须提供 reason:

```ts
// request; at least one state field is required
{
  currentProjectId?: string | null,
  activeTopics?: string[],
  currentQuestions?: string[],
  mode?: "S1",
  reason: string
}

// response 200
{ eventId: string, workingState: WorkingState }
```

所选 Project 必须处于 active 或 paused 状态。Project 不存在返回 `404`；终态（terminal）Project 和未变化的值返回 `409`。S2/S3/S4 被有意禁用，返回 `400`。被接受的变更追加 `working_state_updated` 并以原子方式更新单例。

Working State 以 Project 名称、主题标签、问题和 S1 模式进入受限的私有 Companion 和 Analysis 上下文，绝不包含内部 id。它保持在 Profile、长期 Memory 和 `memory_search` 之外。

### Project 生命周期 API

Project 是用户管理的 Workspace 实体，在 Persona 内部由一个不可变的创建 Event 加上一个可变的运行时投影表示。它是工作上下文，不是自动推断的 Memory 记录。

`POST /api/projects` 创建一个活跃 Project:

```ts
// request
{ name: string, summary?: string, topics?: string[] }

// response 201
{ eventId: string, project: Project }
```

`GET /api/projects` 返回 `{ items, limit, offset }`，接受 `status`、`topic`、`limit` 和 `offset`。`GET /api/projects/:id` 返回单个 Project。名称不区分大小写地唯一。

`POST /api/projects/:id/details` 更改名称、摘要或主题，并要求人工填写 reason。`POST /api/projects/:id/state` 接受 `active`、`paused`、`done` 或 `archived` 以及 reason。完成或归档带有未完成关联 Todo 的 Project 返回 `409`；done/archived Project 只能回到 `active`。被接受的变更在与投影更新相同的事务中追加 `project_details_updated`、`project_paused`、`project_completed`、`project_archived` 或 `project_reactivated` Event。

完成或归档当前的 Working State Project，还会在同一事务中追加 `working_state_project_cleared` 并清除 `current_project_id`。此时响应中包含 `workingStateEventId`；无关的 Project 转换则省略它。

Telegram 的 `/p` 和 `/project` 通过相同的幂等 Event 边界创建 Project。运行时启动在恢复 Todo 投影之前，从有效的历史 Project Event 中恢复缺失的投影。只有活跃 Project 的名称、摘要和主题标签进入受限的私有 Prompt 上下文；id 和非活跃 Project 被排除。

### Todo 生命周期 API

Todo 是用户管理的 Workspace 实体，不是 Memory 投影。创建由一个不可变的 `todo` Event 和一行可变的 `todos` 表示。两次写入（包括从 Telegram 收到的 Todo 命令）在一个事务中提交。

`POST /api/todos` 创建一个 Todo:

```ts
// request
{ title: string, dueDate?: "YYYY-MM-DD" | null, projectId?: string | null }

// response 201
{ eventId: string, todo: Todo }
```

`GET /api/todos` 返回 `{ items, limit, offset }`。可选查询参数为 `status=open|done|cancelled|all`、`projectId`、`dueBefore=YYYY-MM-DD`、`dueAfter=YYYY-MM-DD`、`limit` 和 `offset`。`GET /api/todos/:id` 返回单个 Todo 或 `404`。

`POST /api/todos/:id/state` 应用必须提供 reason 的状态转换:

```ts
// request
{ status: "open" | "done" | "cancelled", reason: string }

// response 200
{ eventId: string, todo: Todo }
```

允许的转换为 `open -> done|cancelled` 和 `done|cancelled -> open`。重复当前状态或请求另一个终态返回 `409`。每个被接受的转换都会在更新投影之前，于同一事务中追加 `todo_completed`、`todo_cancelled` 或 `todo_reopened` 之一。

`POST /api/todos/:id/project` 用 `{ projectId: string | null, reason: string }` 分配或取消分配 Todo。开放的 Todo 只能属于 active 或 paused Project。在 done/archived Project 中重新打开 Todo，或在那里创建新的开放 Todo，都会返回 `409`。关联的 Todo Prompt 上下文使用 Project 名称，绝不使用其内部 id。

Telegram 的 `/t` 和 `/todo` 命令使用相同的投影路径，并在重新投递时保持幂等。有效的 `@YYYY-MM-DD` 后缀标记成为截止日期，例如 `/todo submit report @2026-08-01`；无效的日期后缀保留在标题中。

只有开放的 Todo 进入私有 Companion 和 Analysis 上下文。受限上下文包含标题和可选的截止日期，绝不包含内部 id。已完成和已取消的 Todo 被排除。这种上下文使用不会使 Todo 成为长期 Memory 或其搜索索引的一部分。

### `GET /api/conversation-jobs`

返回隐私安全的 Companion 执行状态。可选查询参数为 `status`、`limit` 和 `offset`；status 为 `pending`、`running`、`succeeded` 或 `failed`。

```ts
{
  items: Array<{
    id: string,
    sourceEventId: string,
    status: "pending" | "running" | "succeeded" | "failed",
    attemptCount: number,
    errorCode: "companion_error" | "reply_error" | "state_error" | "interrupted" | null,
    replyEventId: string | null,
    retryEventId: string | null,
    createdAt: string,
    startedAt: string | null,
    finishedAt: string | null,
    updatedAt: string
  }>,
  limit: number,
  offset: number
}
```

### `POST /api/conversation-jobs/:id/retry`

同步重试一个失败的任务，并在新尝试之前追加一个 `conversation_retry_requested` 审计 Event。以 JSON 形式发送 `{}`。成功时返回任务、重试 Event id、存储的回复、输入 Event id 和回复 Event id。任务不存在返回 `404`；非失败任务返回 `409`。

Conversation 任务从不存储提示词、回复文本、provider 输出或原始错误。回复文本保留在受管的 `companion_reply` Event 中。启动时会将中断的 pending/running 任务标记为失败，并带有受限的 `interrupted` 代码，以便可以显式恢复。

## 自动 Daily Summary

完整的 Persona 运行时会在 `PERSONA_DAILY_SUMMARY_TIME`（默认 `00:05`）自动关闭上一个本地日期，前提是 `PERSONA_DAILY_SUMMARY_ENABLED` 为 true。它生成并定稿笔记，然后在配置了 Obsidian vault 时将其归档。已定稿的笔记不会再次生成。如果生成成功但归档失败，重试会从归档步骤恢复，不再进行模型调用。运行状态按本地日期持久化；启动时恢复中断的尝试，并优先处理最早的未完成日期。失败使用有界的指数退避（exponential backoff），优雅关闭会取消未来的定时器，同时排空（drain）当前任务。未完成的运行会在重启后采用当前的 Obsidian 归档设置，因此禁用可选集成可以解除之前的归档失败。

### `GET /api/analysis-jobs`

返回隐私安全的 Analysis 执行状态，不包含源文本或 provider 输出。可选查询参数为 `status`、`limit` 和 `offset`；status 为 `pending`、`running`、`succeeded` 或 `failed` 之一。

```ts
{
  items: Array<{
    id: string,
    sourceEventId: string,
    status: "pending" | "running" | "succeeded" | "failed",
    attemptCount: number,
    errorCode: "analysis_error" | "memory_error" | "interrupted" | null,
    retryEventId: string | null,
    createdAt: string,
    startedAt: string | null,
    finishedAt: string | null,
    updatedAt: string
  }>,
  limit: number,
  offset: number
}
```

### `POST /api/analysis-jobs/:id/retry`

重试一个失败的 Analysis 任务。以 JSON 形式发送 `{}`。响应为 `202`，包含 `{ job, retryEventId }`；模型调用和 Memory 提交保持异步。请求首先追加一个 `analysis_retry_requested` 审计 Event。任务不存在返回 `404`，而 pending、running 或 succeeded 任务返回 `409`。

成功的 Memory 投影写入和任务的 `succeeded` 转换以原子方式提交。重试永远不会重新应用已成功的任务，且较旧的源 Event 不能覆盖溯源 Event 更新的 Profile 状态。

### `GET /api/memory`

面向可信 Workspace/调试面板的只读 Memory 概览。查询参数:

```ts
{
  topicLimit?: number,
  profileLimit?: number,
  timelineLimit?: number
}
```

响应 `200`:

```ts
{
  stats: {
    topics: number,
    profile: number,
    timelineEvents: number,
    pendingProposals: number
  },
  topics: TopicRow[],
  profile: ProfileRow[],
  timelineEvents: TimelineEventRow[]
}
```

### `GET /api/memory/topics`

查询参数:

```ts
{
  limit?: number,
  offset?: number,
  name?: string,
  state?: "active" | "archived" | "suppressed" | "all"
}
```

响应 `200`:

```ts
{
  items: TopicRow[],
  limit: number,
  offset: number
}
```

### `GET /api/memory/profile`

查询参数:

```ts
{
  limit?: number,
  offset?: number,
  key?: string,
  state?: "active" | "archived" | "suppressed" | "all"
}
```

响应 `200`:

```ts
{
  items: ProfileRow[],
  limit: number,
  offset: number
}
```

`ProfileRow.value` 作为存储的 JSON 字符串返回。解析和编辑是未来 UI/view-model 的关注点。

### `GET /api/memory/timeline`

查询参数:

```ts
{
  limit?: number,
  offset?: number,
  type?: "insight" | "shift" | "milestone",
  date?: string,
  sourceEventId?: string
}
```

响应 `200`:

```ts
{
  items: TimelineEventRow[],
  limit: number,
  offset: number
}
```

### `GET /api/memory/sources`

响应 `200`:

```ts
{
  profileWithSource: number,
  profileMissingSource: number,
  timelineWithSource: number,
  timelineMissingSource: number
}
```

### `GET /api/memory/search`

使用精确子串和 FTS5/trigram 检索搜索受管的 Memory 投影。查询参数:

```ts
{
  q: string,       // required, 1-500 characters
  limit?: number   // default 10, maximum 50
}
```

响应 `200`:

```ts
{
  items: Array<{
    entityType: "profile" | "topic" | "timeline" | "daily_note",
    entityId: string,
    title: string,
    text: string,
    sourceEventId: string | null,
    date: string | null
  }>,
  limit: number
}
```

只返回活跃的 Profile/Topic 行。待处理/已拒绝的提案不建立索引。缺失或过长的查询返回 `400`。

### `GET /api/memory/proposals`

列出冷却中的 Profile 候选，而不将其提升到 AI 上下文。

```ts
{
  status?: "pending" | "accepted" | "rejected",
  sourceEventId?: string,
  limit?: number,
  offset?: number
}
```

响应 `200`:

```ts
{
  items: MemoryProposalRow[],
  limit: number,
  offset: number
}
```

### `POST /api/memory/proposals/:id/review`

接受或拒绝一个待处理提案，恰好一次。

```ts
{
  decision: "accept" | "reject",
  reason: string
}
```

成功响应 `200`:

```ts
{
  eventId: string,
  proposal: MemoryProposalRow,
  profile: ProfileRow | null
}
```

接受时返回写入的 Profile 行；拒绝时返回 `profile: null`。审查 Event、提案转换和可选的 Profile upsert 在一个事务中提交。无效输入返回 `400`，未知提案返回 `404`，提案已被审查后返回 `409`。

### `POST /api/memory/profile/corrections`

受管的 Profile 修正。它在更新 Profile 之前记录一个 Event。

请求:

```ts
{
  key: string,
  value: unknown,
  reason?: string
}
```

成功响应 `200`:

```ts
{
  eventId: string,
  profile: ProfileRow
}
```

错误响应:

```ts
{ error: "invalid json" }      // 400
{ error: "key is required" }   // 400
```

结果 Event 具有 `type = "memory_profile_correction"` 和 `metadata.purpose = "memory_governance"`。返回的 Profile 行必须满足 `source_event_id === eventId`。

### `POST /api/memory/profile/state`

受管的 Profile 投影状态转换。这会隐藏、归档或恢复 Profile 行，而不删除源 Event。

请求:

```ts
{
  id: string,
  state: "active" | "archived" | "suppressed",
  reason: string
}
```

成功响应 `200`:

```ts
{
  eventId: string,
  profile: ProfileRow
}
```

错误:

```ts
{ error: "invalid json" }      // 400
{ error: "id is required" }    // 400
{ error: "state is invalid" }  // 400
{ error: "reason is required" }// 400
{ error: "profile not found" } // 404
```

### `POST /api/memory/topics/state`

受管的 Topic 投影状态转换。这会隐藏、归档或恢复 Topic 投影行，而不删除源 Event。

请求和响应与 `POST /api/memory/profile/state` 一致，但成功响应体返回 `topic`。

### 共享行为

- API 绑定到 `127.0.0.1`，除非显式配置了 `API_HOST`。
- `OPTIONS` 只对已配置的 `PERSONA_ALLOWED_ORIGINS` 返回 `204`，对未知浏览器来源返回 `403`。
- 受信任浏览器的预检允许 `Content-Type` 和 `Idempotency-Key`。
- 未知路由返回 `404 { error: "not found" }`。
- POST 请求体必须是 JSON 对象，带 `Content-Type: application/json`，且不得超过 64 KiB。
- Telegram 重新投递仅确认（acknowledge-only），从不发送第二次回复；Web 回放恢复仅在存在幂等键时启用。
- Daily Note 归档写入被限制在配置的外部 Obsidian vault 中，拒绝未管理的同名文件而不是覆盖它们。
- Memory 列表限制由 Application 层规范化，上限为 100。
- Memory GET API 是只读的，不得变更 Events、Profile、Topics、Timeline 行或提案。
- `POST /api/memory/profile/corrections` 和提案审查是受管的 Application 写入路径，必须追加 Event。
- `POST /api/memory/profile/state` 和 `POST /api/memory/topics/state` 是受管的投影状态写入路径。它们在更改行状态之前追加治理 Event。Event 和投影更改以原子方式提交。
- 待处理或已拒绝的提案绝不进入 Profile 或 Companion 上下文。
- 搜索只能通过 Application/Memory API 读取派生索引。直接的 FTS 访问不是受支持的接口。

## 安全路径

- 从 `apps/persona/src/interface/api/server.ts` 导入 `createApiServer`、`startApiServer` 和 `stopApiServer`。
- 通过 `startApiServer({ port: 0 })` 绑定到端口 `0` 或测试专用端口。
- 调用 `GET /health` 验证进程存活。
- 调用 `GET /ready` 验证核心数据库和 LLM 配置就绪。
- 调用 `GET /api/events` 验证读侧路由。
- 用 `stopApiServer(server)` 或 `server.close()` 关闭返回的服务器。

## 主运行时边界

`apps/persona/src/main/index.ts` 在正常应用使用中默认仍然自动启动。只想导入主模块的冒烟测试可以设置:

```bash
PERSONA_MAIN_AUTOSTART=0
```

需要真实启动路径的测试可以调用 `startPersonaRuntime({ api: { port: 0 }, telegram: false })`，然后调用 `runtime.stop()`。

对于正常的本地 Workspace 使用，Companion 聊天面板期望 Application API 位于 `http://127.0.0.1:3001`，用 `GET /health` 检查状态，用 `POST /api/chat` 发送聊天消息。

## LLM 边界

`POST /api/chat` 调用对话流程。使用默认 LLM provider 时，这可能触及真实的 DeepSeek API。无真实 LLM 的冒烟测试可以选择以下方案之一:

- 不调用 `POST /api/chat`；只测试 `/health` 和 `/api/events`。
- 在调用 `/api/chat` 之前设置 `LLM_PROVIDER=mock`。

不要依赖缺失的 API 密钥来阻止真实的网络调用。显式的 mock provider 是更安全的测试契约。

## 当前命令

从仓库根目录运行完整的无真实 LLM HTTP 冒烟测试:

```bash
npm.cmd run smoke:api
```

该命令在 `127.0.0.1:3101` 启动 API，向 `/api/chat` 发帖，验证 mock 回复，等待异步 Memory patch，删除其冒烟测试行，然后关闭服务器。

运行更严格的 HTTP 契约测试:

```bash
npm.cmd run contract:api
```

契约测试在 `127.0.0.1:3103` 启动 API，验证 `/health`、`/ready`、`/api/chat` 的成功/错误路径、隐私安全的 Event Feed 列表/详情、过滤、搜索和分页、持久化 Conversation History 列表/详情、失败状态和隐私边界、不可用与成功的受管 Obsidian Snapshot 行为、`/api/status`、只读的 `/api/memory*` 路由、Capture 读写、Working State 和 Project/Todo 生命周期路由、`OPTIONS` 和 `404`，然后删除其冒烟测试行并关闭服务器。

运行聚焦的 Todo 生命周期、Telegram 投影、prompt 边界和事务回滚契约:

```bash
npm.cmd run contract:todos
```

运行聚焦的 Project 生命周期、Todo 关系、Telegram 投影、Prompt 边界、迁移和回滚契约:

```bash
npm.cmd run contract:projects
```

运行聚焦的持久化 Working State、Prompt 边界、Project 终态关联和回滚契约:

```bash
npm.cmd run contract:working-state
```

运行聚焦的不可变 Capture、Telegram/Web 幂等、无回复 Analysis、Memory 溯源、安全读模型和回滚契约:

```bash
npm.cmd run contract:captures
```
