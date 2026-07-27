# ADR: mxmcgi Internal Task Execute API

## Status

Accepted (Node 铺路阶段；Go `mxm-control` 后续复用)

## Context

`mxmcgi` 已拆分为 `api`（建任务）与 `worker`（执行）。未来 Go control（taskd）需要先 claim 任务，再 dispatch 到 worker 执行，且不应重写 Provider / Task V2 业务逻辑。

## Decision

在 **worker 进程** 暴露内网 HTTP 接口：

```
POST /internal/tasks/:id/execute
Authorization: Bearer ${MXMCGI_INTERNAL_TOKEN}
```

- 实现：[`mxmcgi/src/routes/internal-tasks.ts`](../../mxmcgi/src/routes/internal-tasks.ts)
- 与 poller 共用 `buildExecuteOptionsFromTask` + `taskExecutor.executeTask`
- 生产必须设置 `MXMCGI_INTERNAL_TOKEN`；未设置时非 production 环境允许无 token（本地调试）

### 与 DB claim 协作

1. Go taskd（或 Node poller）调用 Supabase RPC `claim_pending_cgi_tasks(worker_id, limit)`，任务变为 `processing` 且 `metadata.workerId` 写入。
2. taskd `POST /internal/tasks/:id/execute` 触发 worker 执行。
3. 若任务刚 claim（`processing` + `progress=0` + 无 `startedAt`），接口返回 **202 Accepted** 而非 409。

### 响应

| HTTP | code | 说明 |
|------|------|------|
| 202 | — | 已接受，后台 `executeTask` |
| 401 | UNAUTHORIZED | token 无效 |
| 404 | TASK_NOT_FOUND | 任务不存在 |
| 409 | TASK_ALREADY_RUNNING | 已在执行（非刚 claim） |
| 409 | TASK_NOT_EXECUTABLE | completed / cancelled |
| 422 | CANNOT_BUILD_EXECUTE_OPTIONS | 批量父任务等不可执行 |

## Poller 开关

| 变量 | 默认 | 说明 |
|------|------|------|
| `WORKER_POLLER_ENABLED` | `true` | Go 接管 dispatch 后设为 `false`，仅 internal 触发 |

## Consequences

- worker 需内网可达（如 `http://127.0.0.1:4004` 或 M2 内网 IP）
- Go control 与 Node poller **不应** 同时对同一任务 double-dispatch；Go 上线时关闭 poller 或统一由 taskd claim
- 契约稳定后 Go 侧只需 HTTP client，无需复制 execute 逻辑
