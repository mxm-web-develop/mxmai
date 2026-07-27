---
name: mxmai-dual-server-ops
description: SuperMXMai 双机生产运维：香港主力（8.218.14.129:2222）全栈 + 国内副机（8.136.186.242）Admin/H5 入口。SSH 用 mxm-hk 直连；发布用 pnpm deploy:hk / deploy:admin-china / deploy:h5-china。用户提到香港服务器、副机、mxm-hk、生产发布、运维更新、域名 mxm-ai.com 时使用。
---

# 双机生产运维（香港主力 + 国内副机）

## 架构（当前生产）

| 节点 | IP | SSH | 对外入口 | 职责 |
|------|-----|-----|----------|------|
| **香港主力** | `8.218.14.129` | `ssh mxm-hk`（**Port 2222**，本地直连） | `mxm-ai.com` :80/:443 | Gateway :3000 + 6 后端 + MinIO + Admin 静态（境外） |
| **国内副机** | `8.136.186.242` | `ssh root@8.136.186.242` | `:8080` Admin；`:80` H5 | Admin 反代香港；H5 Next.js |

```
境外用户 Admin  →  https://mxm-ai.com/        →  香港 nginx :80/:443
大陆用户 Admin  →  http://8.136.186.242:8080  →  nginx  →  香港 https://mxm-ai.com/api
大陆用户 H5     →  http://8.136.186.242/       →  Next :3100  →  香港 Gateway
运维 SSH 香港   →  本地 ssh mxm-hk  →  8.218.14.129:2222（无需副机跳板）
```

**旧 IP `8.210.129.25`、`121.43.32.168` 已废弃**，勿再作为部署目标。

## SSH（必读）

### 可用

```bash
ssh mxm-hk                          # 香港主力（推荐，Port 2222）
ssh root@8.136.186.242              # 国内副机
```

`mxm-hk` 定义在 `~/.ssh/config`（模板：`scripts/ssh-config-mxm-hk.example`）：

```sshconfig
Host mxm-hk
  HostName 8.218.14.129
  User root
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
```

### 已废弃

```bash
ProxyJump root@8.136.186.242       # 旧 IP 换机后不再需要跳板
ssh root@8.210.129.25              # 旧香港 IP
```

首次配置：`cat scripts/ssh-config-mxm-hk.example >> ~/.ssh/config`

## 发布命令速查

| 场景 | 命令 |
|------|------|
| **香港全栈**（后端 + Admin dist 到香港） | `pnpm deploy:hk` |
| 仅香港后端 | `pnpm deploy:hk -- --backend-only` |
| 仅香港 Admin 静态 | `pnpm deploy:hk -- --web-only` |
| **国内 Admin 入口**（:8080 + 反代香港 API） | `pnpm deploy:admin-china` |
| **国内 H5** | `pnpm deploy:h5-china` |
| 域名 / nginx 分线路 | `bash scripts/setup-domain-mxm-ai.sh` |
| 跳过构建只同步 dist | 各命令加 `-- --skip-build` |

```bash
DEPLOY_HOST=mxm-hk DEPLOY_PATH=/opt/supermxmai pnpm deploy:server   # 同 deploy:hk
```

## 更新顺序（硬约束）

**永远：本地先改 → 本地验收 → 再同步到香港。禁止在香港直接改业务/库当源头。**

| 层级 | 正确顺序 | 禁止 |
|------|----------|------|
| **代码 / 配置 JSON** | 本地改仓库 → 本地跑通 → `pnpm deploy:hk` | 只在香港机上改 `/opt/supermxmai` 源码 |
| **业务配置（Admin DB）** | 本地 `apply:bundle` 写入本地库 → Admin 看管线/试跑 OK → 再同步生产 | 只往香港生产库 seed，本地库不更新 |
| **Admin 前端** | 本地 `web` 改完验证 → `deploy:admin-china` / `deploy:hk -- --web-only` | 只在服务器上改 dist |

业务配置同步生产（本地库为权威源）：

```bash
# 单业务：先本地导入，再导入生产
cd mxmcgi
pnpm run apply:bundle -- src/tasks/examples/writing-group-seek.business.json   # 本地 Supabase
# 验收：本地 Admin → 业务管理 → 执行管线（应看到人工审核等步骤）
bash scripts/seed-writing-bundle-production.sh   # 或单文件 + MXM_SEED_PRODUCTION=1

# 全量：把本地库已生效的业务导出后 upsert 到香港生产库
bash scripts/sync-local-businesses-to-production.sh [--dry-run]
```

**现象对照**：本地 Admin 管线缺「人工审核」，但仓库 JSON / 香港已有 → 说明**本地 DB 未 apply**，不是前端丢了。按上面先 `apply:bundle` 本地，再考虑是否同步香港。

若发现「香港已更新、本地落后」：以**仓库 JSON + 本地 DB** 为准补齐本地；不要从香港库反向当主源长期依赖。临时对照可用 `ssh mxm-hk` 读文件，修正仍落在本地仓库。

## 标准运维流程

### A. 仅后端 / API / mxmcgi 变更

```bash
pnpm deploy:hk -- --backend-only
ssh mxm-hk 'pm2 list; curl -sS http://127.0.0.1:3000/health'
```

### B. 仅 Admin Web 前端

```bash
pnpm deploy:admin-china
# 境外入口也更新时：
pnpm deploy:hk -- --web-only
```

`deploy:admin-china` 在 `mxm-hk` 可用时会自动 patch 香港 `.env`（无需 `HK_SSH_PASS`）。

### C. 全栈大版本

```bash
pnpm deploy:hk
pnpm deploy:admin-china -- --skip-build
```

### D. H5 变更

```bash
OPEN_API_PROXY_TARGET=https://mxm-ai.com pnpm deploy:h5-china
```

### E. 修改 mxmdata 后

```bash
pnpm build:mxmdata
pnpm deploy:hk -- --backend-only
```

### F. 域名换绑（mxm-ai.com → 新香港 IP）

1. DNS 控制台：境外线路 A 记录 `@` / `www` → `8.218.14.129`
2. 阿里云安全组：放行 TCP 80、443
3. 香港机更新 nginx：`ssh mxm-hk` 同步 `scripts/nginx/supermxmai.conf` 后 `nginx -t && systemctl reload nginx`
4. 副机反代：`scripts/nginx/admin-china-edge.conf` 中 `upstream hk_gateway` 指向 `8.218.14.129:443`
5. 验收：`curl -I https://mxm-ai.com/health`

## 验收清单

```bash
ssh mxm-hk 'pm2 list; nginx -t; curl -sS http://127.0.0.1:3000/health'
curl -sS -o /dev/null -w 'hk %{http_code}\n' https://mxm-ai.com/health
curl -sS -o /dev/null -w 'admin %{http_code}\n' http://8.136.186.242:8080/
```

## 故障排查

| 现象 | 处理 |
|------|------|
| `ssh mxm-hk` 失败 | 确认 `Port 2222`；`nc -zv 8.218.14.129 2222` |
| `deploy:hk` rsync 失败 | `ssh -G mxm-hk` 应含 `hostname 8.218.14.129`、`port 2222` |
| Admin :8080 502 | `ssh root@8.136.186.242 'curl -k https://mxm-ai.com/health'` |
| CORS / 媒体 URL 错 | 香港 `.env` 的 `PUBLIC_GATEWAY_ORIGIN=https://mxm-ai.com` |

## Agent 约束

1. **更新顺序：本地 → 香港**（见上文「更新顺序」）。禁止只改香港业务库/源码、本地不落库。
2. **香港操作一律 `ssh mxm-hk`**（8.218.14.129:2222）
3. **发布香港用 `pnpm deploy:hk`**
4. **Admin 前端变更**：`deploy:admin-china` + 视情况 `deploy:hk -- --web-only`
5. 修改 `mxmdata` 后必须先 `pnpm build:mxmdata` 再 `deploy:hk`
6. **业务 bundle**：先本地 `apply:bundle` 验收，再用 `sync-local-businesses-to-production.sh` 或对应 `seed-*-production.sh` 同步香港

详细命令与 nginx 路径见 [reference.md](reference.md)。
