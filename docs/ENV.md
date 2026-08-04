# 环境变量（统一根目录 `.env`）

全 monorepo **只维护一份**环境变量：项目根目录的 `.env`（可选 `.env.local` 覆盖本地差异，已 gitignore）。

## 快速开始

```bash
cp .env.example .env
# 编辑 .env，填入 Supabase、JWT、Redis、MinIO、各 API Key 等
pnpm dev:all-with-web
```

## 架构说明

独立包 `mxmagent` **已不存在**；Agent / Smartflow 在 **mxmcgi**（4003），worker 在 4004。详见 [docs/adr/mxmagent-merged-into-mxmcgi.md](./adr/mxmagent-merged-into-mxmcgi.md)。

## 加载方式

各服务启动时调用 `loadMonorepoEnv()`（来自 `@mxmai/mxmdata`）：

| 服务 | 入口 |
|------|------|
| mxmauth | `mxmauth/src/config/loadEnv.ts` |
| mxmcgi api/worker | `mxmcgi/src/bootstrap-env.ts` |
| gateway | `gateway/src/index.ts` |
| mxmnotify | `mxmnotify/src/index.ts` |
| mxmpay | `mxmpay/src/config/env.ts` |

脚本 / 种子任务：

```typescript
import { loadMonorepoEnv } from '@mxmai/mxmdata';
loadMonorepoEnv();
```

## 端口（重要）

统一 `.env` 后 **不要** 使用单一的 `PORT=`，否则所有服务会抢同一端口。

在根 `.env` 中配置：

```bash
GATEWAY_PORT=3000
MXMAUTH_PORT=4001
MXMPAY_PORT=4002
MXMCGI_PORT=4003
WORKER_PORT=4004
SCHEDULER_PORT=4006
MXMNOTIFY_PORT=4005
PPTX_COMPILER_PORT=4010
PPTX_COMPILER_URL=http://127.0.0.1:4010
```

### mxmcgi 调度（api / worker / scheduler）

| 变量 | 默认 | 说明 |
|------|------|------|
| `MXMCGI_ROLE` | `all` | `api` / `worker` / `scheduler` |
| `WORKER_ID` | hostname | claim → `metadata.workerId` |
| `WORKER_IDLE_POLL_MS` | `30000` | 兜底 poll |
| `TASK_QUEUE_REDIS_KEY` | `cgi:task:queue` | 建任务唤醒 worker |
| `MXMCGI_INTERNAL_TOKEN` | — | worker internal execute 鉴权 |

### PPTX 编译微服务（writing/group/deck）

独立 FastAPI 服务，默认端口 **4010**。`renderPptx` 通过 HTTP 异步提交 job 并轮询下载；未配置 URL 时回退本地 `spawn` CLI。

| 变量 | 默认 | 说明 |
|------|------|------|
| `PPTX_COMPILER_URL` | `http://127.0.0.1:4010` | 同机默认；设为空字符串则强制本地 spawn |
| `PPTX_COMPILER_API_TOKEN` | — | 可选 Bearer，与服务端同值 |
| `PPTX_COMPILER_POLL_MS` | `500` | 轮询间隔 |
| `PPTX_COMPILER_TIMEOUT_MS` | `180000` | 单次编译超时 |
| `PPTX_COMPILER_PORT` | `4010` | 服务端监听端口 |
| `PPTX_COMPILER_WORKERS` | `4` | 服务端线程池并发数 |
| `PPTX_COMPILER_JOB_TTL_SEC` | `3600` | 内存 job 保留时长 |
| `PPTX_PYTHON_BIN` | `python3` | 仅 spawn 兜底用 |

启动：`pnpm dev:pptx-compiler`（见根 `package.json`）。详见 `mxmcgi/tools/pptx-compiler/NOTICE.md`。

Supabase RPC：`supabase/migrations/20260616033531_claim_pending_cgi_tasks.sql`（Cloud 已应用）。详见 [mxmcgi/docs/API_WORKER_SPLIT.md](../mxmcgi/docs/API_WORKER_SPLIT.md)。

## 三块对象存储

每块可独立配置 provider（`minio` / `r2` / `aliyun_oss`）、bucket、access。详见 [docs/adr/storage-domains.md](./adr/storage-domains.md)。

**MinIO 三桶（与香港主力一致；桶名禁止下划线）：**

```bash
CGI_STORAGE_BUCKET=aigc
STORAGE_GENERATED_PROVIDER=minio
STORAGE_GENERATED_BUCKET=aigc
STORAGE_GENERATED_ACCESS=proxy
STORAGE_USER_UPLOAD_PROVIDER=minio
STORAGE_USER_UPLOAD_BUCKET=user-assets
STORAGE_USER_UPLOAD_ACCESS=public
STORAGE_SYSTEM_STATIC_PROVIDER=minio
STORAGE_SYSTEM_STATIC_BUCKET=system-assets
STORAGE_SYSTEM_STATIC_ACCESS=public
PUBLIC_GATEWAY_ORIGIN=http://localhost:3000
PUBLIC_GATEWAY_ABSOLUTE_URLS=1
```

用户上传路径仍为 `upload/{userId}/{purpose}/...`（桶内前缀，非按用户分桶）。旧 R2 数据若仍需双读，可另配 `R2_*`（一般本地开发不再需要）。

**参考图外网可读（大模型 Provider）** — 通过 `STORAGE_USER_UPLOAD_ACCESS` 切换：

| 模式 | 适用 | 参考图 URL |
|------|------|------------|
| `proxy` | 需 JWT 的 UI | `/api/v1/media/object/{id}` |
| `public`（推荐，与香港一致） | MinIO + Gateway | `{PUBLIC_GATEWAY_ORIGIN}/api/v1/media/public/object/{id}` |
| `presigned` | MinIO/S3 预签名直链 | 带过期时间的 GET URL |

香港 / 本地 MinIO 推荐即上表默认配置；生产将 `PUBLIC_GATEWAY_ORIGIN` 设为 `https://mxm-ai.com`。

**自动检查/创建对象存储桶**（按 `STORAGE_*_PROVIDER` 使用对应凭证：MinIO / R2 / 阿里云 OSS）：

```bash
pnpm ensure:buckets
```

读取三块 `STORAGE_*_BUCKET`，在各自 backend 上 `HeadBucket` / `CreateBucket`；R2 桶名禁止下划线（用 `user-assets` 而非 `user_assets`）。

迁移：

```bash
pnpm --filter @mxmai/mxmdata run migrate:storage-objects
pnpm --filter @mxmai/mxmdata run migrate:storage-object-asset-fields
```

用户上传临时桶（可选，与 `user-assets` 分离）：

```bash
STORAGE_USER_TEMP_BUCKET=user-temp
STORAGE_USER_TEMP_PROVIDER=r2
STORAGE_USER_TEMP_TTL_DAYS=7
STORAGE_OBJECT_CLEANUP_INTERVAL_MS=3600000
```

## 认证：SMTP / OAuth（mxmauth）

| 变量 | 说明 |
|------|------|
| `APP_PUBLIC_URL` | 前端公网地址，邮件链接与 OAuth 回跳目标 |
| `OAUTH_REDIRECT_BASE` | OAuth 回调经 Gateway 的基址（如 `https://mxm-ai.com`） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | 发信 SMTP |
| `MAIL_FROM` | 发件人，需与邮件服务商已验证发信地址一致 |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth Web 客户端 |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App |
| `MFA_ENCRYPTION_KEY` | TOTP 密钥加密（可选，默认回退 `JWT_SECRET`） |
| `MFA_TOTP_ISSUER` | 验证器显示名，默认 `SuperMXM` |
| `MFA_CHALLENGE_TTL_SEC` | 登录 MFA 挑战有效期秒数，默认 `300` |
| `MFA_MAX_ATTEMPTS` | TOTP 校验限流次数（5 分钟窗口），默认 `5` |

回调 URI（控制台配置）：

- `{OAUTH_REDIRECT_BASE}/api/v1/account/oauth/google/callback`
- `{OAUTH_REDIRECT_BASE}/api/v1/account/oauth/github/callback`

库表迁移：

- `supabase/migrations/20260716010000_add_auth_oauth_email.sql`（`email_verified_at`、`oauth_identities`、`auth_email_tokens`）
- `supabase/migrations/20260716030000_add_user_mfa_totp.sql`（`mfa_totp_enabled`、`user_mfa_totp`）

## 从多份 `.env` 迁移

若你仍在使用 `mxmdata/.env`、`mxmcgi/.env` 等，可一键合并到根目录：

```bash
node scripts/merge-env-to-root.mjs
```

合并后请 **重启所有服务**。启动时若仍存在模块级 `.env`，会打印弃用警告。

合并完成后可删除（或重命名为 `.env.bak`）：

- `mxmdata/.env`
- `mxmcgi/.env`
- `mxmauth/.env`
- `gateway/.env`
- `mxmpay/.env`

## 文件说明

| 文件 | 说明 |
|------|------|
| `.env` | 主配置（勿提交 git） |
| `.env.local` | 本机覆盖（勿提交 git） |
| `.env.test` | 本地 test 环境，连主服务器 Supabase + MinIO（勿提交 git） |
| `.env.test.local` | test 环境本机覆盖（勿提交 git） |
| `.env.example` | 模板，按模块分段注释 |
| `.env.test.example` | test 环境模板 |
| `*/.env.example` | 已弃用，仅指向根目录 |

## 本地 test 环境

本机跑后端、连接**主服务器（121.43.32.168）**的 Supabase 与 MinIO，用于真实数据联调。与日常 `.env` 本地 dev **隔离**（通过 `MXM_ENV=test` 加载 `.env.test`，不读 `.env`）。

### 快速开始

```bash
# 1. 从主服务器拉取 Supabase / MinIO / JWT 等到 .env.test（需 SSH）
pnpm setup:env:test

# 2. 启动 MinIO 隧道 + 全后端
pnpm dev:test
```

仅建 MinIO 隧道（不启后端）：

```bash
pnpm tunnel:test
```

### 原理

| 组件 | test 环境行为 |
|------|----------------|
| **Supabase** | 直连云端（与主服务器相同 URL / Key） |
| **MinIO** | 主服务器仅监听 `127.0.0.1:9000`；本地 SSH 隧道映射到 `127.0.0.1:19000` |
| **Redis** | 本机 `localhost:6379`（任务队列 / 验证码，不连远端） |
| **Gateway / 各服务** | 本机端口 3000 / 4001–4006 |
| **媒体 URL** | `PUBLIC_GATEWAY_ORIGIN=http://localhost:3000`，存储 `access=proxy` |

可选环境变量：

```bash
DEPLOY_HOST=root@121.43.32.168      # 主服务器 SSH
DEPLOY_SSH_PASS=...                 # 未配置密钥时
MINIO_TUNNEL_LOCAL_PORT=19000       # 隧道本机端口（默认 19000，避免与本地 MinIO 9000 冲突）
```

### 注意事项

- **操作的是生产数据**：写入任务、上传文件会落到主库与 MinIO，请谨慎测试。
- `MXM_ENV` 由 shell / `pnpm dev:test` 设置，**不要**写入 `.env` 文件。
- 覆盖项可写入 `.env.test.local`（已 gitignore）。
- 修改 `loadMonorepoEnv` 或 `.env.test` 后需**重启**所有后端进程。
