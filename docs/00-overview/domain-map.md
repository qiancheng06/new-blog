# Domain Map — Persona Workspace

```
┌─────────────────────────────────────────────────────┐
│                  Persona Workspace                  │
│                                                     │
│  ┌──────────────┐       ┌──────────────────────┐   │
│  │  Workspace   │       │      Persona         │   │
│  │  (主动管理)   │       │     (认知核心)        │   │
│  │              │       │                      │   │
│  │ · Knowledge  │       │  · Companion (表达者)  │   │
│  │ · Project    │       │  · Researcher (解释)   │   │
│  │ · Todo       │       │  · Critic (批判)       │   │
│  │ · Blog       │◄──────│  · Archivist (归档)    │   │
│  │ · Dashboard  │       │  · Prompt (提示词)      │   │
│  └──────┬───────┘       └──────────┬───────────┘   │
│         │                          │               │
│         │    ┌──────────┐          │               │
│         └───►│  Memory  │◄─────────┘               │
│              │ (记忆系统)│                          │
│              │          │                          │
│              │ · Event  │                          │
│              │ · Topic  │                          │
│              │ · Profile│                          │
│              │ · Timeline│                         │
│              │ · DailyNote│                        │
│              └────┬─────┘                          │
│                   │                                │
│         ┌─────────┴─────────┐                      │
│         │   Application     │                      │
│         │  (编排与桥接)      │                      │
│         │  · Recall         │                      │
│         │  · ContextBuilder │                      │
│         │  · Event Bus      │                      │
│         └───────────────────┘                      │
│                   │                                │
│              ┌────┴────┐                           │
│              │  Infra  │                           │
│              │ DB·API  │                           │
│              │Telegram │                           │
│              │ Deploy  │                           │
│              └─────────┘                           │
└─────────────────────────────────────────────────────┘
```

## 分层结构

Persona Workspace 由两层构成：

```
Layer 1 — User-facing (前台)
  Workspace：Knowledge, Project, Todo, Blog, Dashboard

Layer 2 — Cognitive Core (后台)
  Application → Persona → Memory → Infra
```

- **Workspace 是前台**：用户主动管理自己的数据
- **Application 是桥接层**：编排 Workspace 输入、Event、Memory、Persona 和输出
- **Persona Core 是认知层**：系统自动完成分析和表达

## 关键关系

- **Workspace ↔ Persona**：用户通过 Dashboard 对话触发认知流程
- **Application ↔ Persona**：Application 负责流程编排，Persona 负责认知与表达
- **Persona ↔ Memory**：Researcher/Archivist 产出 memory patch，Memory 决定如何落库
- **Memory ↔ Application**：Application 从 Memory 检索，组装上下文后送给 Persona
- **Infra** 支撑所有层

## 域边界

| 域 | 持有 | 不可负责 |
|----|------|----------|
| Workspace (前台) | Knowledge, Project, Todo, Blog | 认知加工、记忆存储 |
| Persona (后台) | Companion, Researcher, Critic, Archivist | 持久化、UI 展示 |
| Memory | Event, Topic, Profile, Timeline, DailyNote | 用户主动创建数据、Project |
| Application | Conversation Flow, Event Bus, Recall, ContextBuilder | 认知推理、持久化、UI 展示 |
| Infra | DB, API, Telegram, Deploy | 业务逻辑 |
