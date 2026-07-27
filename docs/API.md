# 后端 API 接口文档

> 本文档描述通过 Gateway 暴露的所有后端接口。前端请求统一发往 Gateway（如 `http://localhost:3000`），路径前缀为 `/api/v1/`。

---

## 通用数据结构

### User（用户，不含密码）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 用户 UUID |
| username | string | 用户名 |
| email | string? | 邮箱 |
| phone | string? | 手机号 |
| avatar_url | string? | 头像 URL |
| level | number | 等级 |
| balance | number | 余额 |
| membership_type | string | `free` \| `pro` \| `premium` |
| membership_expires_at | string? | 会员过期时间 ISO8601 |
| status | string | `active` \| `suspended` \| `banned` |
| role | string? | `user` \| `admin` |
| created_at | string | ISO8601 |
| updated_at | string | ISO8601 |

### Tokens（令牌）

| 字段 | 类型 | 说明 |
|------|------|------|
| accessToken | string | 访问令牌，请求头 `Authorization: Bearer {accessToken}` |
| refreshToken | string | 刷新令牌，用于 `POST /api/v1/account/refresh-token` |
| expiresIn | number | 访问令牌有效期（秒） |

### Pagination（分页）

| 字段 | 类型 | 说明 |
|------|------|------|
| page | number | 当前页 |
| limit | number | 每页条数 |
| total | number | 总条数 |
| totalPages | number | 总页数 |

---

## 认证说明

### 请求头

已登录用户的请求需携带 JWT：

```
Authorization: Bearer <access_token>
```

Gateway 校验 JWT 后，会将 `x-user-id`、`x-username` 透传给下游服务。

### 认证豁免接口

以下接口**无需**认证即可访问：

| 路径 | 说明 |
|------|------|
| `GET /api/v1/account/captcha` | 获取验证码 |
| `POST /api/v1/account/register` | 用户注册 |
| `POST /api/v1/account/login` | 用户登录 |
| `POST /api/v1/account/refresh-token` | 刷新 Token |
| `GET /api/v1/account/health` | 账户服务健康检查 |

### Admin 权限说明

部分接口需要 **Admin 角色**（`users.role === 'admin'`）：

- `GET /api/v1/system/admin/stats` - 系统统计
- `GET /api/v1/cgi-tasks/admin` - 管理员查询所有任务
- `GET/PUT /api/v1/system/prompt-config/*` - 提示词工程配置
- `PUT /api/v1/account/admin/user_profile` - 管理员更新用户
- `GET /api/v1/account/admin/users` - 管理员查看用户列表
- `PUT /api/v1/account/admin/users/:id/status` - 管理员封禁/解封用户
- `POST /api/v1/account/admin/users/:id/force-logout` - 管理员强制登出
- `GET /api/v1/payment/admin/orders` - 管理员查询所有支付订单
- `POST /api/v1/payment/admin/voucher/issue` - 管理员发放代金券
- `GET /api/v1/knowledge/admin/public-bases` - 公用知识库列表
- `GET /api/v1/knowledge/admin/defaults` - 默认知识库绑定列表
- `PUT /api/v1/knowledge/admin/defaults` - 设置默认知识库
- `DELETE /api/v1/knowledge/admin/defaults/:scope/:category/:subType` - 移除默认绑定

---

## 一、账户与认证 (mxmauth → /api/v1/account)

### 1.1 获取验证码

```
GET /api/v1/account/captcha
```

**权限**：无需认证

**请求参数**：无

**返回示例**：

```json
{
  "code": 200,
  "message": "验证码生成成功",
  "data": {
    "id": "captcha-uuid",
    "image": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

| 返回字段 | 类型 | 说明 |
|----------|------|------|
| data.id | string | 验证码 ID，提交时需携带（若启用验证） |
| data.image | string | base64 图片，可直接用于 `<img src="...">` |

---

### 1.2 用户注册

```
POST /api/v1/account/register
```

**权限**：无需认证（启用验证码时需先调用 captcha）

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |
| email | string | 条件 | 邮箱，与 phone 至少填一个 |
| phone | string | 条件 | 手机号，与 email 至少填一个 |

**返回示例**：

```json
{
  "code": 201,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "username": "john",
      "email": "john@example.com",
      "phone": null,
      "avatar_url": null,
      "level": 0,
      "balance": 0,
      "membership_type": "free",
      "membership_expires_at": null,
      "status": "active",
      "role": "user",
      "created_at": "2025-02-12T00:00:00.000Z",
      "updated_at": "2025-02-12T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 86400
    },
    "wallet": { "asset_code": "CNY", "balance": "0", ... }
  }
}
```

---

### 1.3 用户登录

```
POST /api/v1/account/login
```

**权限**：无需认证

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 条件 | 用户名，与 email/phone 至少填一个 |
| email | string | 条件 | 邮箱 |
| phone | string | 条件 | 手机号 |
| password | string | 是 | 密码 |

**返回示例**：

```json
{
  "code": 200,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "username": "john",
      "email": "john@example.com",
      "avatar_url": null,
      "level": 0,
      "membership_type": "free",
      "status": "active",
      "role": "user"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 86400
    }
  }
}
```

---

### 1.4 退出登录

```
POST /api/v1/account/logout
```

**权限**：需认证

**返回**：

```json
{ "code": 200, "message": "Logout successful" }
```

---

### 1.5 刷新 Token

```
POST /api/v1/account/refresh-token
```

**权限**：无需认证

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refresh_token | string | 是 | 登录/注册时返回的 refreshToken |

**返回示例**：

```json
{
  "code": 200,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400
  }
}
```

---

### 1.6 获取当前用户信息

```
GET /api/v1/account/profile
```

**权限**：需认证

**请求参数**：无

**返回**：用户信息。若 mxmpay 可用，会合并 `primaryBalance: { assetCode, availableBalance }`（主钱包余额）。

**返回示例**：

```json
{
  "code": 200,
  "data": {
    "id": "uuid",
    "username": "john",
    "email": "john@example.com",
    "phone": null,
    "avatar_url": null,
    "level": 0,
    "balance": 0,
    "membership_type": "free",
    "primaryBalance": { "assetCode": "CNY", "availableBalance": "100.00" },
    "membership_expires_at": null,
    "status": "active",
    "role": "user",
    "created_at": "2025-02-12T00:00:00.000Z",
    "updated_at": "2025-02-12T00:00:00.000Z"
  }
}
```

---

### 1.7 更新用户资料

```
PUT /api/v1/account/profile
```

**权限**：需认证

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| avatar_url | string | 是 | 头像 URL，可为空字符串清除头像 |

**说明**：目前仅支持修改 `avatar_url`。

**返回示例**：

```json
{
  "code": 200,
  "message": "Profile updated successfully",
  "data": {
    "id": "uuid",
    "username": "john",
    "avatar_url": "https://...",
    "email": "john@example.com"
  }
}
```

---

### 1.8 更新用户媒体资源

```
PUT /api/v1/account/updateMedia
```

**权限**：需认证

**请求 Body**：数组，每项结构如下：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 业务类型：`photo` \| `video` \| `music` \| `illustration` \| `text` \| `voice` |
| assets_type | string | 是 | MIME 类型：`image/jpeg` \| `audio/mpeg` \| `video/mp4` 等 |
| label | string | 是 | 显示名称（如「封面图」） |
| url | string | 是 | MinIO 路径或完整 URL |
| id | string | 是 | 生成任务 ID（task_id） |
| description | string | 否 | 描述 |
| prompts_meta | string | 否 | JSON 字符串，生成参数如 `{"prompt":"...","seed":42}` |

**返回示例**：

```json
{
  "code": 200,
  "message": "Media updated successfully",
  "data": {
    "userId": "uuid",
    "mediaCount": 3,
    "items": [{ "type": "photo", "label": "封面图", "url": "...", "id": "task-123" }]
  }
}
```

---

### 1.9 获取媒体列表

```
GET /api/v1/account/media?type=&page=1&limit=20
```

**权限**：需认证

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 筛选类型：photo/video/music/illustration/text/voice |
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页条数，默认 20 |

**返回示例**：

```json
{
  "code": 200,
  "message": "Media list fetched successfully",
  "data": {
    "userId": "uuid",
    "type": null,
    "items": [
      {
        "id": "task-123",
        "type": "photo",
        "assets_type": "image/jpeg",
        "label": "封面图",
        "url": "media/photo/xxx.jpg",
        "description": "海边黄昏",
        "prompts_meta": "{\"prompt\":\"...\",\"seed\":42}"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### 1.10 获取用户设置

```
GET /api/v1/account/settings
PUT /api/v1/account/settings
```

**权限**：需认证

**PUT 请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| theme | string | 否 | `light` \| `dark` \| `system` |
| language | string | 否 | `zh` \| `en` |
| notifications_enabled | boolean | 否 | 是否启用通知 |

**返回示例**（GET）：`{ "code": 200, "data": { "theme": "light", "language": "zh", "notifications_enabled": true } }`

---

### 1.11 获取会员信息

```
GET /api/v1/account/membership
```

**权限**：需认证

**返回示例**：

```json
{
  "code": 200,
  "data": {
    "membership_type": "free",
    "membership_expires_at": null,
    "level": 0
  }
}
```

| 返回字段 | 类型 | 说明 |
|----------|------|------|
| membership_type | string | `free` \| `pro` \| `premium` |
| membership_expires_at | string \| null | ISO8601，null 表示未开通或已过期 |
| level | number | 等级 |

---

### 1.12 管理员：更新用户信息

```
PUT /api/v1/account/admin/user_profile
```

**权限**：Admin

**Body**：

```json
{
  "userId": "string",           // 必填
  "username": "string",
  "email": "string",
  "phone": "string",
  "avatar_url": "string",
  "level": "number",
  "balance": "number",
  "membership_type": "string",
  "membership_expires_at": "string|null",
  "status": "active|suspended|banned",
  "role": "user|admin"
}
```

---

### 1.13 管理员：用户列表

```
GET /api/v1/account/admin/users?page=1&limit=20&status=&role=&search=
```

**权限**：Admin

**Query**：`page`、`limit`、`status`（active/suspended/banned）、`role`（user/admin）、`search`

**返回**：

```json
{
  "code": 200,
  "data": {
    "users": [{ ..., "isLoggedIn": true }],
    "pagination": { "total", "page", "limit", "totalPages" }
  }
}
```

---

### 1.14 管理员：封禁/解封用户

```
PUT /api/v1/account/admin/users/:id/status
```

**权限**：Admin

**Body**：

```json
{ "status": "active|suspended|banned" }
```

---

### 1.15 管理员：强制登出

```
POST /api/v1/account/admin/users/:id/force-logout
```

**权限**：Admin

---

## 二、资源/文件夹管理 (mxmauth → /api/v1/assets)

### 2.1 获取文件夹列表

```
GET /api/v1/assets/folders?parent_id=
```

**权限**：需认证

**Query**：`parent_id`（可选，根目录不传或传空）

**返回**：

```json
{
  "code": 200,
  "data": { "folders": [...], "total": 0 }
}
```

---

### 2.2 创建文件夹

```
POST /api/v1/assets/folders
```

**Body**：

```json
{
  "name": "string",      // 必填
  "parent_id": "string" // 可选
}
```

---

### 2.3 更新文件夹

```
PUT /api/v1/assets/folders/:id
```

**Body**：`{ "name": "string" }`

---

### 2.4 删除文件夹

```
DELETE /api/v1/assets/folders/:id
```

---

### 2.5 获取文件夹内容

```
GET /api/v1/assets/folders/:id/items?limit=100&offset=0
```

**返回**：`{ items: [{ type: 'dir'|'file', ... }], total, folders_count, files_count }`

---

### 2.6 添加任务到文件夹

```
POST /api/v1/assets/folders/:id/items
```

**Body**：`{ "task_id": "string" }`

---

### 2.7 从文件夹移除任务

```
DELETE /api/v1/assets/folders/:id/items/:taskId
```

---

## 三、系统信息 (mxmcgi → /api/v1/system)

### 3.1 系统统计（Admin）

```
GET /api/v1/system/admin/stats?days=30&topLimit=10
```

**权限**：Admin

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 7-90，默认 30，每日用量统计天数 |
| topLimit | number | 否 | 5-50，默认 10，Top 用户数量 |

**返回示例**：

```json
{
  "success": true,
  "data": {
    "userCount": 100,
    "taskCount": 5000,
    "taskCountByStatus": {
      "pending": 10,
      "queued": 5,
      "processing": 3,
      "completed": 4800,
      "failed": 100,
      "cancelled": 82
    },
    "taskCountByType": {
      "image": 3000,
      "writing": 1000,
      "video": 500,
      "audio": 500
    },
    "dailyUsage": [
      { "date": "2025-02-01", "count": 120 },
      { "date": "2025-02-02", "count": 95 }
    ],
    "topUsersByUsage": [
      { "userId": "uuid-1", "username": "user1", "taskCount": 500 }
    ]
  }
}
```

---

### 3.2 模型配置

```
GET /api/v1/system/models?category=&provider=
```

**权限**：需认证（Admin 可见 provider_price）

**Query**：`category`（graph/text/audio）、`provider`（replicate/ppio/deer）

---

### 3.3 账户/提供商信息

```
GET /api/v1/system/account
```

**返回**：`{ ppio: { credit_balance, allow_features, ... }, replicate, deerapi }`

---

### 3.4 账单查询

```
GET /api/v1/system/bills?cycleType=Day&productCategory=llm&startTime=&endTime=
```

**Query**：`cycleType`（Hour/Day/Week/Month）、`productCategory`（llm/gen_api）、`startTime`、`endTime`（Unix 时间戳）

---

### 3.5 提示词工程配置（Admin）

```
GET  /api/v1/system/prompt-config?scope=&type=&subtype=&limit=&offset=
GET  /api/v1/system/prompt-config/by-key?scope=&type=&subtype=&lang=
PUT  /api/v1/system/prompt-config
DELETE /api/v1/system/prompt-config/:id
```

**权限**：Admin

**PUT Body**：`{ scope, type, subtype?, output_format_i18n?, form_options_i18n?, extra?, is_active? }`（`rules_i18n` 已弃用，服务端恒存 `{}`）

---

## 四、CGI 任务 (mxmcgi → /api/v1/cgi-tasks)

### 4.1 创建异步任务

```
POST /api/v1/cgi-tasks
```

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | `text` \| `image` \| `video` \| `audio` |
| model | string | 是 | 模型名，如 `seedream-4`、`flux-fast`、`sora-2-deer` |
| provider | string | 否 | `replicate` \| `ppio` \| `deer` |
| params | object | 是 | 生成参数（由 model 决定） |
| storeToMinio | boolean | 否 | 默认 false |
| storageConfig | object | 否 | `{ bucket?, pathTemplate? }` |

**params 示例**：`{ prompt: "海边日落", type: "landscape", aspect_ratio: "16:9" }`

**返回示例**：

```json
{
  "success": true,
  "data": {
    "taskId": "task-uuid",
    "status": "pending",
    "createdAt": "2025-02-12T00:00:00.000Z"
  }
}
```

---

### 4.2 查询任务详情

```
GET /api/v1/cgi-tasks/:taskId?type=
```

**Query**：`type`（可选，限定任务类型）

**返回示例**：

```json
{
  "success": true,
  "data": {
    "id": "task-uuid",
    "type": "image",
    "status": "completed",
    "progress": { "status": "completed", "progress": 100 },
    "result": {
      "mediaUrls": ["https://..."],
      "storageInfo": { "bucket": "user-media", "keys": [], "urls": [] }
    },
    "metadata": { "model": "seedream-4", "userId": "uuid" },
    "requestParams": {},
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 4.3 查询任务列表（当前用户）

```
GET /api/v1/cgi-tasks?type=&status=&model=&limit=20&offset=0&startDate=&endDate=
```

**Query**：`type`、`status`、`model`、`limit`、`offset`、`startDate`、`endDate`

**返回**：`{ success, data: { tasks, total, count, limit, offset } }`

---

### 4.4 管理员：查询所有任务

```
GET /api/v1/cgi-tasks/admin?userId=&type=&status=&model=&limit=20&offset=0&startDate=&endDate=&includeDeleted=false
```

**权限**：Admin

---

### 4.5 按用户查询任务

```
GET /api/v1/cgi-tasks/by-user/:userId?type=&status=&model=&limit=&offset=
```

---

### 4.6 取消任务

```
POST /api/v1/cgi-tasks/:taskId/cancel
```

---

### 4.7 重试任务

```
POST /api/v1/cgi-tasks/:taskId/retry
```

---

### 4.8 恢复任务

```
POST /api/v1/cgi-tasks/:taskId/recover
```

---

### 4.9 软删除任务

```
DELETE /api/v1/cgi-tasks/:taskId
```

---

## 五、图片生成 (mxmcgi → /api/v1/cgi/graph)

### 5.1 模型列表

```
GET /api/v1/cgi/graph/models
```

**返回示例**：`{ "models": [{ "name": "flux-fast" }, { "name": "seedream-4" }, ...] }`

---

### 5.2 表单选项

```
GET /api/v1/cgi/graph/getformOptions?photograph=&design=&painting=&type=&lang=zh
```

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| photograph | 任意 | 条件 | 与 design/painting 三选一，传任意值表示选中 |
| design | 任意 | 条件 | 同上 |
| painting | 任意 | 条件 | 同上 |
| type | string | 是 | 子类型，如 `portrait`、`landscape`、`3d`、`illustration` |
| lang | string | 否 | `zh` \| `en`，默认 zh |

**type 可选值**：
- photograph: `portrait` \| `landscape` \| `cinematic` \| `commercial` \| `documentary`
- design: `3d` \| `manual` \| `poster` \| `icon` \| `coverImage` \| `ui-design`
- painting: `illustration` \| `comic` \| `conceptArt` \| `cartoon`

---

### 5.3 摄影生成

```
POST /api/v1/cgi/graph/photograph
```

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 见上 type 可选值（photograph 子类） |
| prompt | string | 是 | 主提示词 |
| style | string | 否 | 风格（人像） |
| tone | string | 否 | 色调 |
| environment | string | 否 | 环境（室内/室外/棚拍） |
| timeOfDay | string | 否 | 时段（风景） |
| weather | string | 否 | 天气 |
| filmStyle | string | 否 | 电影风格（电影画面） |
| mood | string | 否 | 氛围 |
| quality | string | 否 | `high` \| `fast` |
| aspect_ratio | string | 否 | 如 `16:9`、`1:1` |
| referenceImage | string \| string[] \| object[] | 否 | 参考图（base64 或 URL） |
| grid9 | boolean | 否 | 是否九宫格 |
| grid9Mode | string | 否 | `variation` \| `sequence` \| `combination` |

**返回**：与 4.1 创建任务相同，`{ success, data: { taskId, status, createdAt } }`（异步任务）

---

### 5.4 设计生成

```
POST /api/v1/cgi/graph/design
```

**请求 Body**：与 photograph 类似，必填 `type`、`prompt`。design 特有字段：
- `modelStyle`、`material`、`lighting`（3D）
- `layout`、`colorScheme`、`typography`（手册）
- `artStyle`、`theme`（画报）
- `iconStyle`、`size`（图标）
- `subjectImage`、`backgroundImage`、`title`、`subtitle`、`textStyle`、`textColor`（封面图片）
- `uiResolution`、`uiStyleKeywords`、`uiColorTokens`（ui-design）

---

### 5.5 绘画生成

```
POST /api/v1/cgi/graph/painting
```

**请求 Body**：必填 `type`、`prompt`。painting 特有字段：`illustrationStyle`、`colorPalette`、`comicStyle`、`panelLayout`、`conceptArtStyle`、`detailLevel`、`cartoonStyle`、`characterDesign`

---

### 5.6 通用模型调用

```
POST /api/v1/cgi/graph/:modelName
```

**Path**：如 `flux-fast`、`seedream-4` 等

**Body**：按模型要求的参数传递

---

## 六、文本生成 (mxmcgi → /api/v1/cgi/text)

### 6.1 模型列表

```
GET /api/v1/cgi/text/models
```

---

### 6.2 文本生成

```
POST /api/v1/cgi/text/:modelName?provider=
```

**Body**：

```json
{
  "prompt": "string",
  "outputFormat": "json|stream",
  "sensitives": []
}
```

**说明**：`outputFormat=stream` 时返回 SSE 流。

---

## 七、音频生成 (mxmcgi → /api/v1/cgi/audio)

### 7.1 模型列表

```
GET /api/v1/cgi/audio/models
```

---

### 7.2 音频生成

```
POST /api/v1/cgi/audio/:modelName
```

**Body**：语音合成需 `text` 或 `prompt`；音色复刻需 `audio_url`。可选 `storeToMinio`、`storageConfig`。

---

## 八、视频生成 (mxmcgi → /api/v1/cgi/video)

### 8.1 模型列表

```
GET /api/v1/cgi/video/models
```

---

### 8.2 表单选项

```
GET /api/v1/cgi/video/getformOptions?lang=zh
```

---

### 8.3 统一生成入口（兼容层）

```
POST /api/v1/cgi/video/generate
```

**Body**：`{ chunks: [...], scriptType, label, storeToMinio, ... }`

内部转 **Task V2**（`scope=video`），供移动端等旧客户端使用。Web / Smartflow 推荐：

```
POST /api/v2/tasks/run
```

`scope=video`，`taskKey` / `subtype` 由 Admin `video_scope_config` 配置。详见 `mxmcgi/docs/VIDEO_BUSINESS_CONFIG_AND_SMARTFLOW.md`。

---

### 8.4 按模型生成（已废弃）

```
POST /api/v1/cgi/video/:modelName
```

**返回 `410 Gone`**。请改用 Task V2 或在 Admin 配置 `video_scope_config` 后通过 `POST /api/v2/tasks/run` 提交。

---

## 九、写作 (mxmcgi → /api/v1/writing)

### 9.1 生成大纲

```
POST /api/v1/writing/outline
```

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| uid | string | 是 | 唯一标识，用于前端关联 |
| prompt | string | 是 | 主题/需求描述 |
| outputFormat | string | 否 | `json` \| `stream`，默认 json。stream 时返回 SSE |
| writing_type | string | 否 | `outlines` \| `articles` \| `voice-scripts` \| `storyboard-scripts` 等 |
| maxDepth | number | 否 | 大纲最大层级 |
| expectedNodes | number | 否 | 预期节点数 |
| total_textcount | number | 否 | 目标字数 |
| applyto | string | 否 | `articles` \| `voice-scripts` \| `storyboard-scripts` |
| knowledgeBase | object[] | 否 | 知识库配置 |
| cast_character_count | number | 否 | 角色数量 |
| cast_character_ids | string[] | 否 | 角色 ID 列表 |
| language | string | 否 | 语言 |

**返回**：`outputFormat=stream` 时 SSE 流；否则 `{ success, data: { taskId, status } }`

---

### 9.2 生成文章

```
POST /api/v1/writing/generate
```

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | 是 | 主题/需求 |
| outlines | object[] | 否 | 大纲结构（from outline 结果） |
| outputFormat | string | 否 | `json` \| `stream` |
| storeToMinio | boolean | 否 | 是否存储到 MinIO |
| writing_type | string | 否 | 文章类型 |
| language | string | 否 | 语言 |

**返回**：同上，stream 或 taskId

---

### 9.3 润色/改写

```
POST /api/v1/writing/rewriting
POST /api/v1/writing/polishing
```

**Body**：需包含 `text`（原文）、`instruction`（润色指令）等，具体见实现

---

### 9.4 Suno 歌词

```
POST /api/v1/writing/suno/lyrics
```

---

### 9.5 同步到任务

```
POST /api/v1/writing/sync-to-task
```

---

### 9.6 获取文档

```
GET /api/v1/writing/document?taskId=
```

---

### 9.7 表单选项

```
GET /api/v1/writing/getformOptions?writing_type=&outline_type=&lang=zh
```

---

## 十、角色 (mxmcgi → /api/v1/characters)

### 10.1 角色列表

```
GET /api/v1/characters?category=&tags=&search=&is_public=&page=&limit=
```

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string \| string[] | 否 | 分类筛选 |
| tags | string \| string[] | 否 | 标签筛选 |
| search | string | 否 | 关键词搜索 |
| is_public | boolean | 否 | 是否公开 |
| page | number | 否 | 页码 |
| limit | number | 否 | 每页条数 |

**返回**：`{ success, data: { characters, total } }`

---

### 10.2 创建角色

```
POST /api/v1/characters
```

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 角色名 |
| nickname | string | 否 | 昵称 |
| age | number | 否 | 年龄 |
| category | string[] | 否 | 分类 |
| tags | string[] | 否 | 标签 |
| is_public | boolean | 否 | 仅 Admin 可设为 true |
| appearance | object | 否 | `{ description?, reference_images?: string[] }`，图片最多 10 张 |
| voice | object | 否 | `{ description?, clone_voiceId?, voice_example? }` |
| reference_videos | string[] | 否 | 参考视频 URL |
| clothing_style | object | 否 | `{ description?, reference_images?: string[] }` |
| others | object | 否 | `{ personality?, ... }` |
| relations | object | 否 | `{ [characterId]: { [otherId]: "关系描述" } }` |

**返回**：`{ success, data: Character }`

---

### 10.3 角色详情

```
GET /api/v1/characters/:id
```

**返回示例**：

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "角色名",
    "nickname": "小名",
    "age": 25,
    "category": ["主角"],
    "tags": ["温柔"],
    "is_public": false,
    "appearance": { "description": "...", "reference_images": [] },
    "voice": { "description": "...", "clone_voiceId": null },
    "clothing_style": { "description": "..." },
    "others": { "personality": "..." },
    "mediaUrls": { "avatar": "https://...", "voice_example": "..." }
  }
}
```

---

### 10.4 更新角色

```
PUT /api/v1/characters/:id
```

**Body**：与 CreateCharacterDto 字段相同，均为可选，仅更新传入字段

---

### 10.5 删除角色

```
DELETE /api/v1/characters/:id
```

---

### 10.6 关联图片任务

```
POST /api/v1/characters/:id/link-image-task
```

**Body**：`{ taskId, assetType? }`

---

### 10.7 关联音频任务

```
POST /api/v1/characters/:id/link-audio-task
```

**Body**：`{ taskId }`

---

### 10.8 从写作保存角色

```
POST /api/v1/characters/save-from-writing
```

---

### 10.9 从大纲保存角色

```
POST /api/v1/characters/save-from-outline
```

---

### 10.10 生成角色

```
POST /api/v1/characters/generate
```

---

## 十一、知识库 (mxmcgi → /api/v1/knowledge)

### 11.1 创建知识库

```
POST /api/v1/knowledge/bases
```

**Body**：`{ name, display_name, description?, type?, is_public?, ... }`

**说明**：非 Admin 只能创建私有知识库（`is_public=false`）。

---

### 11.2 知识库列表

```
GET /api/v1/knowledge/bases?agent_id=&is_public=&limit=&offset=
```

**Query**：`is_public` 未传：用户私有 + 公开；`true`：仅公开；`false`：仅用户私有。

---

### 11.3 知识库详情

```
GET /api/v1/knowledge/bases/:id
GET /api/v1/knowledge/bases/:id/detail
```

---

### 11.4 更新知识库

```
PUT /api/v1/knowledge/bases/:id
```

---

### 11.5 删除知识库

```
DELETE /api/v1/knowledge/bases/:id
```

---

### 11.6 上传文档

```
POST /api/v1/knowledge/bases/:id/documents
```

**Body**：multipart/form-data 或 JSON（视实现）

---

### 11.7 文档列表

```
GET /api/v1/knowledge/bases/:id/documents
```

---

### 11.8 知识库检索

```
POST /api/v1/knowledge/bases/:id/search
```

**Body**：`{ query: "string", limit?: number }`

---

### 11.9 删除文档

```
DELETE /api/v1/knowledge/documents/:id
```

---

### 11.10 Admin：公开知识库与默认使用

以下接口需 **Admin 角色**。

#### 11.10.1 列出公用知识库（公开 + 内置）

```
GET /api/v1/knowledge/admin/public-bases?limit=&offset=
```

**返回**：`{ success, data: { knowledge_bases, total } }`，包含所有 `is_public=true` 或 `is_builtin=true` 的知识库。

---

#### 11.10.2 列出默认知识库绑定

```
GET /api/v1/knowledge/admin/defaults?scope=
```

**Query**：`scope` 可选，筛选 scope（如 `graph`）。

**返回**：`{ success, data: { defaults: [{ id, scope, category, sub_type, knowledge_base_id, ... }] } }`

---

#### 11.10.3 设置默认知识库

```
PUT /api/v1/knowledge/admin/defaults
```

**Body**：`{ scope, category, sub_type, knowledge_base_id }`

**说明**：为指定 (scope, category, sub_type) 设置默认使用的知识库。如 `scope=graph`, `category=photograph`, `sub_type=portrait` 对应图生中人像摄影的默认知识库。

---

#### 11.10.4 移除默认绑定

```
DELETE /api/v1/knowledge/admin/defaults/:scope/:category/:subType
```

**说明**：移除后，该 slot 将回退到命名规则 `graph-{category}-{subType}`。

---

## 十二、媒体访问 (mxmcgi → /api/v1/media)

按任务 ID 获取生成的媒体文件（图片/视频/写作/音频）：

```
GET /api/v1/media/graph/:taskId       # 图片
GET /api/v1/media/video/:taskId      # 视频
GET /api/v1/media/writing/:taskId    # 写作文档
GET /api/v1/media/audio/:taskId      # 音频
```

**返回**：二进制流（Content-Type 由文件类型决定）

**说明**：仅能访问本人任务。

---

### 用户上传资源

通过 bucket + key 访问用户上传的文件（如角色参考图）：

```
GET /api/v1/media/asset?bucket=user-media&key={userId}/upload/graph/xxx.jpg
```

**说明**：`key` 必须以 `{userId}/upload/` 开头，且与当前用户 ID 一致。

---

### 写作文档更新

```
PUT /api/v1/media/writing/:taskId
```

**Body**：写作内容更新（具体格式见实现）

---

## 十三、上传 (mxmcgi → /api/v1/cgi/upload)

### 13.1 上传临时文件

```
POST /api/v1/cgi/upload/temp
```

**Body**：`multipart/form-data`，字段名 `file`

**返回**：`{ success: true, data: { url, key, bucket } }`

---

### 13.2 上传用户资源（角色参考图等）

```
POST /api/v1/cgi/upload/assets
```

**Body**：`multipart/form-data`，字段名 `file`（支持 jpg/png/webp/gif）

**存储路径**：`{userId}/upload/graph/{timestamp}-{random}.{ext}`

**返回**：`{ success: true, data: { url, key, bucket, proxyPath } }`

- `url`：可访问地址（含 gateway 时为完整 URL，否则为 proxyPath）
- `proxyPath`：代理路径，如 `/api/v1/media/asset?bucket=...&key=...`，可直接用于 `character.reference_images`

---

## 十四、通知 (mxmnotify → /api/v1/notifications)

### 14.1 通知列表（当前用户）

```
GET /api/v1/notifications?is_read=&limit=&offset=
```

---

### 14.2 用户通知列表（兼容）

```
GET /api/v1/notifications/user/:userId?is_read=&limit=&offset=
```

---

### 14.3 标记已读

```
PUT /api/v1/notifications/:notificationId/read
PUT /api/v1/notifications/read-all
PUT /api/v1/notifications/user/:userId/read-all
```

---

### 14.4 删除通知

```
DELETE /api/v1/notifications/:notificationId
POST /api/v1/notifications/delete-batch
```

**Body（delete-batch）**：`{ notification_ids: string[] }`

---

## 十五、任务事件 (mxmnotify → /api/v1/task-events)

### 15.1 任务状态变更（内部）

```
POST /api/v1/task-events/status-changed
```

**Body**：

```json
{
  "module_type": "mxmcgi",
  "task_id": "string",
  "user_id": "string",
  "task_status": "pending|running|completed|failed",
  "task_status_message": "string",
  "metadata": {},
  "notification_config": {}
}
```

**说明**：主要由业务模块调用，用于触发通知。

---

## 十六、mxmnotify 任务 (mxmnotify → /api/v1/tasks)

> 注意：此为 mxmnotify 的独立任务表，与 cgi-tasks 不同。

```
POST /api/v1/tasks                    # 创建任务
PUT  /api/v1/tasks/:taskId           # 更新任务
GET  /api/v1/tasks/:taskId           # 任务详情
GET  /api/v1/tasks/user/:userId      # 用户任务列表
```

**POST Body**：`{ user_id, task_type, model_name, prompt, params }`

---

## 十七、SSE 与 WebSocket

### 17.1 SSE 连接

```
GET /api/v1/sse/:userId
```

**权限**：需认证，且 `userId` 必须与当前用户一致

**说明**：用于服务端推送任务状态等事件。

---

### 17.2 WebSocket

```
WS /api/v1/ws/notifications
```

**说明**：实时通知通道，需携带认证信息。

---

## 二十八、错误响应格式

常见 HTTP 状态码与 body 约定：

| 状态码 | 说明 |
|--------|------|
| 200/201 | 成功 |
| 400 | 参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突（如重复） |
| 500 | 服务器错误 |

错误 body 示例：

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "..." }
}
```

或 mxmauth 风格：

```json
{
  "code": 401,
  "message": "Invalid credentials",
  "error": "UNAUTHORIZED"
}
```

---

## 十八、支付 (mxmpay → /api/v1/payment)

> 注意：Gateway 去掉 `/api/v1` 前缀后转发，mxmpay 收到路径为 `/payment/*`。

### 18.1 创建支付订单

```
POST /api/v1/payment/create
```

**权限**：需认证

**请求 Body**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| amount | number | 是 | 金额 ≥0.01 |
| currency | string | 是 | `eth` \| `usdt` \| `usdc` \| `btc`；voucher 时 `cny` \| `usd` |
| channel | string | 是 | `alipay` \| `wechat` \| `paypal` \| `card` \| `crypto` \| `voucher` |
| toAddress | string | 条件 | 收款地址，crypto/voucher 时可选 |
| description | string | 否 | 订单描述 |
| orderId | string | 否 | 商户订单号 |
| asset_code | string | 否 | 资产代码 |
| biz_type | string | 否 | 业务类型 |
| biz_id | string | 否 | 业务 ID |

**返回**：订单对象（id、status、amount、currency、channel 等）

---

### 18.2 获取订单详情

```
GET /api/v1/payment/:orderId
```

---

### 18.3 查询订单列表

```
GET /api/v1/payment?status=&currency=&channel=&orderId=&page=1&limit=10
```

**Query**：`status`(pending/processing/success/failed/cancelled/expired)、`currency`、`channel`、`orderId`、`page`、`limit`

**说明**：仅返回当前用户的订单。

---

### 18.4 管理员：查询所有订单

```
GET /api/v1/payment/admin/orders?status=&userId=&page=&limit=
```

**权限**：Admin

---

### 18.5 确认支付（区块链）

```
POST /api/v1/payment/confirm
```

**Body**：`{ orderId, txHash, blockNumber? }`

---

### 18.6 取消订单

```
POST /api/v1/payment/:orderId/cancel
```

---

### 18.7 支付统计

```
GET /api/v1/payment/stats/overview
```

**返回**：当前用户支付统计。

---

### 18.8 管理员：发放代金券

```
POST /api/v1/payment/admin/voucher/issue
```

**权限**：Admin

**Body**：`{ userId, amount, assetCode: "VOUCHER-CNY"|"VOUCHER-USD", description?, bizType?, bizId? }`

---

### 18.9 Webhook（第三方回调）

```
POST /api/v1/payment/webhook/*
```

**权限**：无需认证（供支付渠道回调）

---

### 18.10 Apple IAP 收据校验

```
POST /api/v1/payment/iap/verify
```

**权限**：需认证（x-user-id）

**Body**：`{ orderId, receipt, productId? }`

**说明**：客户端完成 StoreKit 购买后，传收据校验并触发钱包入账。需先通过 `POST /api/v1/payment/create` 创建 `channel=apple_iap` 订单。

---

## 十九、钱包 (mxmpay → /api/v1/wallets)

> 注意：Gateway 去掉 `/api/v1` 前缀后转发，mxmpay 收到路径为 `/wallets/*`。

### 19.1 资产配置列表

```
GET /api/v1/wallets/assets
```

**权限**：需认证

**返回**：支持的资产类型配置。

---

### 19.2 钱包列表

```
GET /api/v1/wallets?userId=
```

**说明**：userId 可从 x-user-id header 或 query 获取。

---

### 19.3 钱包详情

```
GET /api/v1/wallets/:assetCode?userId=
```

---

### 19.4 交易记录

```
GET /api/v1/wallets/:assetCode/transactions?limit=20&userId=
```

---

### 19.5 充值

```
POST /api/v1/wallets/:assetCode/deposit
```

**Body**：`{ amount, referenceId?, metadata?, bizTag?, userId? }`

---

### 19.6 提现/扣款

```
POST /api/v1/wallets/:assetCode/withdraw
```

**Body**：`{ amount, referenceId?, metadata?, bizTag?, userId? }`

---

### 19.7 钱包支付（消费）

```
POST /api/v1/wallets/payment
```

**Body**：`{ asset_code, price, biz_type?, biz_id?, description?, userId? }`

---

### 19.8 任务列表

```
GET /api/v1/wallets/tasks?userId=&type=&status=&asset_code=&channel=&page=&limit=
```

**Query**：`type`(deposit/payment)、`status`(pending/success/failed)、`asset_code`、`channel`、`page`、`limit`

---

## 二十、生成服务 (mxmcgi → /api/v1/generation)

> 代理到 mxmcgi，路径保持 `/api/v1/generation/*`。用于与 mxmcgi 其他路由并列的通用生成入口（如有）。

---

## 二十一、助手 (mxmcgi → /api/v1/agents)

> 代理到 mxmcgi。GET 列表(/)、搜索(/search)、详情(/:id) 无需认证；其他需认证。

---

## 二十二、模型列表 (mxmcgi → /api/v1/models)

### 22.1 模型列表

```
GET /api/v1/models?type=
GET /api/v1/models/:name
GET /api/v1/models/types/list
```

**权限**：无需认证（公开信息）

**Query**：`type`（text/image/video 等，可选）

**返回**：Smartflow 支持的模型节点及参数定义。

---

## 二十三、Smartflow (mxmcgi → /api/v1/smartflows)

### 23.1 列表

```
GET /api/v1/smartflows?userId=&public=&limit=&offset=
```

**权限**：GET 列表和详情无需认证

**Query**：`userId`、`public`(true/false)、`limit`、`offset`

---

### 23.2 详情

```
GET /api/v1/smartflows/:id
```

---

### 23.3 执行状态

```
GET /api/v1/smartflows/:id/status
GET /api/v1/smartflows/:id/execute
```

**权限**：需认证（查询任务状态）

**说明**：`id` 为 task_id（执行实例 ID）。

---

### 23.4 创建

```
POST /api/v1/smartflows
```

**权限**：需认证

**Body**：`{ name, schema, author_id? }`（author_id 可由 x-user-id 自动填充）

---

### 23.5 更新

```
PUT /api/v1/smartflows/:id
```

**权限**：需认证，仅能更新自己创建的

---

### 23.6 删除

```
DELETE /api/v1/smartflows/:id
```

---

### 23.7 执行

```
POST /api/v1/smartflows/:id/execute
```

**权限**：需认证

**Body**：`{ input: [], userId?, conversationId? }`

**返回**：`{ id(task_id), smartflow_id, user_id, status, progress, status_url }`（202）

---

### 23.8 停止执行

```
POST /api/v1/smartflows/:id/stop
```

**权限**：需认证，仅能停止自己的任务

**Path**：`id` 为 task_id（执行实例 ID）

---

## 二十四、Prompt 模板 (mxmcgi → /api/v1/prompt-templates)

### 24.1 列表

```
GET /api/v1/prompt-templates?userId=&public=&category=&limit=&offset=
```

**权限**：GET 无需认证

---

### 24.2 详情

```
GET /api/v1/prompt-templates/:id
GET /api/v1/prompt-templates/name/:name
```

---

### 24.3 创建

```
POST /api/v1/prompt-templates
```

**权限**：需认证

**Body**：`{ name, display_name, template, ... }`

---

### 24.4 更新/删除

```
PUT  /api/v1/prompt-templates/:id
DELETE /api/v1/prompt-templates/:id
```

**权限**：需认证

---

## 二十五、Smartflow 任务 (mxmcgi → /api/v1/smartflow-tasks)

> Gateway 将 `/api/v1/smartflow-tasks` 代理到 mxmcgi，与 mxmnotify 的 `/api/v1/tasks` 区分。

### 25.1 任务列表

```
GET /api/v1/smartflow-tasks?status=&limit=&offset=
```

**权限**：需认证。返回当前用户的 Smartflow 执行实例。

---

### 25.2 任务详情

```
GET /api/v1/smartflow-tasks/:id
```

**权限**：需认证，仅能查看自己的任务。

---

## 二十六、通知广播 (mxmnotify → /api/v1/notifications)

### 26.1 全局广播

```
POST /api/v1/notifications/broadcast
```

**Body**：

```json
{
  "event": "string",
  "title": "string",
  "content": "string",
  "action_url": "string",
  "avatar_url": "string",
  "metadata": {},
  "exclude_user_ids": []
}
```

---

### 26.2 多用户通知

```
POST /api/v1/notifications/broadcast/users
```

**Body**：

```json
{
  "user_ids": ["id1", "id2"],
  "event": "string",
  "title": "string",
  "content": "string",
  "action_url": "string",
  "avatar_url": "string",
  "metadata": {}
}
```

---

## 二十七、健康检查与根路径 (Gateway)

### 27.1 健康检查

```
GET /health
```

**返回**：`{ status: "ok", service: "gateway", timestamp }`

---

### 27.2 根路径

```
GET /
```

**返回**：`{ service: "gateway", version: "1.0.0", message: "..." }`

---

## 附录：网关路由映射

| Gateway 路径前缀 | 后端服务 |
|------------------|----------|
| /api/v1/account | mxmauth |
| /api/v1/assets | mxmauth |
| /api/v1/payment | mxmpay |
| /api/v1/wallets | mxmpay |
| /api/v1/generation | mxmcgi |
| /api/v1/system | mxmcgi |
| /api/v1/cgi-tasks | mxmcgi |
| /api/v1/cgi/graph | mxmcgi |
| /api/v1/cgi/text | mxmcgi |
| /api/v1/cgi/audio | mxmcgi |
| /api/v1/cgi/video | mxmcgi |
| /api/v1/cgi/upload | mxmcgi |
| /api/v1/writing | mxmcgi |
| /api/v1/characters | mxmcgi |
| /api/v1/knowledge | mxmcgi |
| /api/v1/media | mxmcgi |
| /api/v1/agents | mxmcgi |
| /api/v1/models | mxmcgi |
| /api/v1/smartflows | mxmcgi |
| /api/v1/prompt-templates | mxmcgi |
| /api/v1/smartflow-tasks | mxmcgi |
| /api/v1/notifications | mxmnotify |
| /api/v1/tasks | mxmnotify |
| /api/v1/sse | mxmnotify |
| /api/v1/task-events | mxmnotify |
| /health, / | Gateway |
| WS /api/v1/ws/notifications | mxmnotify |
