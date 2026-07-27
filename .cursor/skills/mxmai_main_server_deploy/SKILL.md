---
name: mxmai-main-server-deploy
description: 部署 SuperMXMai 全栈到杭州主力服务器（121.43.32.168）。Gateway + 6 后端 + Admin Web + Nginx。适用于主力机上线、从日本机迁移、pnpm deploy:server。用户提到主力服务器、杭州 ECS、121.43.32.168、全栈部署时使用。
---

# 主力服务器部署（杭州 121.43.32.168）

## 架构

| 节点 | IP | 角色 |
|------|-----|------|
| **主力（杭州）** | `121.43.32.168` | Gateway :3000 + 6 后端 + Admin Web + Nginx :80 |
| **副机（国内）** | `8.136.186.242` | 仅 H5（Next.js :3100），API 反代主力 Gateway |

H5 副机浏览器请求 **同源** `/api/*` → Next.js `rewrites` → `OPEN_API_PROXY_TARGET`（默认 `http://121.43.32.168`）。

## 一键部署（本地）

```bash
# 首次（bootstrap + nginx + .env + pnpm install + 构建发布）
DEPLOY_SSH_PASS='你的root密码' pnpm deploy:server -- --with-setup

# 常规发布（本机构建 dist → rsync → pm2 reload）
pnpm deploy:server

# 仅后端 / 仅 Web
pnpm deploy:server -- --backend-only
pnpm deploy:server -- --web-only
```

环境变量（可选）：

```bash
DEPLOY_HOST=root@121.43.32.168
DEPLOY_PATH=/opt/supermxmai
DEPLOY_SSH_PASS=...          # 新机未配置 SSH 密钥时
```

首次 `--with-setup` 会：

1. 执行 `scripts/bootstrap-server.sh`（Node 22 / pnpm / pm2 / nginx / redis）
2. 安装 Nginx 站点 `scripts/nginx/supermxmai.conf`（Web 静态 + `/api` 反代 Gateway）
3. 同步根目录 `.env`（含 Supabase / R2 / JWT，**勿提交 git**）
4. 服务器 `pnpm install --frozen-lockfile`
5. 写入本机 `~/.ssh/id_ed25519.pub` 到 `authorized_keys`

## 服务器目录

```
/opt/supermxmai/
  .env
  node_modules/
  mxmdata/dist/
  gateway/dist/
  mxmauth/dist/
  mxmpay/dist/
  mxmcgi/dist/
  mxmnotify/dist/
  web/dist/
  scripts/ecosystem.config.cjs
```

pm2 进程：`gateway` `mxmauth` `mxmpay` `mxmcgi-api` `mxmcgi-worker` `mxmnotify`  
Nginx：`/etc/nginx/sites-enabled/supermxmai.conf`

## 验收

```bash
curl -sS http://121.43.32.168/health
curl -sS -o /dev/null -w '%{http_code}\n' http://121.43.32.168/
ssh root@121.43.32.168 'pm2 list; nginx -t'
```

浏览器打开 `http://121.43.32.168/` 应看到 Admin Web。

## 与 H5 副机部署的区别

| 命令 | 目标 | 内容 |
|------|------|------|
| `pnpm deploy:server` | 主力 `121.43.32.168` | mxmdata + 6 后端 + Admin `web/dist` |
| `pnpm deploy:h5-china` | 副机 `8.136.186.242` | 仅 `eshop-agentic-h5` |

主力机迁址后，需重新发布 H5 副机（`OPEN_API_PROXY_TARGET` 指向新 IP）：

```bash
pnpm deploy:h5-china
```

## 故障排查

| 现象 | 处理 |
|------|------|
| SSH Permission denied | 阿里云控制台重置 root 密码，或 `DEPLOY_SSH_PASS=... pnpm deploy:server -- --setup-only` |
| `/health` 502 | `pm2 logs gateway`；检查 `.env` 中 `SUPABASE_URL` / `JWT_SECRET` |
| Web 空白 | `ls /opt/supermxmai/web/dist`；重新 `pnpm deploy:server -- --web-only` |
| 参考图 URL 仍指向旧 IP | 根 `.env` 设 `PUBLIC_GATEWAY_ORIGIN=http://121.43.32.168` 后重载 pm2 |
| Redis 连接失败 | `systemctl status redis-server`；核对 `REDIS_HOST=localhost` |

详细命令见 [reference.md](reference.md)。
