# Agent / Smartflow（已并入 mxmcgi）

> **注意**：独立包 `mxmagent` 已不存在。请勿查找 `mxmagent/` 目录或 `pnpm dev:mxmagent`。

## 实现位置（mxmcgi）

| 能力 | 代码路径 |
|------|----------|
| Smartflow 引擎 | `mxmcgi/src/smartflow/` |
| Agent Chat | `mxmcgi/src/agents/` |
| Task V2 | `mxmcgi/src/tasks/` |

## Gateway 路由（均代理到 mxmcgi :4003）

- `/api/v1/agents`
- `/api/v1/smartflows`
- `/api/v1/smartflow-tasks`
- `/api/v1/models`
- `/api/v1/prompt-templates`

## 数据库

Smartflow / Agent 相关表由 `mxmdata` 初始化，SQL 文件仍使用历史命名 `mxmagent*.sql`（见 `mxmdata/src/database/schemas/`）。

## 权威说明

详见 [docs/adr/mxmagent-merged-into-mxmcgi.md](../adr/mxmagent-merged-into-mxmcgi.md)。
