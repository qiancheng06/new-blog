<!-- 历史参考：本文件位于 99-archive，仅作背景资料，不作为当前实现依据。 -->

# 003 — Docker 部署方案

> 状态：待实现
> 目标：定义 Persona OS 从开发到容器化部署的完整路径

---

## 一、核心原则

### 原则 1：代码进容器，数据出容器

```
Container
├── Code
├── Runtime
└── Dependencies

Host
├── data/
│   ├── sqlite/        ← SQLite 数据库文件
│   ├── uploads/       ← 用户上传文件
│   └── logs/          ← 应用日志
```

容器可以随便删：

```bash
docker rm -f persona-os
```

记忆还在。

因为：

```yaml
volumes:
  - ./data/sqlite:/app/data
  - ./data/uploads:/app/uploads
  - ./data/logs:/app/logs
```

### 原则 2：所有配置环境变量化

禁止在代码里写：

```typescript
const API_KEY = "sk-xxxxx"     // ✗
const TOKEN = "123456"          // ✗
```

必须：

```typescript
process.env.OPENAI_API_KEY     // ✓
process.env.TELEGRAM_TOKEN     // ✓
```

当前 `src/config.ts` 已全部 `process.env`，符合此原则。

Docker 加载方式：

```yaml
services:
  app:
    env_file:
      - .env
```

换模型商（OpenAI → Claude → Gemini）只需改 `.env`，不需要重新构建镜像。

### 原则 3：业务服务和数据服务分离

```
companion/
├── apps/       ← 应用层（API / Bot / Workspace）
├── services/   ← 服务层（Memory / Agent / Scheduler）
├── packages/   ← 共享层（Shared / Events / Tracing）
└── deploy/     ← 部署配置（Docker / Nginx）
```

虽然 MVP 阶段只有**一个容器**，但目录结构从第一天就为多服务预留边界。

### 原则 4：日志结构化管理

不只依赖 `docker logs`（半年后 10 万条日志根本搜不到）。

统一写入：

```
logs/
├── app.log         ← 业务日志
├── api.log         ← API 请求日志
├── trace.log       ← Trace 链路日志
└── error.log       ← 错误日志
```

同时保留 stdout（`docker logs` 依然可用）。

日志格式：

```
[trace_id] [stage] [duration] [status] [detail]
```

实现方式：观测流中的 `TraceRepository` 写入 `monitor_events` 表，同时可配置同步到日志文件。

### 原则 5：健康检查

每个服务提供：

```
GET /health
```

返回：

```json
{
  "status": "ok",
  "uptime": 3600,
  "checks": {
    "telegram": "ok",
    "llm": "ok",
    "database": "ok"
  }
}
```

Docker Compose 使用：

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
  interval: 30s
  timeout: 5s
  retries: 3
```

Workspace 可直接读取 `/health` 用于仪表板。

### 原则 6：每个请求带 Trace ID

收到消息时生成 `trace_id`（即 `event_id`），后续所有阶段携带：

```
[abc123] telegram_receive
[abc123] event_store
[abc123] api_request
[abc123] api_response
[abc123] reply_sent
```

排错时：

```bash
grep "abc123" logs/trace.log
```

整条链路一目了然。

### 原则 7：Docker 不是架构

```
业务流     → 先设计
记忆流     → 先设计
观测流     → 先设计
模块边界   → 先设计
───────
Docker     → 最后加
```

Docker 只是部署方式，不是架构设计。

---

## 二、什么东西该进容器 vs 不该进

### 适合进容器的

| 模块 | 原因 |
|------|------|
| API 服务（Companion/Express） | 无状态，可随意启停 |
| Telegram Bot | 无状态（数据库在容器外） |
| Workspace（Web UI） | 静态资源 + API 代理 |
| Memory Worker | 后台任务，可独立扩缩 |
| Qdrant（Phase 2+） | 官方镜像，数据挂 volume |
| Scheduler（Phase 2+） | 定时任务，无状态 |

### 不适合放代码里的

| 类型 | 正确做法 |
|------|---------|
| SQLite 数据库 | 映射 `./data/sqlite:/app/data` |
| Qdrant 数据 | 映射 `./data/qdrant:/qdrant/storage` |
| 上传文件 | 映射 `./data/uploads:/app/uploads` |
| 日志 | 映射 `./data/logs:/app/logs` |
| 敏感配置 | 通过 `.env` 或环境变量注入 |

---

## 三、需要提前规避的设计陷阱

### 陷阱 1：到处读写本地文件

```typescript
// 不要
const data = fs.readFileSync("./memory.json")

// 要
// 所有文件操作统一走 storage 抽象层
```

### 陷阱 2：全局变量存状态

```typescript
// 不要
const activeUsers = new Map()  // 重启丢失

// 要
// 所有持久化状态写入数据库或文件存储
```

### 陷阱 3：定时线程嵌在业务进程里

```typescript
// 不要
setInterval(() => { /* 每日总结 */ }, 86400000)

// 要
// 定时任务作为独立服务（scheduler）运行
```

### 陷阱 4：Telegram 和业务逻辑耦合

```typescript
// 不要
bot.on("message", () => {
  db.query(...)        // 直接操作数据库
  llm.call(...)        // 直接调用 AI
  memory.save(...)     // 直接存记忆
})

// 要
bot.on("message", () => {
  api.send("/chat", message)  // 只转发到 API
})
```

---

## 四、目录结构（最终形态）

```
companion/
├── apps/                 ← 应用层
│   ├── api               ← 核心 API 服务
│   ├── workspace         ← Workspace Web UI
│   └── telegram          ← Telegram Bot 适配层
├── services/             ← 服务层
│   ├── memory            ← 记忆服务（提取/嵌入/召回）
│   ├── agent             ← Agent Runtime
│   └── scheduler         ← 定时任务
├── packages/             ← 共享层
│   ├── shared            ← 公共类型/RPC 契约
│   ├── tracing           ← 链路追踪工具
│   └── events            ← Event 定义/验证
├── storage/              ← 文件存储（非代码）
│   └── uploads
├── deploy/               ← 部署配置
│   ├── docker-compose.yml
│   └── nginx.conf
├── data/                 ← 运行时数据（不入 git）
│   ├── sqlite
│   ├── qdrant
│   └── logs
├── docs/
└── src/                  ← 当前 MVP 代码（后续迁移到 apps/ + services/）
```

---

## 五、分阶段部署演进

> 阶段划分与 `007-roadmap.md` 对齐。Docker 部署本身不是验收条件，但各阶段建议度不同。

### Phase 0：可选（当前）

单容器部署，不阻塞验收。参考 `docker-compose.yml` 即可。核心验收标准仍是 TG → Event → Companion → SQLite 稳定运行 30 天。

```
services:
  companion    # 单容器，含 Bot + API + Memory
```

```yaml
services:
  companion:
    build: .
    restart: always
    volumes:
      - ./data/sqlite:/app/data
      - ./.env:/app/.env:ro
    ports:
      - "127.0.0.1:3001:3001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
```

### Phase 1：推荐

记忆流跑通后，Workspace 和 Memory Worker 适合分别容器化。

```
services:
  companion
  workspace    # Web UI 仪表板
```

### Phase 2：必须

认知流建立后，多服务协作（Companion + Insight + Novelty + Qdrant），容器化成为硬需求。

```
services:
  companion
  workspace
  insight-worker    # Insight + Novelty 异步分析
  scheduler         # 每日总结 / 记忆整理
  qdrant            # 向量库
```

### Phase 3：多端协同（远期）

```
Android App
     │
     ▼
  Companion API
     │
     ├── Memory Service
     ├── Agent Runtime
     └── Qdrant
```

Telegram Bot 继续存在。Android 直接访问 API。

---

## 六、从当前代码到容器化

### 当前状态

```
src/
├── index.ts
├── config.ts
├── db/
├── event/
├── telegram/
├── cognition/
├── repository/     ← 即将引入
├── monitor/        ← 即将引入
data/
├── persona-os.db
deploy/             ← 尚未创建
```

### 容器化 Checklist

- [ ] Repository 层就位（业务代码不再直接调 SQLite）
- [ ] 观测流就位（`/health` 端点 + Trace）
- [ ] 日志统一输出到 `data/logs/`
- [ ] 全局状态清理（当前 WorkingState 在内存中，迁移到数据库）
- [ ] 定时任务从 `index.ts` 中拆出
- [ ] Telegram 逻辑确认只做协议转换
- [ ] `Dockerfile` 编写（node:22-slim）
- [ ] `docker-compose.yml` 编写
- [ ] 端到端验证

### Dockerfile

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

> 注意：`better-sqlite3` 需要 C++ 编译链。`node:22-slim`（Debian 系）自带 `gcc`，无需额外安装。最终镜像约 150MB。

---

## 七、不涉及的

- 不引入 K8s（个人项目不需要）
- 不引入 Docker Swarm（docker-compose 足够）
- 不引入 CI/CD（手动 build + deploy 即可）
- 不引入 Postgres（MVP 保持 SQLite）
- 不引入 Redis（架构不变原则禁止）

---

## 八、总结

容器化的前提条件不是 Dockerfile，而是**模块边界**。

当前代码已经满足：
- ✅ 配置环境变量化（`config.ts`）
- ✅ 数据目录分离（`data/`）
- ✅ Event 驱动架构（`event/`）

还需要补齐：
- ⬜ Repository 层（业务 ↔ 数据库解耦）
- ⬜ 观测流（健康检查 + Trace）
- ⬜ 全局状态持久化
- ⬜ 定时任务独立

这些补齐后，容器化就是一个 Dockerfile + docker-compose.yml 的工作量。
