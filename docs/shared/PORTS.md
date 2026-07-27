# 服务端口配置

## 服务端口列表

| 服务 | 端口 | 环境变量 | 说明 |
|------|------|----------|------|
| **gateway** | 3000 | `GATEWAY_PORT` | API 网关，统一入口 |
| **mxmauth** | 4001 | `MXMAUTH_PORT` | 用户认证服务 |
| **mxmpay** | 4002 | `MXMPAY_PORT` | 支付服务 |
| **mxmcgi-api** | 4003 | `MXMCGI_PORT` | 内容生成 API（含 Agent/Smartflow） |
| **mxmcgi-worker** | 4004 | `WORKER_PORT` | 异步任务 worker（`MXMCGI_ROLE=worker`） |
| **mxmnotify** | 4005 | `MXMNOTIFY_PORT` | 任务和通知服务 |

> 端口 4004 为 **mxmcgi-worker**，不是已废弃的独立 `mxmagent` 服务。见 `docs/adr/mxmagent-merged-into-mxmcgi.md`。

## Gateway 代理配置

```bash
GATEWAY_PORT=3000
MXMAUTH_URL=http://localhost:4001
MXMPAY_URL=http://localhost:4002
MXMCGI_URL=http://localhost:4003
MXMNOTIFY_URL=http://localhost:4005
```

## 启动顺序

1. **mxmdata** 构建（`pnpm build:mxmdata`）
2. **mxmauth**、**mxmpay**、**mxmcgi-api**、**mxmcgi-worker**、**mxmnotify**
3. **gateway**（最后对外）

## 快速启动

```bash
pnpm dev:all
```

这会启动：mxmauth (4001)、mxmpay (4002)、mxmcgi api (4003)、mxmcgi worker (4004)、mxmnotify (4005)、gateway (3000)。

## 端口检查

```bash
lsof -i :3000  # gateway
lsof -i :4001  # mxmauth
lsof -i :4002  # mxmpay
lsof -i :4003  # mxmcgi-api
lsof -i :4004  # mxmcgi-worker
lsof -i :4005  # mxmnotify
```

## 健康检查

- `http://localhost:3000/health` — gateway
- `http://localhost:4001/health` — mxmauth
- `http://localhost:4002/health` — mxmpay
- `http://localhost:4003/health` — mxmcgi-api
- `http://localhost:4004/health` — mxmcgi-worker
- `http://localhost:4005/health` — mxmnotify
