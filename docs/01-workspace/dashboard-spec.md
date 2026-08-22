# 工作台页面规范（Workspace Pages）

> 当前工作台是 Next.js 应用 `apps/workspace/`，运行于 `:5173`。独立公开博客
> 位于 `apps/blog/`（`:5175`），VitePress 私人内容站在 `apps/workspace/.vitepress/`
> （`:5174`）。页面清单与代码位置见 `docs/00-overview/current-architecture.md`
> 第 7 节与 `docs/01-workspace/design.md`。

## 工作台路由

| 路由 | 功能 |
| --- | --- |
| `/` | 工作台总览：项目/待办摘要、快捷入口、日历摘要、知识摘要、每日总结 |
| `/ai` | 与 Persona 对话、查看服务状态 |
| `/ai/models` | 服务端或自定义厂商连接、模型参数、连接测试 |
| `/ai/memory` | Topic、Profile、Timeline 和来源审阅 |
| `/ai/settings` | 外观、AI 行为、本地 Persona API 启动与关闭 |
| `/calendar` | 月/周/日视图、事件 CRUD、自定义标签、搜索过滤、Obsidian 待办投影 |
| `/knowledge` | 独立知识库浏览页 |
| `/tools` | 运行诊断、内容站入口、Daily Summary 工具 |

所有工作台页面共享 `ApplicationFrame` 与常驻左侧栏。侧栏核心入口为总览、
AI、知识库、工具，底部只保留统一设置。

## 独立表面

| 表面 | 端口 | 说明 |
| --- | --- | --- |
| 公开博客 | `:5175` | 列表 `/`、详情 `/[slug]`、标签 `/tags`，皮肤与工作台完全分离 |
| 私人内容站 | `:5174` | VitePress 渲染 Obsidian Vault，仅供本机私人浏览 |
