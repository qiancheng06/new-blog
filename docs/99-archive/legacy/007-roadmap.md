<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 007 — 路线图（Roadmap）

> 状态：方案就绪
> 目标：定义 Persona OS 的分阶段目标和验收标准

---

## 总览

```
Phase 0                  Phase 1                   Phase 2
─────────                ─────────                 ─────────
观测流跑通                记忆流跑通                 认知流建立

2026 Q3                  Q4                        2027 Q1
```

**原则**：每个 Phase 必须连续稳定运行 30 天，才能进入下一 Phase。

---

## Phase 0：观测流（当前）

### 目标

跑通最小闭环，让系统可观测、可调试。

### 验收标准

1. Telegram → Event → Database 链路连续 30 天无中断
2. HTTP 仪表板可查看最近 500 条事件的状态和耗时
3. Bot 重启后数据不丢失（SQLite 文件持久化）
4. pm2 守护进程，意外退出后自动恢复

### 功能范围

| 模块 | 状态 | 说明 |
|------|------|------|
| Telegram 接收 | ✅ | 消息和快捷命令 |
| Event 入库 | ✅ | 所有输入转为 Event |
| Companion 回复 | ✅ | DeepSeek 调用 |
| SQLite 存储 | ✅ | 6 张核心表 |
| 观测流 | ⬜ | 埋点 + 仪表板 |
| pm2 进程守护 | ✅ | 自动重启 |

### 技术栈

```
Runtime:   Node.js + TypeScript + tsx
Bot:       grammy (Telegram long polling)
LLM:       DeepSeek Chat (fetch 直调)
Storage:   better-sqlite3
Process:   pm2
```

### 禁止

```
❌ Novelty（新意层）
❌ Graph（知识图谱）
❌ Insight（洞察引擎）
❌ Vector DB（向量库）
○ Docker（可选，不阻塞验收）
❌ 微服务拆分
❌ 消息队列
```

---

## Phase 1：记忆流

### 前置条件

Phase 0 已稳定运行 30 天。

### 目标

让记忆能影响回复。系统不再"每次都像第一次对话"。

### 验收标准

1. 隔天聊同一主题，Companion 能引用前文
2. Profile 累积至少 5 个有效维度
3. Timeline 可回溯过去 30 天的主要变化
4. Episodic Memory 覆盖至少 80% 的对话事件

### 功能范围

| 模块 | 说明 |
|------|------|
| Context Builder | 从 Memory 中提取相关上下文注入 Prompt |
| Topic Confidence | topics 表增加 confidence 和 interest_level |
| Episodic Memory | 新增 episodic_memories 表 |
| Delivery Layer | 判断时机/语气/信息密度，控制 Researcher/Critic 输出 |
| Memory Decay | 定时降权未提及的话题 |
| Internal Events | MemoryPatch 改为走 Event（异步写库） |

### 技术栈变化

```
新增: episodic_memories 表
扩展: topics 表（+confidence, +interest_level）
扩展: event types（Internal Events）
```

### 禁止

```
❌ Novelty
❌ Graph
❌ Insight
❌ Vector DB
○ Docker（推荐）
❌ 微服务拆分
```

---

## Phase 2：认知流

### 前置条件

Phase 1 已稳定运行 30 天，且 Profile / Timeline 有足够数据支撑分析。

### 目标

系统能主动发现模式，而不只是被动响应。

### 验收标准

1. Insight 能检测到兴趣迁移（如"对 X 的关注度下降，Y 上升"）
2. Delivery 能在合适时机推送 Insight，不打扰用户
3. 系统开始表现出"有自己的观察"，而不只是"有问必答"
4. 周报/月报自动生成，可读

### 功能范围

| 模块 | 说明 |
|------|------|
| Insight Engine | 兴趣迁移、目标偏离、重复模式检测 |
| Novelty Engine | 新意层，对抗可预测性 |
| Weekly Report | 自动生成周报，推送到 Telegram |
| Composition Root | Prompt 从代码分离到独立文件管理 |

### 技术栈变化

```
新增: novelty worker（异步）
新增: insight worker（定时）
新增: prompts/ 目录（独立 prompt 文件）
```

### 禁止

```
❌ Graph
○ Docker（必须）
❌ 微服务拆分
```

---

## Phase 3+：远期目标

以下功能在 Phase 2 稳定后逐步引入。

| 功能 | 说明 | 前置条件 |
|------|------|---------|
| Planner | 目标拆解和执行跟踪 | Profile 深度足够 |
| Knowledge Graph | 知识点关联和检索 | 数据量达到千级事件 |
| Vector DB | 语义搜索 | Knowledge Graph 之后 |
| Web / App | 多端接入 | API 层已抽象 |

---

## 当前进度

```
Phase 0:  ████████░░  80%（缺观测流）
Phase 1:  ██░░░░░░░░  20%（表有，逻辑缺）
Phase 2:  ░░░░░░░░░░   0%
Phase 3+: ░░░░░░░░░░   0%
```

---

## 与 Proposal 的对应关系

| Proposal | 所属 Phase |
|----------|-----------|
| 001 三流分离 | Phase 0-1 |
| 002 Repository 层 | Phase 0-1 |
| 003 Docker 部署 | Phase 0-3（可选→推荐→必须） |
| 004 记忆架构 | Phase 1 |
| 005 Prompt 架构 | Phase 0-2 |
| 006 Event 模型 | Phase 0-2 |
| 007 Roadmap（本文） | — |
