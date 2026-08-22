# Persona OS Project Brief v1.0

## 项目定位

Persona OS 不是聊天机器人，不是知识库，也不是待办系统。

它是一个以 AI 为核心的个人认知操作系统（Personal Cognitive Operating System）。

目标是把 Telegram、Web、Obsidian、日历、项目管理等多个信息入口统一到一条认知流中，通过长期记忆、上下文理解和多端协同，形成持续演化的个人认知伙伴。

系统长期目标：

- 连续人格
- 连续记忆
- 连续成长
- 多端协同

---

## 核心设计理念

系统采用：

```
Event Driven
Context Aware
Memory First
Companion Oriented
```

8 条不可违反架构原则见 `docs/06-governance/architecture-invariants.md`。

---

## 当前架构

> 当前真实架构以 `docs/00-overview/current-architecture.md` 为准。以下为概念分层概述。

```
Input（Telegram / Web / Obsidian 同步）
  ↓
Event Core（不可变事实源）
  ↓
Application（Conversation / Capture / Project / Todo / Working State / Calendar）
  ↓
AI Runtime（Companion 表达 + Research / Critic / Memory Patch 分析）
  ↓
Memory（Topic / Profile / Timeline / Memory Proposal / FTS 检索）
  ↓
Output Composer（Companion 唯一用户可见出口）
  ↓
Telegram / Workspace :5173 / Blog :5175 / Obsidian 归档
```

当前实现为模块化单体：Next.js 工作台与独立博客分进程运行，Persona API
统一承载对话、记忆、日历、项目、待办、调度与持久化。

---

## 核心模块

### Event Core

负责统一接收：

- Telegram
- Web
- Obsidian
- Calendar
- Todo

统一转换为 Event。

Event 是系统唯一事实源。

---

### Context Engine

负责判断：

- 当前主题
- 当前项目
- 当前语境
- 与哪些历史内容相关

不直接生成回复。只负责理解上下文。

---

### Memory Fabric

记忆系统。结构：

```
Raw Events
 ↓
Episodic
 ↓
Topic
 ↓
Project
 ↓
Profile
 ↓
Timeline
```

---

### Working State

系统当前关注状态。

不是长期记忆。是当前脑内状态。

```json
{
  "current_project": "",
  "active_topics": [],
  "current_questions": [],
  "mode": "S1"
}
```

---

### Cognitive Operators

#### Companion

负责：接住、共情、表达、陪伴。默认出口。

#### Researcher

负责：分析、抽象、建模、归纳。

#### Critic

负责：风险提醒、反例、逻辑校验。默认不直接输出。

#### Archivist

负责：维护记忆、整理时间线、更新画像。

#### Insight

负责：趋势识别、长期变化发现。

#### Delivery

负责：时机、语气、信息密度、表达策略。

---

## Companion First 策略

默认前台只显示 Companion。

后台 Researcher / Critic / Archivist / Insight 持续运行，但结果先进入内部结构，Companion 决定是否表达。

原则：

```
先接住
再结构化
最后校正
```

---

## 输出模式

| 模式 | Companion | 其他 | 说明 |
|------|-----------|------|------|
| S1 陪伴 | 95% | 5% 轻提醒 | 默认日常 |
| S2 共创 | 70% | 30% Researcher | 深聊时启用 |
| S3 校正 | 50% | 50% Critic | 仅特殊场景触发 |
| S4 深度 | — | 长期建模 | 时间线/认知演化分析 |

---

## 表达策略层（非常重要）

Insight 发现内容后不直接输出。必须经过 Delivery Layer 决定：

- 是否说
- 什么时候说
- 怎么说
- 说多少

系统关注：认知距离、情绪状态、当前场景、信息负载。

---

## 记忆架构

长期记忆核心：Obsidian

目录结构：

```
Vault/
├── Daily/
├── Topics/
├── Projects/
├── Timeline/
├── Profile/
├── Reports/
└── Assets/
```

NAS：备份、归档、媒体文件。不参与实时认知。

当前代码实现使用 SQLite 作为运行时主库；长期目标可迁移 PostgreSQL。Obsidian 是长期可视化和人工审计层。

---

## 技术路线

当前阶段：

- Node.js
- TypeScript
- SQLite（当前实现）/ PostgreSQL（长期目标）
- Telegram Bot
- Obsidian

优先单体架构。暂不考虑微服务、图数据库、多模型路由、Agent 集群。

---

## MVP 范围

### 输入

Telegram

### 存储

SQLite（当前实现）/ PostgreSQL（长期目标）

### 输出

Companion

### 能力

- Event 入库
- Topic 分类
- Project 分类
- 基础记忆
- 每日总结
- Obsidian 同步

---

## 非目标

当前阶段不做：

- 完整人格模拟
- 多 Agent 自主协商
- 图谱推理
- 自动规划人生
- 高级自治系统

---

## 不可违反的架构原则

1. Event 是唯一输入单位
2. Companion 是默认输出层
3. Critic 默认隐藏
4. Obsidian 是长期记忆主库
5. 原始事件不可修改
6. Profile 只能渐进更新
7. 情绪不可直接写入长期画像
8. 所有复杂能力必须建立在 MVP 闭环完成之后

---

## 当前工程目标

先证明这条链路能够稳定运行 30 天：

```
Telegram → Event → Memory → Companion → Daily Summary → Obsidian
```

如果不能稳定运行：不要增加复杂度。

如果能够稳定运行：再进入下一阶段。
