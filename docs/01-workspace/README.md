# Workspace

Workspace 是用户面对的工作台域，负责可见交互、内容浏览、仪表盘以及与
Persona OS 的前端桥接。

## 当前状态

- 主应用：`apps/workspace/` 下的 Next.js。
- 主入口：`http://127.0.0.1:5173/`，通过 `npm.cmd run dev` 启动。
- 公开博客：`apps/blog/` 独立 Next.js 应用，`:5175`，见
  `docs/00-overview/current-architecture.md`。
- 私人内容站：VitePress/Obsidian，`:5174`，通过 `npm.cmd run dev:content` 启动。
- `apps/workspace/legacy/` 下的旧 HTML 仅作迁移参考。
- 项目、待办、日历、知识库、记忆与对话均有 Next.js 模块。

## 本域职责

- 工作台外壳、导航、布局与用户交互。
- 项目、待办、日历、知识、记忆状态与 Companion 对话的仪表盘模块。
- 生成式 Workspace JSON 与 Persona Application API 的前端适配器。
- 通过私人内容站呈现 Obsidian/Markdown 内容。
- 当生成数据或 Persona API 不可用时，提供清晰的来源与回退提示。

## 本域不负责

- 不实现推理、人格行为或记忆排序。
- 不直接从 Workspace UI 代码读取 SQLite。
- 不直接从 React 组件读取 Obsidian vault。
- 不从前端直接调用 LLM 厂商。
- 不绕过 Application API 处理对话或记忆状态。

## 常读文档

- [design.md](design.md)
- [dashboard-spec.md](dashboard-spec.md)
- [obsidian-vault-spec.md](obsidian-vault-spec.md)
- [sync-spec.md](sync-spec.md)
- [../00-overview/domain-map.md](../00-overview/domain-map.md)
- [../00-overview/current-architecture.md](../00-overview/current-architecture.md)

## 相关代码位置

- `apps/workspace/app/`
- `apps/workspace/src/features/`
- `apps/workspace/src/shared/api/personaApi.ts`
- `apps/workspace/src/shared/data/workspaceData.ts`
- `apps/workspace/src/shared/data/workspaceSources.ts`
- `apps/workspace/scripts/sync-projects.js`
- `apps/workspace/.vitepress/`
- `apps/workspace/legacy/`
- `apps/blog/`（公开博客，同属 Workspace 前端表面）

## AI 修改前检查项

- 确认改动属于 Workspace，还是应路由到 Application、Memory、Persona 或 Infra。
- React UI 代码对外部数据只走 `apps/workspace/src/shared/` 适配器。
- Obsidian 与 SQLite 是两个独立长期来源，中间层分离。
- 本地生成 JSON 缺失时保留来源/回退行为。
- 前端行为变化后用 `npm.cmd run build` 与 `npm.cmd run check:workspace` 验证。

## 跨域协作规则

- 对话与记忆操作通过 `:3001` 的 Application API。
- 记忆 schema、排序、遗忘与画像状态属于 `03-memory/`。
- 人格表达、Prompt 与算子行为属于 `02-persona/`。
- DB 路径、厂商配置、部署与本地环境属于 `05-infra/`。
- 产品范围与验收标准属于 `07-product/`。

## 验证口径

- 前端行为变化：`npm.cmd run build` 与 `npm.cmd run check:workspace`。
- 同步脚本或生成 JSON 变化：`npm.cmd run sync`。
- 默认本地门禁：`npm.cmd run verify:local`。