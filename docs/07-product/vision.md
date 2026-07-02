# Vision

本文件描述长期方向，不能作为当前实现依据。当前范围和验收以 `project-brief.md`、`scope.md`、`acceptance-criteria.md` 为准。

## Current

- 当前项目处于 Workspace 旧项目与 Persona OS 新项目合并后的收敛期。
- 当前目标是让本地 Workspace、Persona 后端、Memory 和文档分工可以稳定协作。
- 当前推荐架构是模块化单体加架构域分层。
- 当前运行时数据库是 SQLite。

## Later

长期愿景是个人 AI 操作系统：

- 能持续记录事件。
- 能形成可追溯的长期记忆。
- 能通过 Companion 提供连续、克制、可靠的表达。
- 能逐步连接 Workspace、Telegram、Obsidian 等入口。

这些方向不等于已经完成，也不要求现在拆成微服务。

## AI 修改边界

- 可以补充愿景，但必须标明 Later。
- 不可以把愿景改成当前验收标准。
- 不可以新增“必须上云、必须微服务、必须 Next.js”等强制路线。
- 不可以删除 `99-archive/` 中的历史方案。
