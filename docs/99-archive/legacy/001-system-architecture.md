<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 001 — 系统架构（三流分离）

> 状态：方案就绪
> 目标：定义 Persona OS 的三条核心流及其关系

---

# 第一部分：总览

## 三条流

```
                    用户
                      │
                      ▼
              ┌─────────────┐
              │ Business    │   这条流回答：用户发来消息，AI 怎么回复？
              │ Flow        │   核心链路：收到消息 → 构造上下文 → LLM → 回复
              └─────────────┘
                      │
             AI 生成回复给用户
                      │

═══════════════════════════════════════

              ┌─────────────┐
              │ Memory      │   这条流回答：哪些内容值得记住？
              │ Flow        │   异步执行：提取 → 判断 → 写入 → 降权
              └─────────────┘
                      │
                 更新记忆

═══════════════════════════════════════

              ┌─────────────┐
              │ Observ-     │   这条流回答：系统刚刚发生了什么？
              │ ability     │   每个环节埋点：Trace ID + 耗时 + 状态
              │ Flow        │
              └─────────────┘
                      │
               仪表板 / 日志 / Trace
```

## 三条流的关系

| 维度 | 业务流 | 记忆流 | 观测流 |
|------|--------|--------|--------|
| 同步/异步 | 同步（用户等回复） | 异步（不阻塞用户） | 同步（埋点写入 <1ms） |
| 对用户可见 | 是（回复内容） | 否（后台执行） | 否（仅仪表板可见） |
| 失败影响 | 用户收不到回复 | 记忆暂时不更新 | 仪表板缺一行 |
| 数据来源 | 用户输入 | 业务流产出的对话 | 业务流 + 记忆流各阶段 |

## 三种埋点

每条流独立埋点，但共享相同结构：

```typescript
{
  traceId: string,       // 贯穿三流，等于 event_id
  stage: string,         // 当前阶段标识
  status: "ok" | "error" | "timeout",
  durationMs: number,    // 耗时
  detail?: string,       // 附加信息（错误消息 / 内容摘要）
}
```

---

# 第二部分：业务流（Business Flow）

回答：**用户发来一条消息，AI 怎么回复？**

## 完整步骤

```
TG / App
    │
    ▼
Step 1: Gateway（统一入口）
    │  接收消息，识别来源
    │
    ▼
Step 2: Event（创建事件）
    │  写入 events 表
    │
    ▼
Step 3: Context Builder（构造上下文）
    │  查询：
    │    - History（近期对话）
    │    - Memory（Topic / Profile 等）
    │    - Working State（当前模式 / 项目）
    │  组装 → System Prompt
    │
    ▼
Step 4: LLM（调用模型）
    │  单次调用协议（persona.md）
    │  返回 JSON { companion_reply, research, critic, memory_patch }
    │
    ▼
Step 5: Response Processor（处理回复）
    │  - companion_reply → 发给用户
    │  - research / critic → 日志（不展示）
    │  - memory_patch → 投递到记忆流
    │
    ▼
Step 6: Reply（回复用户）
```

## 当前实现进度

| 步骤 | 状态 | 文件 |
|------|------|------|
| Step 1: Gateway | ✅ | `telegram/bot.ts` |
| Step 2: Event | ✅ | `event/` |
| Step 3: Context Builder | ⬜ 缺 Memory 查询 |
| Step 4: LLM | ✅ | `cognition/llm.ts` |
| Step 5: Response Processor | ⏳ 缺 Critic / memory_patch 分离 |
| Step 6: Reply | ✅ | `telegram/bot.ts` |

---

# 第三部分：记忆流（Memory Flow）

回答：**哪些内容值得记住？**

## 完整步骤

```
Conversation（业务流产出）
    │
    ▼
Step 1: Extract（提取候选）
    │  从对话中提取候选内容
    │  来源：Archivist 的 memory_patch
    │  内容：profile_updates / topic_updates / timeline_events
    │
    ▼
Step 2: Judge（判断是否值得记）
    │  规则：
    │   - 情绪内容 → 冷却标记（cooling_required）
    │   - confidence < 0.3 → 丢弃
    │   - 首次出现 → 写入 L1 Episodic
    │   - 多次出现（≥3） → 晋升 L2 Semantic
    │   - 长期稳定 → 候选 L3 Profile
    │
    ▼
Step 3: Store（写入）
    │  L1 → episodic_memories 表
    │  L2 → topics 表（更新 confidence / interest_level）
    │  L3 → profile 表（候选 / 确认）
    │  L4 → timeline_events 表
    │
    ▼
Step 4: Embedding（向量化 — Phase 2+）
    │  文本 → embedding → 存入向量库
    │
    ▼
Step 5: Index Update（更新索引 — Phase 2+）
```

## 当前实现进度

| 步骤 | 状态 | 说明 |
|------|------|------|
| Step 1: Extract | ⏳ | Archivist 在 LLM 返回中已产出 memory_patch，但未全量解析 |
| Step 2: Judge | ⬜ | 无机制 |
| Step 3: Store | ✅ | profile / topic / timeline 写入已有（直接写入，无 pipeline） |
| Step 4-5 | ⬜ | Phase 2+，MVP 不做 |

---

# 第四部分：观测流（Observability Flow）

回答：**系统刚刚发生了什么？**

## 完整步骤

```
每个环节自动埋点
    │
    ▼
Step 1: Trace（产生 Trace）
    │  位置：bot.ts / llm.ts / operators.ts
    │  内容：trace_id + stage + status + duration_ms + detail
    │
    ▼
Step 2: Store（写入）
    │  表：monitor_events
    │  字段：id, trace_id, stage, status, duration_ms, detail, created_at
    │
    ▼
Step 3: Aggregate（聚合）
    │  - 平均响应时间
    │  - 成功率
    │  - 每秒请求数
    │
    ▼
Step 4: Display（展示）
    │  HTTP 仪表板（localhost:3001）
    │  JSON API（/api/status）
    │  Obsidian 报告（可选）
    │
    ▼
Step 5: Cleanup（自动清理）
    │  定时删除超出保留条数的数据
    │  保留最近 500 条
```

## 数据模型

### monitor_events 表

```sql
CREATE TABLE IF NOT EXISTS monitor_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'timeout')),
  duration_ms INTEGER DEFAULT 0,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monitor_trace ON monitor_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_monitor_created ON monitor_events(created_at DESC);
```

> 命名说明：表名为 `monitor_events`，代码层 Repository 统一命名为 `TraceRepository`（详见 `002-repository-layer.md`）。Repository 名 ≠ 表名。

### stage 枚举

| stage | 触发位置 | 所属流 |
|-------|---------|--------|
| telegram_receive | bot.ts | 业务流 |
| event_store | bot.ts | 业务流 |
| context_build | operators.ts | 业务流 |
| companion_start | operators.ts | 业务流 |
| api_request | llm.ts | 业务流 |
| api_response | llm.ts | 业务流 |
| companion_reply | bot.ts | 业务流 |
| reply_sent | bot.ts | 业务流 |
| analysis_start | operators.ts | 记忆流 |
| analysis_done | operators.ts | 记忆流 |
| memory_write | operators.ts | 记忆流 |

### trace_id

同一条消息的所有埋点共享同一个 trace_id（即 event_id）。

追溯完整链路：

```bash
grep "evt_xxx" logs/trace.log
# [evt_xxx] telegram_receive
# [evt_xxx] event_store
# [evt_xxx] api_request
# [evt_xxx] api_response   ← 这里可以看耗时
# [evt_xxx] companion_reply
# [evt_xxx] reply_sent
```

## 新增文件

```
src/
├── monitor/
│   ├── store.ts       ← 写入 + 查询 + 清理
│   └── dashboard.ts   ← HTTP 服务 + HTML 仪表板
```

## HTTP 仪表板

端口 3001，绑定 127.0.0.1。

```
┌──────────────────────────────────────────┐
│ Persona OS Monitor              12:00:00 │
├──────────────────────────────────────────┤
│ Telegram  ✅  运行 5m23s                 │
│ API       ✅  平均 1.2s  成功率 95%      │
│ 事件      47 条                           │
├──────────────────────────────────────────┤
│ 时间    │ 耗时  │ 状态  │ 阶段       │ 内容 │
│ 12:00   │ 0.8s  │ ✅   │ TG→回复    │ 你好 │
│ 11:58   │ 1.5s  │ ✅   │ TG→回复    │ AI.. │
│ 11:55   │ 0.0s  │ ✅   │ 命令       │ /n   │
│ 11:50   │ 20.0s │ ❌   │ API超时     │ 价值观│
└──────────────────────────────────────────┘
```

自动刷新（每 5 秒）。不加载外部资源（纯内联 HTML + CSS + JS）。

### JSON API

```
GET /api/status  → 当前状态 JSON
```

```json
{
  "uptime": 323,
  "events_today": 47,
  "api_avg_ms": 1200,
  "api_success_rate": 0.95,
  "telegram_connected": true,
  "last_event_min_ago": 0.5
}
```

### 健康检查

```
GET /health  → 健康检查
```

```json
{
  "status": "ok",
  "checks": {
    "telegram": "ok",
    "database": "ok"
  }
}
```

## 自动清理

每小时执行：

```sql
DELETE FROM monitor_events WHERE id NOT IN (
  SELECT id FROM monitor_events ORDER BY created_at DESC LIMIT 500
);
```

---

# 第五部分：三流关系

## Trace ID 贯穿三流

```
业务流                    记忆流                    观测流
 │                         │                         │
 ├─ telegram_receive ──────┼─────────────────────────┼── monitor.trace()
 ├─ event_store ───────────┼─────────────────────────┼── monitor.trace()
 ├─ context_build ─────────┼─────────────────────────┼── monitor.trace()
 ├─ api_request ───────────┼─────────────────────────┼── monitor.trace()
 ├─ api_response ──────────┼─────────────────────────┼── monitor.trace()
 ├─ companion_reply ───────┼─────────────────────────┼── monitor.trace()
 │                         │                         │
 └─ memory_patch ──────────┼── extract ──────────────┼── monitor.trace()
                           ├── judge ────────────────┼── monitor.trace()
                           ├── store ────────────────┼── monitor.trace()
                           │                         │
                           └─ decay ────────────────┼── monitor.trace()
```

三条流共享同一个 trace_id（event_id），任何一条链路上的异常都可以通过 trace_id 追溯到事发时的完整上下文。

## 实施顺序

> 注意：业务流、观测流、记忆流是**能力层（Layer）**，不是开发阶段（Phase）。
> 业务流贯穿所有阶段持续增强，观测流是 Phase 0 重点，记忆流是 Phase 1 重点。
> 阶段规划以 `007-roadmap.md` 为准。

```
Layer 1 — 业务流（全阶段存在，当前完成 70%）
  ├── Gateway + Event       ✅
  ├── LLM 调用              ✅
  ├── Context Builder       ⬜ (缺 Memory 查询)
  └── Response Processor    ⏳ (缺 Critic 分离)

Layer 2 — 观测流（Phase 0 重点，当前优先级最高）
  ├── 表 + store            ⬜
  ├── 埋点                   ⬜
  ├── 仪表板                 ⬜
  └── 清理                   ⬜

Layer 3 — 记忆流（Phase 1 重点）
  ├── Extract + Judge       ⬜
  ├── L1 Episodic 表        ⬜
  ├── L2 Semantic 扩展       ⬜
  └── Decay                  ⬜
```

## 埋点方式

在每个关键节点插入一行：

```typescript
// bot.ts
monitor.trace(traceId, "telegram_receive", "ok")
monitor.trace(traceId, "reply_sent", "ok", durationMs)
monitor.trace(traceId, "reply_sent", "error", durationMs, err.message)

// llm.ts
monitor.trace(traceId, "api_request", "ok")
monitor.trace(traceId, "api_response", "ok", durationMs)
monitor.trace(traceId, "api_response", "error", durationMs, errorText)

// operators.ts
monitor.trace(traceId, "companion_start", "ok")
monitor.trace(traceId, "analysis_start", "ok")
monitor.trace(traceId, "analysis_done", "ok", durationMs)
```

---

# 第六部分：当前进度总结

| 流 | 组件 | 状态 | 所属 Phase |
|---|------|------|--------|
| 业务流 | Gateway (Telegram) | ✅ | Phase 0 |
| 业务流 | Event 入库 | ✅ | Phase 0 |
| 业务流 | LLM 调用 | ✅ | Phase 0 |
| 业务流 | Context Builder | ⬜ | Phase 1 |
| 业务流 | Response Processor | ⏳ | Phase 0 |
| 记忆流 | Extract | ⬜ | Phase 1 |
| 记忆流 | Judge | ⬜ | Phase 1 |
| 记忆流 | Store | ✅ | Phase 0 |
| 记忆流 | Decay | ⬜ | Phase 1 |
| 观测流 | 埋点 | ⬜ | **Phase 0** |
| 观测流 | 仪表板 | ⬜ | **Phase 0** |
| 观测流 | 清理 | ⬜ | **Phase 0** |
