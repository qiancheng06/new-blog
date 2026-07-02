<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 记忆系统（Memory Architecture）

> 状态：规划中
> 覆盖：目标架构（Architecture）+ 演进路线（Roadmap）+ 工程规格（Specification）

---

# 第一部分：目标架构

## 五层模型

```
L0 Raw Conversation    原始记录，不可修改
L1 Episodic Memory     事件记忆（昨天发生了什么）
L2 Semantic Memory     语义记忆（兴趣/信念/规律）
L3 Profile Memory      人格画像（稳定特征）
L4 Timeline Memory     成长轨迹（如何变成现在这样）
```

输出流向：

```
                     User
                       │
                       ▼
                Conversation
                       │
                       ▼
                 L0 Raw Events
                       │
                       ▼
             ┌─────────────────┐
             │ L1 Episodic     │
             └─────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
     ┌──────────────┐   ┌──────────────────┐
     │ L2 Semantic  │   │ L4 Timeline      │
     └──────────────┘   └──────────────────┘
            │                     │
            └──────────┬──────────┘
                       ▼
             ┌─────────────────┐
             │ L3 Profile      │
             └─────────────────┘
                       │
                       ▼
                Context Builder
                       │
                       ▼
                     LLM
```

## 各层定义

### L0 Raw Events

当前 `events` 表。系统唯一事实源。

**规则**：
- 永远不参与人格推断
- 永远不直接进入 Profile
- 仅用于审计和回溯
- 原始事件不可修改（架构不变原则第 5 条）

**状态**：✅ 已有

---

### L1 Episodic Memory

事件记忆。回答"昨天发生了什么"。

```
event_id, title: "Persona OS 架构讨论",
date: "2026-06-09",
summary: "开始设计认知架构与记忆系统",
source_event_id: "evt_xxx"
```

**规则**：
- 高频写入，低风险
- 可删除
- **不存"用户是什么样的人"**，只存"用户做了什么"

**状态**：⬜ 待建

---

### L2 Semantic Memory

语义记忆。从事件中抽象出规律和倾向。

```
topic: "AI Agent",
interest_level: 0.89,
confidence: 0.82
```

或：

```
belief: "长期主义优于短期刺激",
confidence: 0.76
```

**规则**：
- 不是事件，而是规律/观点/方法论
- 需要多次观察才写入（不低于 3 次提及）
- 带置信度

**状态**：⬜ 需扩展（当前 topics 表只有名和摘要，缺 interest_level 和 confidence）

---

### L3 Profile Memory

人格画像。最值钱也是最危险的一层。

```
trait: "喜欢系统化思考",
confidence: 0.91,
last_verified: "2026-06"
```

**规则**：
- 禁止直接写入
- 写入路径：Conversation → Episodic → Semantic → Profile Candidate → Human Confirm → Profile
- 情绪状态不可写入（架构不变原则第 7 条）
- 只能渐进更新（架构不变原则第 6 条）

**状态**：✅ 表已有，⏳ 写入规则待完善

---

### L4 Timeline Memory

成长轨迹。不回答"你是谁"，回答"你是怎么变成现在这样的"。

```
date: "2026-04",
type: "interest_shift",
from: "人格分析",
to: "人格工程",
confidence: 0.82
```

**规则**：
- 低频写入，高价值
- 仅在明显的兴趣迁移/目标变化时触发
- 未来用于年度报告/人生地图/成长轨迹

**状态**：✅ 表已有，⏳ type 枚举待扩展

---

## Memory Lifecycle（记忆生命周期）

```
Observe
  ↓
Patch (建议写入)
  ↓
Verify (交叉验证)
  ↓
Promote (晋升到高层)
  ↓
Decay (降权)
  ↓
Archive (归档)
```

### 各阶段说明

| 阶段 | 说明 | 所在层 |
|------|------|--------|
| **Observe** | 从对话中提取候选记忆 | L1 Episodic |
| **Patch** | Archivist 提交记忆变更建议 | L1 → L2 候选 |
| **Verify** | 多次出现后确认（≥3 次） | L2 |
| **Promote** | 从 L2 → L3（Profile 候选） | L2 → L3 |
| **Decay** | 长时间未提及则降权 | L2 / L3 |
| **Archive** | 彻底归档，不再参与召回 | L2 / L3 |

### 示例

用户说"我喜欢某歌手"：

1. **Observe** → L1 Episodic 记录事件
2. **Patch** → Archivist 提交 `memory_patch`
3. **Verify** → 一周后再次提到，verify+1
4. **Promote** → 一个月内出现 5 次 → 进入 L2 Semantic
5. **Decay** → 连续半年没出现，confidence 降权
6. **Archive** → 最终归档

---

# 第二部分：演进路线

## Phase 0（当前）

**目标**：MVP 需要的最小记忆系统

**已有**：
- `events` 表（L0 Raw）
- `topics` 表（L2 基础版：只有 name + summary）
- `profile` 表（L3 基础版：渐进更新）
- `timeline_events` 表（L4 基础版：只有 insight/shift/milestone）

**能力**：
- 消息全部入库 ✓
- Topic 自动创建 ✓
- Profile 增量更新 ✓
- Timeline 写入 ✓

**缺的**：
- confidence 和 interest_level 未实现
- 写入规则过于简单（一次分析直接写入，无 verify）
- 没有记忆生命周期

---

## Phase 1（观测流之后）

**目标**：可置信的最小记忆系统

**改动**：

### 表扩展

- `topics` 表增加 `interest_level REAL`、`confidence REAL`、`mention_count INT`
- `timeline_events` 放开 `type` 限制（当前 CHECK 约束只允许 3 个值）
- 新增 `episodic_memories` 表

### 新增 `episodic_memories` 表

```sql
CREATE TABLE episodic_memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 简化版写入规则

```typescript
if (mention_count >= 3) {
  // 晋升为语义记忆
  updateSemanticConfidence(name, /* calculate new confidence */)
}
```

### 定时降权

```sql
UPDATE topics SET interest_level = interest_level * 0.95
WHERE last_active_at < datetime('now', '-30 days');
```

---

## Phase 2（MVP 稳定后）

**目标**：完整的记忆生命周期

**新增**：
- Profile 多层写入验证（Candidate → Confirm 机制）
- Memory Patch Queue（异步处理）
- Decay 定时任务（scheduler 服务）

**Profile 写入流程**：

```
Conversation → Episodic → Semantic → Profile Candidate
                                            ↓
                                   等待观察期（3 次）
                                            ↓
                                   Human Confirm 或 自动确认
                                            ↓
                                       Profile
```

---

## Phase 3（长期）

**目标**：高阶记忆能力

**新增**：
- Memory Graph（话题/事件/画像关联图）
- Insight Engine（趋势识别/兴趣迁移检测）
- Yearly Report（年度认知报告）

**依赖**：
- 向量库（Qdrant 或 pgvector）
- 定时任务完整版（scheduler）

---

# 第三部分：工程规格

## Phase 0 表结构（当前）

详见 `docs/03-storage/data-model.md` 和 `src/db/schema.sql`。

| 表 | 阶段 | 说明 |
|----|------|------|
| events | L0 | 原始事件，不可修改 |
| topics | L2 基础 | 名 + 摘要 + 计数 |
| profile | L3 基础 | key-value，增量更新 |
| timeline_events | L4 基础 | insight/shift/milestone |
| projects | — | 项目追踪（当前未使用） |
| daily_notes | — | 每日总结（待接入） |

## Phase 1 表扩展

### topics 增补字段

```sql
ALTER TABLE topics ADD COLUMN interest_level REAL DEFAULT 0.0;
ALTER TABLE topics ADD COLUMN confidence REAL DEFAULT 0.0;
ALTER TABLE topics ADD COLUMN mention_count INTEGER DEFAULT 0;
```

### timeline_events 放开 type

```sql
-- 移除 CHECK 约束（SQLite 需要重建表）
-- 改为应用层验证
```

### episodic_memories 建表

```sql
CREATE TABLE IF NOT EXISTS episodic_memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Repository 接口

对应 `docs/09-proposals/002-repository-layer.md` 中定义的接口：

- `TopicRepository` — 扩展 `getNeedingSummary()` → `getNeedingVerify()` + `decayAll()`
- `ProfileRepository` — 扩展候选确认机制
- `TimelineRepository` — 扩展 type 枚举
- 新增 `EpisodicRepository` — L1 读写

---

## 和现有文档的关系

| 现有文档 | 关系 |
|---------|------|
| `docs/02-architecture/memory-schema.md` | 被本文取代（五层模型更完整） |
| `docs/03-storage/data-model.md` | 保留作为物理表参考，与本文同步更新 |
| `docs/08-ai-workspace/prompt-pack.md` | Archivist 输出 `memory_patch` 对应本文 Observe 阶段 |
| `docs/01-cognition/persona.md` | Archivist 约束与本文写入规则一致 |

---

## 总结

最小记忆系统（Phase 0）已存在。下一步不是加更多表，而是：

```
1. 观测流跑通（当前优先级最高）
2. Phase 1 表扩展（confidence + interest_level + episodic）
3. 简化版生命周期（Observe → Patch → Decay）
4. 完整版生命周期（Phase 2）
```

记忆系统是地基，但**地基也需要先有稳定的管道，才能灌入好的数据**。
