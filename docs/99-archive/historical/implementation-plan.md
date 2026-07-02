<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# Implementation Plan — Phase 1 最小闭环

> 目标：证明 `Telegram → Event → Memory → Companion → Daily Summary → Obsidian` 能稳定运行 30 天。

---

## Sprint 1：骨架搭建（第 1-3 天）

### 基础设施

- [ ] 初始化 Node.js + TypeScript 项目
- [ ] 配置 ESLint + Prettier
- [ ] 初始化 PostgreSQL（表创建脚本）
- [ ] 配置环境变量管理（TELEGRAM_TOKEN, DATABASE_URL 等）

### 事件系统

- [ ] 定义 Event 类型（event-schema.ts）
- [ ] Event 入库服务（eventStore.ts）
- [ ] 基础 Event 查询接口

### Telegram 接入

- [ ] Bot 初始化（grammy 或 telegraf）
- [ ] 接收消息 → 转为 Event → 入库
- [ ] 回复"已收到"确认

**验收**：发一条 Telegram 消息，能在数据库 events 表中查到对应记录。

---

## Sprint 2：Companion 基础对话（第 4-6 天）

### LLM 接入

- [ ] OpenAI / Claude API 封装（llm.ts）
- [ ] 单次调用协议落地（companion + researcher + critic + memory_patch）
- [ ] Companion 回复生成

### 上下文搭建

- [ ] Working State 管理（内存级）
- [ ] Topic 分类器（基于当前消息 + Working State）
- [ ] 基础 Context 构建（最近 N 条消息）

### Topic 管理

- [ ] Topic 表写入和更新
- [ ] Topic 自动创建和摘要生成

**验收**：发一条消息，系统能回复一句像样的话，Topic 写入正确。

---

## Sprint 3：记忆层（第 7-10 天）

### Topic Summary

- [ ] Topic 消息计数达到阈值自动总结
- [ ] Summary 持久化

### Profile 初版

- [ ] 从对话中提取兴趣和风格
- [ ] 增量更新（只能合并，不覆盖）
- [ ] 源事件追溯

### Timeline 初版

- [ ] 里程碑事件识别（新主题/长时间跨度/观点变化）
- [ ] 写入 timeline_events 表

**验收**：第二次聊同一主题，Companion 能引用前文。

---

## Sprint 4：每日总结 + Obsidian 同步（第 11-14 天）

### Daily Summary

- [ ] 自动生成当日对话摘要
- [ ] 高亮关键事件和变化
- [ ] 写入 daily_notes 表

### Obsidian 同步

- [ ] 生成 Markdown 文件 → Vault 指定目录
- [ ] Daily/ 目录，按日期组织
- [ ] Topic 和 Timeline 同步为可读 Markdown

### 30 天稳定性测试

- [ ] 错误处理和重试机制
- [ ] 基础监控（消息量、回复率、错误率）
- [ ] 启动脚本 + 进程守护

**验收**：系统无人干预连续运行 7 天，每日总结产出可读。

---

## 项目结构（建议）

```
src/
├── index.ts
├── config.ts
├── event/
│   ├── types.ts
│   └── store.ts
├── telegram/
│   └── bot.ts
├── cognition/
│   ├── llm.ts
│   ├── prompt.ts
│   └── operators.ts
├── memory/
│   ├── topic.ts
│   ├── profile.ts
│   ├── timeline.ts
│   └── working-state.ts
├── summary/
│   └── daily.ts
├── obsidian/
│   └── sync.ts
└── db/
    ├── schema.sql
    └── pool.ts
```

---

## 依赖清单

| 包名 | 用途 |
|------|------|
| grammy | Telegram Bot |
| openai | LLM API |
| pg | PostgreSQL |
| zod | 运行时校验 |
| dotenv | 环境变量 |

## 非依赖（禁止引入）

- 向量数据库
- 图数据库
- Redis（MVP 阶段不需要）
- Docker（部署阶段再引入）
