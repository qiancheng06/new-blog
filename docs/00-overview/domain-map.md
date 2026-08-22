# Domain Map — Persona Workspace

本文件描述当前模块化单体的架构域边界，是 AI 判断文件归属和跨域影响的入口。

## 进程与表面

```
┌──────────────────────────────────────────────────────────┐
│                    Persona Workspace                      │
│                                                          │
│  Presentation（界面层）                                    │
│  ├─ Next.js Workspace :5173   私人工作台（总览/AI/日历/知识库/工具）│
│  ├─ Next.js Blog :5175        独立公开博客                │
│  ├─ VitePress Content :5174   私人 Markdown 内容站         │
│  └─ Telegram Adapter          即时输入入口                 │
│                                                          │
│  Application（应用层）                                     │
│  ├─ Conversation / Capture / Event Feed / Conversation History │
│  ├─ Project / Todo / Working State / Calendar             │
│  ├─ Memory（治理 / 检索 / 提案）                            │
│  └─ Daily Summary / Obsidian Snapshot / Schedulers        │
│                                                          │
│  AI Runtime（认知层）                                      │
│  ├─ Companion（唯一用户可见出口）                            │
│  ├─ Researcher / Critic（隐藏分析）                         │
│  └─ Memory Patch（结构化记忆建议）                           │
│                                                          │
│  Domain（领域层）                                          │
│  ├─ Event（不可变事实源）                                   │
│  ├─ Conversation Job / Analysis Job / Background Job       │
│  ├─ Topic / Profile / Timeline / Memory Proposal / FTS     │
│  ├─ Project / Todo / Working State / Daily Note / Calendar │
│                                                          │
│  Infra（基础设施层）                                        │
│  ├─ SQLite（WAL + FTS5） / LLM Provider / Telegram API     │
│  ├─ Obsidian 文件写入（托管块 + 原子替换）                    │
│  └─ Config / Health / Runtime Diagnostics                 │
└──────────────────────────────────────────────────────────┘
```

## 分层结构

```
Layer 1 — Presentation（前台）：Workspace / Blog / VitePress / Telegram
Layer 2 — Application（编排）：输入到输出的业务流程与持久化任务
Layer 3 — AI Runtime（认知）：表达与结构化分析
Layer 4 — Domain（领域）：事实、投影、状态机与记忆规则
Layer 5 — Infra（基础设施）：数据库、LLM、Telegram、Obsidian、配置
```

## 关键关系

- **Workspace ↔ Application**：前端只通过 Application API 读写，不直接访问 SQLite 或 Obsidian。
- **Application ↔ AI Runtime**：Application 编排流程，AI Runtime 负责表达与分析。
- **AI Runtime ↔ Domain**：Companion 输出与 Analysis 结果进入 Domain 规则落库。
- **Domain ↔ Infra**：Domain 定义语义，Infra 负责适配（SQLite、LLM、Telegram、Obsidian 写入）。
- **Workspace ↔ Blog**：两者共享 `sync-projects.js` 生成的读模型，但进程与皮肤完全分离。

## 域边界

| 域 | 持有 | 不可负责 |
|----|------|----------|
| Workspace | 工作台页面、导航、生成数据适配、私人内容站 | 认知加工、记忆存储 |
| Blog | 公开博客列表/详情/标签、独立皮肤 | Persona 记忆、SQLite 直接访问 |
| Persona（AI Runtime） | Companion、Researcher、Critic、Prompt、表达 | 持久化、UI 展示 |
| Application | Conversation、Capture、Project、Todo、Working State、Calendar、Memory 编排、调度 | 认知推理、DB 适配 |
| Memory（Domain） | Event、Topic、Profile、Timeline、Memory Proposal、Daily Note、检索 | 用户主动创建数据、Project/Todo 语义 |
| Infra | SQLite、LLM、Telegram、Obsidian 写入、Config、Deploy | 业务逻辑 |

## 文件归属速查

| 路径 | 域 |
| --- | --- |
| `apps/workspace/**` | Workspace（前台） |
| `apps/blog/**` | Blog（前台） |
| `apps/persona/src/interface/**` | Infra/接口 |
| `apps/persona/src/application/**` | Application |
| `apps/persona/src/ai-runtime/**` | Persona（认知层） |
| `apps/persona/src/domain/**` | Domain（领域层） |
| `apps/persona/src/infra/**` | Infra |
| `apps/persona/src/main/**` | 运行时装配 |
| `apps/workspace/scripts/**` | 同步管道 |
| `docs/00-overview/**`, `docs/06-governance/**` | Governance |
