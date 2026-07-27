# 双机运维 — 参考

## 相关脚本

| 文件 | 说明 |
|------|------|
| `scripts/deploy-hk-server.sh` | `pnpm deploy:hk` → `DEPLOY_HOST=mxm-hk` + `deploy-to-server.sh` |
| `scripts/deploy-to-server.sh` | 本机构建 + rsync dist + pm2 reload |
| `scripts/deploy-admin-china.sh` | 副机 Admin :8080 + 经 `mxm-hk` patch 香港 .env |
| `scripts/deploy-h5-china.sh` | 副机 H5 |
| `scripts/sync-local-businesses-to-production.sh` | **本地库 → 香港生产库**全量业务 upsert（权威方向） |
| `scripts/seed-writing-bundle-production.sh` | 指定 writing JSON → 香港生产库 |
| `scripts/seed-*-bundle-production.sh` | 各 scope 单/多 bundle 写入生产 |
| `scripts/ssh-config-mxm-hk.example` | `~/.ssh/config` 模板（直连 :2222） |
| `scripts/setup-domain-mxm-ai.sh` | DNS 分线路 + 双机 nginx |
| `scripts/setup-ssl-hk.sh` | 香港 Let's Encrypt |
| `scripts/nginx/supermxmai.conf` | 香港 nginx（:80 Admin + API） |
| `scripts/nginx/admin-china-edge.conf` | 副机 Admin :8080 → 香港 :443 |
| `scripts/ecosystem.config.cjs` | pm2 配置 |

## 业务配置更新顺序

1. 改仓库 `mxmcgi/src/tasks/examples/*.business.json`（或 Admin 导出回写仓库）
2. **本地** `pnpm --filter mxmcgi run apply:bundle -- <path>` → 本地 Admin 验收管线
3. 再同步香港：`bash scripts/sync-local-businesses-to-production.sh` 或对应 `seed-*-production.sh`
4. 需要新代码时另跑 `pnpm deploy:hk`

**禁止**：只在香港生产库 / Admin 改业务当源头，本地不 apply。

## SSH 配置模板

```sshconfig
Host mxm-hk
  HostName 8.218.14.129
  User root
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

安装：

```bash
cat scripts/ssh-config-mxm-hk.example >> ~/.ssh/config
ssh mxm-hk 'hostname'
```

## 环境变量

| 变量 | 默认 | 用途 |
|------|------|------|
| `DEPLOY_HOST` | `mxm-hk`（deploy:hk） | rsync/ssh 目标 |
| `DEPLOY_PATH` | `/opt/supermxmai` | 香港应用目录 |
| `HK_SSH` | `mxm-hk` | deploy-admin-china 直连香港 |
| `HK_API_ORIGIN` | `https://mxm-ai.com` | 副机探测香港健康 |
| `ADMIN_PUBLIC_ORIGIN` | `http://8.136.186.242:8080` | 大陆 Admin CORS |
| `OPEN_API_PROXY_TARGET` | `https://mxm-ai.com` | H5 build 反代 |

## 日志

```bash
ssh mxm-hk 'pm2 logs gateway --lines 50'
ssh mxm-hk 'pm2 logs mxmcgi-worker --lines 50'
ssh root@8.136.186.242 'tail -30 /var/log/nginx/error.log'
```

## 香港 .env 关键项

```bash
PUBLIC_GATEWAY_ORIGIN=https://mxm-ai.com
CORS_ORIGIN=https://mxm-ai.com,https://www.mxm-ai.com,http://8.136.186.242:8080,...
REDIS_HOST=localhost
REDIS_ENABLED=true
MINIO_ENDPOINT=127.0.0.1
```

## DNS 分线路（mxm-ai.com）

| 线路 | 记录 | 值 |
|------|------|-----|
| 境外 | A `@` / `www` | `8.218.14.129` |
| 境内 | A `@` / `www` | `8.136.186.242` |

境外 → 香港 :80/:443；境内 Admin → `:8080` 反代香港 API。

## 副机 nginx 站点

- Admin：`/etc/nginx/sites-enabled/admin-china-edge.conf` → listen **8080**，upstream `8.218.14.129:443`
- H5：`/etc/nginx/sites-enabled/eshop-h5-china.conf` → listen **80**

## 首次香港机 / 换 IP 后检查

- [ ] `ssh mxm-hk` 可登录（Port 2222）
- [ ] `ffprobe -version` 存在
- [ ] `pm2 list` 七进程 online
- [ ] `curl http://127.0.0.1:3000/health` OK
- [ ] `https://mxm-ai.com/health` OK（DNS 已指向新 IP）
- [ ] 副机 `http://8.136.186.242:8080/health` OK

## 与旧 skill 关系

| 旧 | 新 |
|----|-----|
| `mxmai-main-server-deploy`（杭州 121.43.32.168） | 用本 skill + `pnpm deploy:hk` |
| 香港 `8.210.129.25` + 副机跳板 SSH | `8.218.14.129:2222` 直连 |
| `mxmai-h5-china-deploy` | 仍有效，`OPEN_API_PROXY_TARGET=https://mxm-ai.com` |

## 已知限制

- 香港 SSH 使用 **2222**（非默认 22）
- 杭州机 `121.43.32.168`、旧香港 `8.210.129.25` 勿再部署
