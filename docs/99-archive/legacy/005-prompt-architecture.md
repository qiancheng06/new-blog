<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 005 — Prompt 架构（Prompt Architecture）

> 状态：方案就绪
> 目标：定义 Persona OS 的六层 Prompt 体系及其关系

---

## 六层总览

```
                    ┌──────────────────┐
                    │  1. Foundation   │   定义底层公理，所有层继承
                    │  Prompt          │   几乎不改
                    └──────────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │  2. Orchestrator │   决定当前模式（S1-S4）
                    │  Prompt          │   调度上下文/认知回路
                    └──────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ 3. Companion │ │ 4. Researcher│ │ 5. Critic    │
    │  唯一面向    │ │  分析/抽象   │ │  反例/盲区   │
    │  用户的出口  │ │  不直接输出  │ │  不直接输出  │
    └──────────────┘ └──────────────┘ └──────────────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │  6. Archivist    │   生成记忆更新建议
                    │  Prompt          │   不直接修改数据库
                    └──────────────────┘
```

---

## 1. Foundation Prompt

**定位**：最高层。定义整个系统的底层公理。所有模块继承。

**约束**：这是唯一不应该频繁修改的 Prompt。

**内容**：

```
你是一个个人认知操作系统（Persona OS）的认知核心。

底层公理（不可违反）：
- Reality > Model：模型服务于现实，不是反过来
- 长期价值优先：短期便利不优先于长期一致性
- 不制造依赖：不暗示自己是唯一理解用户的人
- 不成为回声室：允许观点不同，提供反视角
- 允许不确定性：不确定时表达不确定，不假装确定
- Companion First：用户看到的回复默认经过 Companion 层

这些公理对所有下游 Prompt 生效。
```

**当前状态**：⬜ 不存在

---

## 2. Orchestrator Prompt

**定位**：决定当前请求属于什么模式，调度哪些认知回路。不负责回复用户。

**输出**：

```
{
  "mode": "S1" | "S2" | "S3" | "S4",
  "needs": {
    "context": ["history", "memory", "profile"],
    "operators": ["companion", "researcher", "critic", "archivist"],
    "intensity": "low" | "medium" | "high"
  }
}
```

**模式定义**：

| 模式 | Companion 权重 | 其他权重 | 触发场景 |
|------|---------------|---------|---------|
| S1 陪伴 | 95% | 5% 轻提醒 | 默认日常 |
| S2 共创 | 70% | 30% Researcher | 深聊/问题讨论 |
| S3 校正 | 50% | 50% Critic | 重大决策/高风险 |
| S4 深度 | — | 长期建模 | 后台分析/时间线 |

**当前状态**：⬜ 不存在。当前 `COMPANION_PROMPT` 是硬编码 S1 模式。

---

## 3. Companion Prompt

**定位**：唯一面向用户的出口。负责理解、共情、对话节奏、幽默感、亲近感、陪伴感。

**原则**：
- 先接住，再结构化
- 默认柔性反馈
- 保持人格一致性
- Researcher 和 Critic 的结论必须经过 Companion 转译后才能输出

**内容来源**：`docs/04-product/companion-style-guide.md`

**当前状态**：✅ 已实现为 `COMPANION_PROMPT`（`src/cognition/prompt.ts`）

**与目标差距**：
- 当前 Companion 独立运行，没有 Orchestrator 调度
- 没有接收 Researcher/Critic 转译的接口
- 尚未对接 Companion Style Guide 全文

---

## 4. Researcher Prompt

**定位**：分析问题、抽象问题、发现模式、建立结构。

**输出**：

```json
{
  "research_notes": {
    "core_points": ["用户核心论点"],
    "hidden_assumptions": ["暗含假设"],
    "open_questions": ["值得追问的方向"]
  }
}
```

**约束**：
- 不面向用户输出
- Researcher 的结论必须经过 Companion 转译

**当前状态**：⏳ 部分实现。当前 `ANALYSIS_PROMPT`（`src/cognition/prompt.ts`）包含了 research 的输出格式，但它是和 critic、memory_patch 混在一起的。需要独立拆出。

---

## 5. Critic Prompt

**定位**：寻找反例、发现盲区、评估证据、给出置信度。

**输出**：

```json
{
  "critic_notes": {
    "confidence": 0.0,
    "counter_examples": ["反例"],
    "evidence_gaps": ["证据缺口"]
  }
}
```

**约束**：
- 不面向用户输出
- 必须有证据支撑，不凭空质疑
- 置信度 < 0.3 时建议暂缓写入记忆

**当前状态**：⏳ 部分实现。混在 `ANALYSIS_PROMPT` 中，需独立拆出。

---

## 6. Archivist Prompt

**定位**：生成记忆更新建议。不直接修改数据库，只输出建议。

**输出**：

```json
{
  "memory_patch": {
    "profile_updates": [],
    "topic_updates": [],
    "timeline_candidates": []
  }
}
```

**约束**：
- 只提交建议，不直接落库
- 情绪化内容标注 `cooling_required: true`
- 与现有 profile 矛盾的信息标注冲突，不立即覆盖

**当前状态**：⏳ 部分实现。混在 `ANALYSIS_PROMPT` 中，需独立拆出。

---

## 7. Delivery Prompt（Phase 1）

**定位**：表达策略层。决定**说还是不说、什么时候说、怎么说、说多少**。

**触发条件**：有真实用户数据后引入。Phase 0 默认直出（Companion 直接回复）。

**职责**：
- 评估当前时机是否适合表达
- 选择语气和信息密度
- 控制推送时机（立即/延迟/累积）
- 判断信息是否经过用户认知筛选

**输入**：
```json
{
  "candidate": "Insight 或 Critic 的输出",
  "context": {
    "recent_mood": "用户近期情绪",
    "cognitive_load": "当前认知负担",
    "time_since_last": "距上次推送"
  }
}
```

**输出**：
```json
{
  "should_speak": true,
  "timing": "now" | "delay" | "accumulate",
  "tone": "gentle" | "playful" | "direct",
  "density": "low" | "medium" | "high"
}
```

**约束**：
- 不修改内容本身，只控制表达方式
- 当用户处于负面情绪时，降低 Critic 输出权重
- 同一内容不重复推送

**当前状态**：⬜ 不存在（Phase 1 目标）

---

## 8. Insight Prompt（Phase 2）

**定位**：洞察层。发现时间维度上的模式——兴趣迁移、目标偏离、重复模式。

**触发条件**：有足够连续数据后引入。Phase 0-1 不实现。

**职责**：
- 检测兴趣迁移（从 A 到 B 的关注度变化）
- 识别目标偏离（长期目标 vs 短期行为不一致）
- 发现重复模式（反复出现的同一类问题）
- 输出趋势摘要

**输出**：
```json
{
  "insights": [
    {
      "type": "interest_shift" | "goal_drift" | "pattern",
      "description": "描述",
      "evidence": ["证据1", "证据2"],
      "confidence": 0.0
    }
  ]
}
```

**约束**：
- 必须有数据支撑，不基于单次观测
- 输出必须经过 Delivery Layer 决定是否推送给用户
- 观察窗口至少 7 天

**当前状态**：⬜ 不存在（Phase 2 目标）

---

## 9. Novelty Prompt（Phase 2）

**定位**：新意层。对抗认知惯性，避免系统变得可预测。

**触发条件**：系统已积累足够历史对话，用户开始觉得"AI 我能猜到它说什么"。

**职责**：
- 提供新视角（从不同维度重新组织已知信息）
- 提出反问题（打破思维定式）
- 给出非显而易见的联想（跨领域映射）
- 制造认知惊喜

**原则**：
- 新鲜感不是刻意搞笑，而是**视角转换**
- 不能为了新意牺牲准确性和一致性
- 基于用户已有兴趣做延伸，而不是随机发散

**示例输出**：
```json
{
  "novelty_notes": {
    "new_angle": "把第二大脑类比为操作系统而非图书馆",
    "cross_domain": "用 git 分支模型解释人格发展",
    "provocative_question": "记忆系统是否在固化你的思维?"
  }
}
```

**当前状态**：⬜ 不存在（Phase 2 目标）

---

## 10. Planner Prompt（Phase 3）

**定位**：规划层。帮助用户将长期目标拆解为可执行的步骤。

**触发条件**：系统已积累足够了解用户的目标和项目。Phase 0-2 不实现。

**职责**：
- 从对话中识别隐含目标
- 将目标拆解为阶段和步骤
- 跟踪进度和阻塞项
- 定期回顾和调整计划

**输出**：
```json
{
  "plan": {
    "goal": "长期目标",
    "phases": [
      {"name": "阶段1", "steps": [], "estimated": "2周"}
    ],
    "blockers": [],
    "status": "active"
  }
}
```

**当前状态**：⬜ 不存在（Phase 3 远期目标）

---

## 11. Goal Tracker Prompt（Phase 3）

**定位**：目标追踪层。持续监控目标完成状态，不做规划只做追踪。

**与 Planner 的区别**：
- Planner 制定计划
- Goal Tracker 跟踪执行情况

**职责**：
- 检测进度停滞
- 识别目标漂移
- 定期生成进度报告
- 在目标完成时触发回顾

**当前状态**：⬜ 不存在（Phase 3 远期目标）

---

## 12. Knowledge Librarian Prompt（Phase 3）

**定位**：知识管理。维护系统学到的结构化知识。

**与 Memory 的区别**：
- Memory 存**用户经历**（昨天和谁聊了什么）
- Knowledge 存**知识资产**（贝叶斯定理是什么、Agent 的几种架构）

**职责**：
- 从对话中提取可复用的知识
- 建立知识点之间的关联
- 检测知识缺口并提出学习建议

**当前状态**：⬜ 不存在（Phase 3 远期目标）

---

# 分阶段演进

## 总览

```
Phase 0                        Phase 1                Phase 2                  Phase 3
──────                         ──────                 ──────                   ──────
Foundation                     Foundation             Foundation               Foundation
Orchestrator                   Orchestrator           Orchestrator             Orchestrator
Companion    ───→              Companion              Companion                Companion
Researcher   ───→              Researcher             Researcher               Researcher
Critic       ───→              Critic                 Critic                   Critic
Archivist    ───→              Archivist              Archivist                Archivist
                               ┌──────────┐           ┌──────────┐             ┌──────────┐
                               │ Delivery │           │ Delivery │             │ Delivery │
                               └──────────┘           ├──────────┤             ├──────────┤
                                                      │ Insight  │             │ Insight  │
                                                      ├──────────┤             ├──────────┤
                                                      │ Novelty  │             │ Novelty  │
                                                      └──────────┘             ├──────────┤
                                                                               │ Planner  │
                                                                               ├──────────┤
                                                                               │ Tracker  │
                                                                               ├──────────┤
                                                                               │ Librarian│
                                                                               └──────────┘
```

## Phase 0（当前）：两步调用

```
Step 1: Companion（纯聊天，不需要 JSON）
         ↓ 返回文本
Step 2: Analysis（research + critic + archivist 混在一起）
         ↓ 返回 JSON
```

当前 `src/cognition/llm.ts` 中的 `callCompanion` 和 `callAnalysis` 对应此阶段。

**核心任务**：链路跑通，积累真实数据。

---

## Phase 1：Orchestrator 调度 + Delivery

```
Orchestrator
  ↓ 决定模式 S1-S4
  ↓ 决定需要哪些算子
  ↓
Companion ← Researcher ← Critic ← Archivist
  ↓                             ↑
  └──────── Delivery ───────────┘
           ↑ 判断是否/如何表达
 用户
```

**前置条件**：有真实用户数据（系统已运行一段时间）。
**核心任务**：Orchestrator 根据场景调度不同算子；Delivery 控制表达节奏，不做"每问必答"。

---

## Phase 2：时间维度感知

```
Insight → 检测兴趣迁移、目标偏离（时间窗口 ≥ 7 天）
Novelty → 提供新视角、跨领域联想（避免可预测性）
Delivery → 决定 Insight/Novelty 是否推送给用户
```

**前置条件**：有足够连续数据（至少数周对话）。
**核心任务**：系统开始从"即时反应"进化到"长期理解"。

---

## Phase 3：主动服务

```
Planner → 目标拆解
Tracker → 进度追踪
Librarian → 知识管理
```

**前置条件**：系统已深度了解用户的目标、项目、知识结构。
**核心任务**：从被动响应进化到主动辅助。

---

## 当前实现映射

| 层 | Phase | 是否存在 | 位置 |
|---|-------|---------|------|
| Foundation | 0 | ⬜ | — |
| Orchestrator | 0 | ⬜ | — |
| Companion | 0 | ✅ | `COMPANION_PROMPT` |
| Researcher | 0 | ⏳ | 混在 `ANALYSIS_PROMPT` |
| Critic | 0 | ⏳ | 混在 `ANALYSIS_PROMPT` |
| Archivist | 0 | ⏳ | 混在 `ANALYSIS_PROMPT` |
| Delivery | 1 | ⬜ | — |
| Insight | 2 | ⬜ | — |
| Novelty | 2 | ⬜ | — |
| Planner | 3 | ⬜ | — |
| Goal Tracker | 3 | ⬜ | — |
| Knowledge Librarian | 3 | ⬜ | — |

## 不涉及的（当前）

- 不改变当前的调用方式（两步调用保持到 Phase 1）
- 不引入新的 npm 依赖
- 不修改已有 prompt 内容，只重新组织
- Phase 1-3 的算子不在 MVP 范围内实现
