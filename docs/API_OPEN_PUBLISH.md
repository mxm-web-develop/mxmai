# 开放 API 发布与对接

将已上线的 **Task V2 业务**或 **Smartflow** 登记为稳定 `slug`，第三方使用自己在账号中心创建的 **开放 API 客户端** Key（`key_type: integration`，`Authorization: Bearer mxm_...`）调用。

> **Key 类型**：在 **账号中心 → API 密钥** 创建时选择「开放 API 客户端」。该 Key **仅**可访问 `/api/v1/open/*`；个人自动化 Key 可访问全平台 CGI，也可调用 Open API，但不建议交给第三方。

## 计费（发布者账户）

第三方凭 **自己的 API Key** 鉴权，但 **MXM-TOKEN 从发布者（`owner_user_id`）钱包扣减**，不是从调用方扣费。

- 发布前请保证发布者账户余额充足，否则第三方调用会因余额不足失败。
- 发布者在 Web **账号中心 → 用量统计** 查看近 7/30/90 天全平台用量（Web 自用 + 第三方 Open API），可按来源切换「全部 / 平台自用 / 第三方授权」，并按业务域（写作 Token、生图张数、音视频次数）与 MXM-TOKEN 扣费汇总。
- 在 **API 发布 → 发布管理** 点击某 API 的「统计」，会跳转到账号中心「用量统计」并预选第三方来源与对应 slug。
- 统一事实表：`provider_usage_records`（每次模型 Provider 调用，含 `usage_source`、`mxm_token_charged`）；Open API 边界表 `published_api_usage_events` 仍用于 SLA 钻取，不再作为用户主看板唯一数据源。
- 聚合 API：`GET /api/v1/account/usage/summary?days=7|30|90&source=all|web|open_api`（仪表盘汇总，DB 内 RPC 聚合）
- 明细分页：`GET /api/v1/account/usage/events?days=&source=&scope=&slug=&taskId=&page=&limit=`（每次 Provider 调用一行，账号中心「最近调用」Tab 使用）

## 认证

所有开放接口（含文档）均需认证，与 Web 相同：

```http
Authorization: Bearer mxm_xxxxxxxx
```

在 Gateway 创建 Key：`POST /api/v1/account/api-keys`（需 JWT 登录），Body 示例：`{ "name": "合作方 H5", "keyType": "integration" }`。

## 三步对接

### 1. 获取入参契约（Manifest）

```http
GET /api/v1/open/{slug}
```

响应含 `inputSchema`（发布时冻结的 JSON Schema）、`inputDoc`（示例、字段说明、参考图槽位）、`curlExamples`。

### 2. 发起运行

**Task V2 业务：**

```http
POST /api/v1/open/{slug}/run
Content-Type: application/json

{ "params": { ... } }
```

**Smartflow：**

```http
POST /api/v1/open/{slug}/run
Content-Type: application/json

{ "input_data": { ... } }
```

响应示例：

```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "kind": "task_v2",
    "status": "pending",
    "pollUrl": "/api/v1/open/my-slug/jobs/uuid"
  }
}
```

### 3. 轮询任务状态

```http
GET /api/v1/open/{slug}/jobs/{jobId}
```

建议间隔 2s（见 Manifest `polling.intervalMs`）。长任务为异步，勿同步等待 Gateway 至完成。

**多份生成（`parallel_count`）**：Task V2 异步业务（除 `text`）在 Manifest `inputSchema` 中含平台字段 `parallel_count`（integer，1～99，默认 1）。`parallel_count > 1` 时：

- `POST .../run` 返回的 `jobId` 为**父任务** id；响应可含 `parallel.childTaskIds`。
- 轮询父 `jobId` 时，响应含 `parallel.children`（子任务 id 与 status 摘要）。
- **计费**：发布者钱包按**每个子任务**实际完成扣费；`run` 时余额预检按份数倍增。
- 用量事件：每个子任务各记一条 `published_api_usage_events`（与单次 run 一条相比更准）。

**宫格（`output_grid` 为 `2x2` / `3x3` / `4x4`）**：仍为每子任务 **1 次生图**；任务 `metadata` / 结果可含：

- `grid_prompt_plan`：格数、文案 QA 摘要
- `gridCells`：裁格后的格图 URL 列表（选片）
- `gridPixelQa`：像素相似度检测（`delivery: warning` 时主图仍交付）
- `billing.plannedImageCalls`：固定为 `1`

## 平台内发布

| 操作 | 方法 | 路径 |
|------|------|------|
| 我的发布列表 | GET | `/api/v1/account/published-apis` |
| 用量统计（全部） | GET | `/api/v1/account/published-apis/stats?days=30` |
| 单个 API 统计 | GET | `/api/v1/account/published-apis/:id/stats?days=30` |
| 创建发布 | POST | `/api/v1/account/published-apis` |
| 更新文案 / 重新发布快照 | PUT | `/api/v1/account/published-apis/:id` |
| 仅刷新快照 | POST | `/api/v1/account/published-apis/:id/republish` |
| 下架 | DELETE | `/api/v1/account/published-apis/:id` |

**Task V2 创建 body 示例：**

```json
{
  "slug": "writing-business-ad",
  "kind": "task_v2",
  "title": "广告文案",
  "description": "品牌/产品向文案生成",
  "taskV2Scope": "writing",
  "taskV2TaskKey": "business",
  "taskV2Subtype": "ad"
}
```

**Smartflow 创建 body 示例：**

```json
{
  "slug": "my-flow",
  "kind": "smartflow",
  "title": "我的流程",
  "smartflowId": "smartflow-uuid"
}
```

发布前 Smartflow 建议 `status=active`，且 start 节点已声明 `input`（否则文档注明无工作流级入参）。

## 参考图（Task V2）

若 `inputDoc.referenceImageSlots` 非空：先通过平台上传接口获得 URL，再在 `params` 对应字段传数组（`content` 为 URL 或 data URI）。与 Web 表单 `x-ui-type: referenceImages` 行为一致。

## 错误码

| HTTP | 说明 |
|------|------|
| 401 | 未提供或无效 Token / API Key |
| 400 | 参数 JSON Schema 校验失败（`TASK_VALIDATION_ERROR`） |
| 404 | slug 不存在或已下架 |
| 403 | 查询他人 jobId / Partner slug 未授权 |

## Partner 会话对接（H5 / B2B2C）

第三方 App 不应把 integration Key 放进浏览器。推荐流程：

### 模式 B：平台托管匿名会话（H5）

1. 服务端（或 H5 Next API Route）持 integration Key 调用：

```http
POST /api/v1/partner/sessions/anonymous
X-Partner-Key: mxm_...
X-Device-Id: {stable-device-uuid}
```

2. 响应 `sessionToken`（JWT，`type: partner_session`），客户端后续：

```http
Authorization: Bearer {sessionToken}
POST /api/v1/open/{slug}/run
```

3. 创建 Partner 应用并配置 slug 白名单（JWT 登录）：

```http
POST /api/v1/partner/apps
{ "apiKeyId": "...", "name": "H5", "allowedSlugs": ["graph-taobao-grid"] }
```

### 模式 A：自建后端 HMAC 换票

```http
POST /api/v1/partner/sessions/delegate
Authorization: Bearer mxm_...
X-Partner-Timestamp: {unix}
X-Partner-Signature: HMAC-SHA256(secret, timestamp + body)
X-Partner-Secret: mxmps_...
{ "externalId": "user-123" }
```

### 任务列表（云端）

```http
GET /api/v1/open/jobs?slug=&cursor=&limit=&rootOnly=
Authorization: Bearer {sessionToken}
```

| Query | 说明 |
|-------|------|
| `slug` | 可选，按 slug 过滤 |
| `cursor` | 分页游标（默认 0） |
| `limit` | 每页条数（默认 50） |
| `rootOnly` | `true` 时仅返回 H5「项目根」slug（商拍/海报/视频入口等），**排除** `tools-hd` 等附属任务 |

响应 `jobs[]` 字段：

| 字段 | 说明 |
|------|------|
| `job_id` | 任务 ID |
| `slug` | Open API slug |
| `status` | `pending` / `processing` / `completed` / `failed` |
| `kind` | 业务类型 |
| `title` | 展示标题（run 时从 `displayName` 或请求 label 写入；旧数据可为 null） |
| `created_at` | 创建时间 |
| `completed_at` | 完成时间（未完成时为 null） |

H5 以该接口为列表权威源，IndexedDB 作缓存；详见 `eshop-agentic-h5/docs/DATA_ACCESS.md`。

### 迁移

```bash
pnpm --filter @mxmai/mxmdata run migrate:partner-platform
pnpm build:mxmdata
```

详见 `docs/adr/partner-end-user-phase1.md`。

### 短信登录（H5，已实现）

1. 发码：`POST /api/v1/partner/auth/sms/send`（Header: `X-Partner-Key`）  
   Body: `{ "phone": "13800138000" }`  
   H5 使用短信验证码登录，**不需要**图形验证码（图形验证码仅用于 Web 控制台账户登录/注册，`CAPTCHA_ENABLE=true` 时见 `GET /api/v1/account/captcha`）。
2. 验码登录：`POST /api/v1/partner/auth/sms/verify`  
   Body: `{ "phone", "code", "deviceId?" }` → `sessionToken`  
   若带 `deviceId`，会将匿名终端用户的历史任务合并到手机号用户。
3. **H5 已禁用匿名会话**（`POST /partner/sessions/anonymous` 返回 403）；终端用户须短信登录。
4. 开发环境：根目录 `.env` 设 `PARTNER_SMS_MOCK=true` 时验证码固定 `123456`。
5. 生产（个人）：阿里云 **号码认证 → 短信认证**，`PARTNER_SMS_PROVIDER=aliyun_pnvs`，配置 `ALIYUN_PNVS_*`（见根 `.env.example`）。
6. H5 页面：`/login`；BFF：`/api/h5/partner/auth/sms/*`（Key 仅服务端）。

**发布者查看终端用户**：Admin → 开放 API → **Partner** 页，或 **调用统计 → 按终端用户**；含手机号、调用次数、Token 扣减。API：`GET /api/v1/partner/apps/:id/end-users`、`GET /api/v1/account/published-apis/stats`（`byEndUser` 字段）。

## 数据库

迁移（在项目根目录，需 `SUPABASE_DB_URL` 或 `DATABASE_URL`）：

```bash
pnpm --filter @mxmai/mxmdata run migrate:published-apis
pnpm --filter @mxmai/mxmdata run migrate:published-api-usage
pnpm --filter @mxmai/mxmdata run migrate:published-api-usage-title
pnpm --filter @mxmai/mxmdata run reload-schema
```

对应 SQL：`add_published_apis.sql`、`add_published_api_usage.sql`。修改 mxmdata 代码后另执行：`pnpm build:mxmdata`。

## Admin

`GET /api/v1/system/admin/published-apis` — 全局列表（需管理员）。
