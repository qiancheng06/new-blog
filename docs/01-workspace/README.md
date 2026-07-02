# Workspace

Workspace 是用户主动管理内容的前台域。

## 本域职责

- Dashboard、项目进度、待办日历、知识库、博客展示
- Workspace 可观测面板的只读展示（后端在线状态、事件概览、运行状态摘要）
- Obsidian/Markdown 到 HTML/VitePress 的同步链路
- 本地可打开的静态页面和 VitePress 页面体验

## 本域不负责

- 不做认知推理
- 不直接写 Memory
- 不绕过 Event Core 调用 Persona
- 不保存长期画像或自动记忆
- 不直接读取数据库、日志文件或调用 LLM Provider

## 常读文档

- [design.md](design.md)
- [dashboard-spec.md](dashboard-spec.md)
- [obsidian-vault-spec.md](obsidian-vault-spec.md)
- [sync-spec.md](sync-spec.md)
- [../00-overview/domain-map.md](../00-overview/domain-map.md)

## 相关代码位置

- `apps/workspace/index.html`
- `apps/workspace/detail.html`
- `apps/workspace/calendar.html`
- `apps/workspace/.vitepress/`
- `apps/workspace/scripts/sync-projects.js`
- `apps/workspace/scripts/watch.js`
- `apps/workspace/projects/*.md`

## AI 修改前检查项

- 确认修改是否只影响用户可见前台
- 检查同步脚本是否会覆盖手工编辑区域
- 不修改 Obsidian 内容结构，除非任务明确要求
- 如果需要对话能力，只通过 Application/API 进入 Persona
- Companion chat 入口只调用本地 Application API：`http://127.0.0.1:3001/health` 和 `http://127.0.0.1:3001/api/chat`
- 可观测面板只能读取 Application 暴露的只读接口，例如 `/health`、`/api/status`、`/api/events`；不得在 Workspace 侧解析数据库文件或重建后端状态

## 跨域协作规则

- 需要聊天或认知能力时，交给 Application 域
- 需要新增记忆字段时，交给 Memory 域
- 需要改变同步路径或部署方式时，交给 Infra 域
- 需要新增可观测指标时，Workspace 只定义展示需求；指标口径、查询出口和运行时采集分别交给 Application 与 Infra 域
