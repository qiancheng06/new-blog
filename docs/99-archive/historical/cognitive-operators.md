<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 认知算子（Cognitive Operators）

> archive — 当前 schema 见 `02-persona/prompt-pack.md`。本版本的 `memory_patch` 包含 `project_updates`，已在 2026-06-19 统一移除（Project 属于 Workspace，不归 Memory 管理）。

> Persona OS 的认知层由一组算子组成。单个推理请求内完成所有算子，拆分为结构化字段输出，避免多 Agent 调用的成本和延迟。

---

## 单次调用协议

```json
{
  "companion_reply": "...给用户看的文本...",
  "research": {
    "core_points": ["用户核心论点"],
    "hidden_assumptions": [],
    "open_questions": []
  },
  "critic": {
    "confidence": 0.0,
    "counter_examples": [],
    "evidence_gaps": []
  },
  "memory_patch": {
    "profile_updates": [],
    "topic_updates": [],
    "project_updates": [],
    "timeline_events": []
  }
}
```

---

## Companion

**定位**：体验层。系统默认输出口。

**职责**：

- 接住用户输入，维持交流节奏
- 共情但不泛滥，理解但不讨好
- 控制语气和篇幅，适配当前模式（S1-S4）
- 决定是否以及如何表达 Critic 或 Insight 的内容

**约束**：

- 不对用户进行诊断式评价
- 不允许使用"你应该"句式（除非 S3 模式触发）
- 允许沉默和简短回应

---

## Researcher

**定位**：蒸馏层。把长对话压成结构。

**职责**：

- 提取核心论点
- 识别隐含假设
- 提出开放问题
- 归纳主题变化

**约束**：

- 不表态迎合
- 不省略矛盾点
- 不臆测未提及的信息

---

## Critic

**定位**：校正层。防止回声室。

**职责**：

- 标记逻辑漏洞
- 提供反例或替代解释
- 评估结论的置信度
- 指出证据缺口

**约束**：

- 默认不直接输出
- 必须有证据支撑，不凭空质疑
- 置信度低于 0.3 时应建议暂缓写入记忆

---

## Archivist

**定位**：记忆层。维护系统的长期认知。

**职责**：

- 提交建议写入 Profile / Topic / Project / Timeline
- 识别值得归档的语义知识
- 标记需要人工确认的变更

**约束**：

- 只提交记忆变更建议，不直接落库
- 情绪化内容标注缓存期
- 相矛盾的信息标注冲突状态

---

## Insight

**定位**：洞察层。发现时间维度上的模式。

**职责**：

- 检测兴趣迁移
- 识别目标偏离
- 发现重复模式

**约束**：

- V2 目标，MVP 阶段不实现
- 输出必须经过 Delivery Layer

---

## Delivery

**定位**：表达策略层。决定怎么说。

**职责**：

- 评估是否适合表达
- 选择语气和信息密度
- 控制推送时机

**约束**：

- 不修改内容本身
- V2 目标，MVP 阶段使用默认直出
