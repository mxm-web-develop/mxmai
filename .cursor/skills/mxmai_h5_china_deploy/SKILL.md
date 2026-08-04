---
name: mxmai-h5-china-deploy
description: 部署 eshop-agentic-h5 到国内副服务器（8.136.186.242）。适用于 H5 上线、Nginx+pm2+Next 发布、API 反代杭州主力 Gateway。用户提到 H5 副机、国内 H5、eshop-agentic-h5、8.136.186.242 时使用。
---

# 国内 H5 副机部署（eshop-agentic-h5）

> ⚠️ **2026-07-28 状态**：本副机上的 supermxmai Admin Web 已停同步。**H5 继续在线**（`:80`），`pnpm deploy:h5-china` 正常。

## 架构

| 节点 | IP | 角色 |
|------|-----|------|
| **主力（杭州）** | `121.43.32.168` | 全量后端 Gateway :3000 + Admin Web |
| **副机（国内）** | `8.136.186.242` | **仅 H5**（Next.js :3100 + Nginx :80）；Admin 已停 |

H5 浏览器请求 **同源** `/api/*` → Next.js `rewrites` → `OPEN_API_PROXY_TARGET`（默认杭州主力 Gateway）。避免国内页直连产生 CORS。

## 一键部署（本地）

```bash
# 首次（装 Node 22 / pnpm / pm2 / nginx）
pnpm deploy:h5-china -- --with-setup

# 常规发布
pnpm deploy:h5-china
```

环境变量（可选）：

```bash
DEPLOY_HOST=root@8.136.186.242
DEPLOY_PATH=/opt/eshop-agentic-h5
OPEN_API_PROXY_TARGET=http://121.43.32.168
H5_ENV_FILE=eshop-agentic-h5/.env   # 含 MXMTOKEN，勿提交 git
```

构建前确保 `eshop-agentic-h5/.env` 存在（参考 `.env.production.example`）。

主力机 IP 变更后必须重新 `pnpm deploy:h5-china` 构建（`rewrites` 在 build 时写入）。

## 停掉副机旧服务

副机曾跑 **zencheck**（Docker 占 80）和 **ai-models-manager-platform**（18081）。发布 H5 前需释放 80：

```bash
ssh root@8.136.186.242 'cd /opt/zencheck && docker compose down'
ssh root@8.136.186.242 'docker stop ai-models-manager-platform && docker rm ai-models-manager-platform'
```

验收：`ss -tlnp | grep ':80 '` 应无输出或仅 nginx。

## 服务器目录

```
/opt/eshop-agentic-h5/
  .next/              # 构建产物
  public/
  package.json
  ecosystem.config.cjs
  .env.production.local   # OPEN_API_PROXY_TARGET（deploy 写入）
```

pm2 进程名：`eshop-h5`  
Nginx 配置：`/etc/nginx/sites-enabled/eshop-h5-china.conf`

## 验收

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://8.136.186.242/
ssh root@8.136.186.242 'pm2 list; nginx -t; curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/'
```

浏览器打开 `http://8.136.186.242/`，在「设置」确认 API 模式为 http、Key 已配置。

## 与主力全栈部署的区别

| 命令 | 目标 | 内容 |
|------|------|------|
| `pnpm deploy:server` | 主力 `121.43.32.168` | mxmdata + 6 后端 + Admin `web/dist` |
| `pnpm deploy:h5-china` | 副机 `8.136.186.242` | 仅 `eshop-agentic-h5` |

勿在 H5 副机跑 `deploy:server`。

## 故障排查

| 现象 | 处理 |
|------|------|
| 80 被占用 | `docker ps` → `docker compose down` |
| `/api` 502 | 主力 Gateway 是否 online；`OPEN_API_PROXY_TARGET` 是否可达 |
| 401 / Key 无效 | 更新 `MXMTOKEN` 后重新 `pnpm deploy:h5-china` 构建 |
| pm2 重启循环 | `pm2 logs eshop-h5`；检查 Node ≥22、`npm install` 是否成功 |

详细命令与回滚见 [reference.md](reference.md)。
