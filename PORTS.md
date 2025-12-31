# 服务端口配置

## 服务端口列表

| 服务 | 端口 | 环境变量 | 说明 |
|------|------|----------|------|
| **gateway** | 3000 | `PORT` | API 网关，统一入口 |
| **mxmauth** | 4001 | `PORT` | 用户认证服务 |
| **mxmpay** | 4002 | `PORT` | 支付服务 |
| **mxmcgi** | 4003 | `PORT` | 内容生成服务（图片/文本） |
| **mxmagent** | 4004 | `PORT` | 智能体服务 |
| **mxmnotify** | 4005 | `PORT` | 任务和通知服务 |

## Gateway 代理配置

Gateway 通过以下环境变量配置后端服务地址：

```bash
# Gateway 环境变量
MXMAUTH_URL=http://localhost:4001
MXMPAY_URL=http://localhost:4002
MXMCGI_URL=http://localhost:4003
MXMAGENT_URL=http://localhost:4004
MXMNOTIFY_URL=http://localhost:4005
```

## 启动顺序

建议的启动顺序：
1. **mxmdata** (数据库服务，通过 Docker Compose)
2. **mxmauth** (认证服务)
3. **mxmpay** (支付服务，可选)
4. **mxmcgi** (生成服务)
5. **mxmnotify** (通知服务)
6. **gateway** (网关服务，最后启动)

## 快速启动

使用 `pnpm dev:all` 可以同时启动所有核心服务：

```bash
pnpm dev:all
```

这会启动：
- mxmauth (4001)
- mxmpay (4002)
- mxmcgi (4003)
- mxmnotify (4005)
- gateway (3000)

## 端口检查

检查端口是否被占用：
```bash
# 检查所有服务端口
lsof -i :3000  # gateway
lsof -i :4001  # mxmauth
lsof -i :4002  # mxmpay
lsof -i :4003  # mxmcgi
lsof -i :4004  # mxmagent
lsof -i :4005  # mxmnotify
```

## 健康检查

各服务的健康检查端点：
- `http://localhost:3000/health` - gateway
- `http://localhost:4001/health` - mxmauth
- `http://localhost:4002/health` - mxmpay
- `http://localhost:4003/health` - mxmcgi
- `http://localhost:4004/health` - mxmagent
- `http://localhost:4005/health` - mxmnotify
