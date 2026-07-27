# ADR: mxmagent 已合并入 mxmcgi（无独立 HTTP 服务）

## 状态

Accepted — 2026-06-09

## 背景

早期规划将 Agent / Smartflow 放在独立包 `mxmagent`（端口 4004）。该包已从 monorepo 移除，能力并入 **mxmcgi**。部分文档、SQL 文件名、通知 `module_type` 仍保留 `mxmagent` 字样，易误导为「还需单独启动一个服务」。

## 决策

### 当前真实架构

| 能力 | 实现位置 | Gateway 路由 |
|------|----------|--------------|
| Task V2 业务生成 | `mxmcgi/src/tasks/` | `/api/v1/cgi/*`、`/api/v2/tasks/*` 等 |
| Smartflow 工作流 | `mxmcgi/src/smartflow/` | `/api/v1/smartflows`、`/api/v1/smartflow-tasks` |
| Agent Chat | `mxmcgi/src/agents/` | `/api/v1/agents`、Agent 相关 CGI 路由 |
| 模型/Prompt 模板 | `mxmcgi` 路由 | `/api/v1/models`、`/api/v1/prompt-templates` |

**不存在** `mxmagent` workspace 包，**不存在** `pnpm dev:mxmagent`，**不存在** `MXMAGENT_URL` 环境变量。

### 端口 4004

`WORKER_PORT=4004` 为 **mxmcgi-worker** 健康检查端口（`MXMCGI_ROLE=worker`），与已废弃的「mxmagent 服务」无关。

### 遗留命名（保留、勿误解）

- **SQL 文件**：`mxmdata/src/database/schemas/mxmagent*.sql` — 历史文件名，表由 mxmcgi Smartflow/Agent 使用
- **通知枚举**：`mxmnotify` 的 `ModuleType.MXMAGENT = 'mxmagent'` — 数据库 `module_type` 兼容值，非独立服务

## 启动与排障

```bash
pnpm dev:all          # gateway + auth + pay + mxmcgi(api+worker) + notify
pnpm dev:all-with-web # 上述 + web 前端
```

- Agent / Smartflow 502：检查 **mxmcgi-api（4003）** 与 **gateway（3000）**，不是 4004
- 异步任务不执行：检查 **mxmcgi-worker（4004 健康检查）** 是否在跑

## 文档维护

新增或更新架构说明时：

1. 勿将 `mxmagent` 列为微服务或 workspace 包
2. Agent/Smartflow 统一写「mxmcgi 内模块」
3. 端口表写 `mxmcgi-api :4003`、`mxmcgi-worker :4004（内网）`
