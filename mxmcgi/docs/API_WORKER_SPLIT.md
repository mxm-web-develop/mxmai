# mxmcgi API / Worker / Scheduler 分离

## 进程角色

| `MXMCGI_ROLE` | 入口 | 说明 |
|---------------|------|------|
| `all`（默认） | `src/index.ts` | 开发：同进程 execute + scheduler |
| `api` | `src/index.ts` | 仅 HTTP；Task V2 建任务 `pending`，不 execute |
| `worker` | `src/worker.ts` | Redis 唤醒 + DB claim + `executeTask`；内网 `/internal/tasks/:id/execute` |
| `scheduler` | `src/scheduler.ts` | 单实例：outbox + recovery + storage cleanup |

## 本地开发

```bash
# 全栈（含 gateway 等）
pnpm dev:all-with-web

# 仅后端（api + worker + scheduler）
pnpm dev:all

# 仅 mxmcgi 三进程
pnpm dev:mxmcgi:split

pnpm dev:mxmcgi:api
pnpm dev:mxmcgi:worker
pnpm dev:mxmcgi:scheduler
```

## 任务领取（claim + Redis 唤醒）

1. api `createTask` → `pending` → `RPUSH cgi:task:queue`
2. worker `BLPOP` 唤醒 → Supabase RPC `claim_pending_cgi_tasks`（`SKIP LOCKED`）
3. 无 Redis 或 RPC 未部署时：worker 回退 `listTasks` + **30s** 兜底 poll

**Supabase 迁移**（生产必做）：

```bash
# 推荐：Supabase CLI
supabase db push

# 或 SQL Editor 执行
supabase/migrations/20260616033531_claim_pending_cgi_tasks.sql
```

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `MXMCGI_ROLE` | `all` | 见上表 |
| `MXMCGI_PORT` | `4003` | api 端口 |
| `WORKER_PORT` | `4004` | worker 端口（health + internal API） |
| `SCHEDULER_PORT` | `4006` | scheduler 健康检查 |
| `WORKER_ID` | hostname | claim 写入 `metadata.workerId` |
| `WORKER_MAX_CONCURRENT` | `2` | worker 同时执行任务数 |
| `WORKER_CLAIM_BATCH` | `10` | 每轮 claim 上限 |
| `WORKER_IDLE_POLL_MS` | `30000` | 无 Redis 唤醒时的兜底 poll |
| `WORKER_POLLER_ENABLED` | `true` | Go taskd 接管后设 `false` |
| `WORKER_ORPHAN_STALE_MS` | `60000` | 孤儿任务回收阈值 |
| `TASK_QUEUE_REDIS_KEY` | `cgi:task:queue` | 建任务唤醒队列 |
| `TASK_QUEUE_BLPOP_TIMEOUT_SEC` | `5` | worker BLPOP 超时 |
| `MXMCGI_INTERNAL_TOKEN` | — | worker internal execute 鉴权（生产必设） |
| `REDIS_ENABLED` | — | `true` 启用任务事件总线 + 唤醒队列 |
| `REDIS_HOST` / `REDIS_PORT` | — | 与 mxmauth 同机 Redis |
| `TASK_WAIT_POLL_MS` | `3000` | Agent 无 Redis 时 DB 轮询 |
| `AGENT_TASK_WAIT_TIMEOUT_MS` | `120000` | Agent 等待超时 |

### Redis 配置示例

```bash
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Internal API（Go 铺路）

见 [docs/adr/mxmcgi-internal-task-api.md](../../docs/adr/mxmcgi-internal-task-api.md)

```
POST http://127.0.0.1:4004/internal/tasks/:id/execute
Authorization: Bearer ${MXMCGI_INTERNAL_TOKEN}
```

## 任务实时事件

- 状态变更 → outbox → `mxmnotify` WebSocket
- `Redis PUBLISH cgi:task:{id}` 供 api Agent 等待
- Web/H5：WS 优先；H5 personal Key 活跃任务 HTTP 兜底 **30s**

## 部署建议（生产 pm2）

- `mxmcgi-api`：`MXMCGI_ROLE=api`
- `mxmcgi-worker`：`MXMCGI_ROLE=worker`（单副本或多副本 + claim RPC）
- `mxmcgi-scheduler`：`MXMCGI_ROLE=scheduler`（**仅 1 副本**）

## 可观测

结构化日志（便于 grep / 后续 metrics）：

```text
[task_metric] event=claimed taskId=... queueWaitMs=...
[task_metric] event=execute_finished taskId=... executeMs=...
[task_metric] event=terminal taskId=... status=failed executeMs=...
```
