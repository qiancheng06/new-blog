# Persona Workspace 文档中心

这里是 Persona Workspace 的文档总入口。文档按职责域组织，目录编号表示阅读顺序和稳定性，不表示执行优先级。

## 先读什么

1. [00-overview/README.md](00-overview/README.md)：当前架构、入口和 AI 加载顺序。
2. [00-overview/current-architecture.md](00-overview/current-architecture.md)：当前实现的权威事实。
3. [06-governance/architecture-invariants.md](06-governance/architecture-invariants.md)：不可违反的架构约束。
4. [00-overview/agent-work-allocation.md](00-overview/agent-work-allocation.md)：AI 角色和允许修改范围。
5. 根据任务进入对应领域 README。

## 按问题查找

| 要了解什么 | 入口 |
| --- | --- |
| 当前系统由什么组成 | [00-overview/current-architecture.md](00-overview/current-architecture.md) |
| 哪个 AI 可以修改什么 | [00-overview/agent-work-allocation.md](00-overview/agent-work-allocation.md) |
| AI 进入项目应该加载什么 | [00-overview/ai-loading-guide.md](00-overview/ai-loading-guide.md) |
| Workspace、Blog、VitePress、同步 | [01-workspace/README.md](01-workspace/README.md) |
| Persona、Prompt、Companion | [02-persona/README.md](02-persona/README.md) |
| Event、Profile、Topic、Timeline、Memory | [03-memory/README.md](03-memory/README.md) |
| API、Chat、Capture、Calendar、Mobile API | [04-application/README.md](04-application/README.md) |
| SQLite、LLM、Docker、NAS、CI、发布和版本 | [05-infra/README.md](05-infra/README.md) |
| 架构约束、协作规范、调试和验收 | [06-governance/README.md](06-governance/README.md) |
| 愿景、范围、阶段计划和产品验收 | [07-product/README.md](07-product/README.md) |
| 旧方案和历史记录 | [99-archive/README.md](99-archive/README.md) |

## 文档权威顺序

当文档之间出现冲突时，按以下顺序判断：

1. `06-governance/architecture-invariants.md`
2. `00-overview/current-architecture.md`
3. 对应领域的 `README.md` 和当前规范
4. `07-product/` 中的目标和验收要求
5. `99-archive/` 仅作历史背景

## 维护规则

- 新文档必须归入一个编号目录，并在该目录 README 中登记。
- 当前实现写入 `00-overview/` 或对应领域；未来设想写入 `07-product/`；旧方案只进入 `99-archive/`。
- 跨域改动必须更新相关领域 README 或架构入口，并注明接口/数据边界。
- 文档中的命令、路径、端口和角色名称必须以当前代码为准；不确定时先查 `current-architecture.md`。
- 文档改动完成后运行 `git diff --check`，涉及代码或入口时运行对应 contract。
