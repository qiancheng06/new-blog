# Product

Product 是愿景、范围和验收标准域。

## 本域职责

- 项目定位和长期愿景
- MVP 范围
- 阶段计划
- 验收标准

## 本域不负责

- 不描述代码真实结构
- 不替代当前架构文档
- 不作为直接实现依据
- 不记录历史旧方案

## 常读文档

- [project-brief.md](project-brief.md)
- [vision.md](vision.md)
- [scope.md](scope.md)
- [long-term-plan.md](long-term-plan.md)
- [acceptance-criteria.md](acceptance-criteria.md)

## 相关代码位置

- 无直接代码所有权

## AI 修改前检查项

- 区分愿景和当前实现
- 新增能力必须回看 MVP 边界
- 产品叙事不能覆盖架构不变原则
- 验收标准应能被当前工程阶段验证

## 跨域协作规则

- 产品范围变化会影响 Workspace、Application、Persona、Memory
- 长期愿景不能绕过 Governance 的复杂度限制

## 验收口径

- 当前默认验收入口是 `npm.cmd run verify:local`。
- 默认验收只覆盖仓库内和 mock 环境可复现的检查：后端构建、无网络 API smoke、Workspace sync、当前文档旧引用扫描。
- 真实 Telegram/LLM、浏览器人工体验、长驻 watch、Obsidian vault/OneDrive 内容完整性属于本机权限验收；未执行时应在交接风险中说明。
- 详细标准见 [acceptance-criteria.md](acceptance-criteria.md)。
