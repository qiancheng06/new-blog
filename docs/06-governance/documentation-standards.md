# 文档规范

本文规定 `docs/` 的目录、命名、权威性和维护方式，避免当前实现、未来计划和历史资料混在一起。

## 目录职责

| 目录 | 内容 | 可以作为实现依据 |
| --- | --- | --- |
| `00-overview/` | 当前架构、术语、入口、Agent 分工和跨域地图 | 可以，当前架构以 `current-architecture.md` 为准 |
| `01-workspace/` | Workspace、Blog、VitePress、Obsidian 和同步规范 | 可以，限内容与前端域 |
| `02-persona/` | Persona Runtime、Prompt、Companion 和认知表达 | 可以，限 Persona Runtime 域 |
| `03-memory/` | Event、Memory 投影、治理和检索语义 | 可以，限 Memory Domain 域 |
| `04-application/` | Application/API、业务用例、移动 API 和任务编排 | 可以，限 Application/API 域 |
| `05-infra/` | SQLite、LLM、配置、部署、CI/CD、版本和运维 | 可以，限 Infra/Release 域 |
| `06-governance/` | 不变原则、编码、协作、文档、调试和质量门禁 | 可以，作为全局约束 |
| `07-product/` | 产品愿景、范围、阶段目标和验收标准 | 只能作为目标和验收依据，不能代替当前实现 |
| `99-archive/` | 废弃方案、历史记录、旧任务和旧架构 | 不可以，除非先转化为新的当前文档 |

## 命名规则

- 文件名使用小写 kebab-case，例如 `current-architecture.md`。
- `README.md` 只做目录入口，不承载长篇实现细节。
- 当前事实使用 `current-*` 或领域规范名称；计划使用 `plan-*`；验收证据使用 `evaluation-results/`。
- 不用日期创建当前规范副本。需要保留历史版本时放入 `99-archive/` 或 Git 历史。

## 每个领域 README 的固定结构

领域 README 按以下顺序组织：

1. 一句话定义和负责人 Agent。
2. 本域职责。
3. 本域不负责。
4. 与其他域/Agent 的边界。
5. 常读文档。
6. 相关代码位置。
7. AI 修改前检查项。
8. 跨域协作规则。
9. 验证口径。

## 状态和链接规则

- 当前实现、目标设计、历史资料必须明确区分。
- 需要引用代码时使用仓库相对路径；需要引用文档时优先链接到目录 README 或权威规范。
- 跨域接口必须同时写出提供方、消费方、数据格式/版本和验证命令。
- 发现过期内容时优先修正文档入口或移动到 `99-archive/`，不要留下两个互相竞争的“当前版本”。

## AI 协作规则

- AI 先读 `docs/README.md`、`00-overview/README.md`、当前架构和对应领域 README，再修改代码。
- 每个 Agent 只修改分工表允许的路径；跨域需求通过 API、读模型、事件或文档契约协调。
- 文档修改不得顺手重写无关实现；实现变化影响端口、路径、数据流或角色边界时，必须回写对应文档。
- 提交前至少执行与改动域匹配的检查，并在交接中记录未执行的人工验收。
