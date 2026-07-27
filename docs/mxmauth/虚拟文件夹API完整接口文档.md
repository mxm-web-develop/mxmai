# 虚拟文件夹管理 API 完整接口文档

**重要更新：**
- 文件夹系统现在直接使用 `cgi-tasks` 表，不再依赖 `user_media` 表
- 所有接口直接使用 `task_id`（任务 ID），无需额外的数据转换
- 如果您的数据库还在使用旧的 `folder_items` 表结构（使用 `media_item_id`），请执行 `更新文件夹表结构.sql` 进行迁移

## 目录

1. [基础信息](#基础信息)
2. [认证方式](#认证方式)
3. [数据模型](#数据模型)
4. [接口列表](#接口列表)
   - [1. 获取文件夹列表](#1-获取文件夹列表)
   - [2. 创建文件夹](#2-创建文件夹)
   - [3. 更新文件夹](#3-更新文件夹)
   - [4. 删除文件夹](#4-删除文件夹)
   - [5. 获取文件夹中的文件列表](#5-获取文件夹中的文件列表)
   - [6. 添加文件到文件夹](#6-添加文件到文件夹)
   - [7. 从文件夹移除文件](#7-从文件夹移除文件)
   - [8. 获取文件所属的文件夹列表](#8-获取文件所属的文件夹列表)
   - [9. 获取文件夹路径](#9-获取文件夹路径)
5. [完整测试用例](#完整测试用例)
6. [错误码说明](#错误码说明)

---

## 基础信息

- **基础 URL**: `http://localhost:3000` (开发环境)
- **API 前缀**: `/api/v1/assets`
- **认证方式**: Bearer Token (JWT)
- **Content-Type**: `application/json`

---

## 认证方式

所有接口都需要在请求头中添加认证 Token：

```http
Authorization: Bearer <your_access_token>
```

### 获取 Token

```http
POST http://localhost:3000/api/v1/account/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

**响应示例：**
```json
{
  "code": 200,
  "message": "Login successful",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "...",
    "user": {
      "id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
      "username": "your_username"
    }
  }
}
```

---

## 如何获取文件夹 ID 和任务 ID

### 重要说明

**文件夹系统直接使用 `cgi-tasks` 表，不再依赖 `user_media` 表。**

1. **文件夹 ID (`folder_id`)**：
   - 必须是 **UUID 格式**（例如：`"550e8400-e29b-41d4-a716-446655440000"`）
   - 通过 `GET /api/v1/assets/folders` 接口获取
   - 用于标识文件夹，不能使用任务 ID 作为文件夹 ID

2. **任务 ID (`task_id`)**：
   - 是字符串格式，**不一定是 UUID**（例如：`"179e8d883c76179205af5"`）
   - 通过 `GET /api/v1/cgi-tasks` 接口获取
   - 用于标识生成任务，直接添加到文件夹时使用

**数据存储架构：**
- **任务系统**：所有生成任务都存储在 `cgi-tasks` 表中，每个任务有一个唯一的 `id`（任务 ID）
- **文件夹关联**：`folder_items` 表直接使用 `task_id`（任务 ID）作为关联，不再依赖 `user_media` 表
- **数据一致性**：文件夹系统直接引用 `cgi-tasks` 表，确保数据源统一

**工作流程：**
1. 前端传入 `task_id`（任务 ID）
2. 后端验证任务是否存在且属于当前用户（查询 `cgi-tasks` 表）
3. 直接在 `folder_items` 表中建立关联（`folder_id` + `task_id`）

**为什么直接使用 `task_id`？**
- **简化架构**：不再需要维护 `user_media` 表，直接使用 `cgi-tasks` 表作为数据源
- **数据一致性**：所有任务数据都在 `cgi-tasks` 表中，避免数据同步问题
- **前端友好**：任务 ID 来自任务列表接口，无需额外查询或转换

### 方法一：通过用户媒体列表接口获取（推荐）

**接口：** `GET /api/v1/account/media`

**请求示例：**
```http
GET http://localhost:3000/api/v1/account/media?type=photo&page=1&limit=20
Authorization: Bearer {{access_token}}
```

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `type` | string | 否 | 媒体类型：photo / video / music / illustration / text / voice |
| `page` | number | 否 | 页码，默认 1 |
| `limit` | number | 否 | 每页数量，默认 20 |

**响应示例：**
```json
{
  "code": 200,
  "message": "Media retrieved successfully",
  "data": {
    "userId": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
    "type": "photo",
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",  // ← 这就是 media_item_id
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "type": "photo",
        "assets_type": "image/jpeg",
        "label": "我的图片1.jpg",
        "url": "https://minio.example.com/media/photo/xxx.jpg",
        "task_id": "task-uuid-1",
        "description": null,
        "prompts_meta": null,
        "created_at": "2026-01-12T10:00:00.000Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",  // ← 另一个 media_item_id
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "type": "text",
        "assets_type": "text/plain",
        "label": "我的文档.txt",
        "url": "https://minio.example.com/media/text/xxx.txt",
        "task_id": "task-uuid-2",
        "description": "文档描述",
        "prompts_meta": "{\"prompt\":\"...\"}",
        "created_at": "2026-01-12T11:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

**使用方式：**
从响应中的 `items` 数组里，每个对象的 `id` 字段就是 `media_item_id`，可以直接用于添加到文件夹的接口。

### 方法二：从文件夹内容接口获取

如果文件已经在某个文件夹中，可以从文件夹内容接口获取：

**接口：** `GET /api/v1/assets/folders/:id/items`

**响应中的文件项：**
```json
{
  "code": 200,
  "message": "获取文件夹内容成功",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",  // ← 这就是 media_item_id
        "name": "我的图片1.jpg",
        "type": "file",  // 注意：这里是 "file"，不是 "dir"
        "assets_type": "image/jpeg",
        "url": "https://minio.example.com/media/photo/xxx.jpg",
        "created_at": "2026-01-12T10:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

### 方法三：直接从数据库查询（仅用于测试）

如果需要在数据库中直接查询：

```sql
-- 查询用户的所有媒体文件
SELECT 
  id,                    -- 这就是 media_item_id
  label,                 -- 文件名称
  type,                  -- 媒体类型
  assets_type,           -- MIME 类型
  url,                   -- 文件 URL
  created_at
FROM user_media 
WHERE user_id = 'your-user-id' 
ORDER BY created_at DESC 
LIMIT 10;
```

### user_media 表结构说明

```sql
CREATE TABLE user_media (
  id UUID PRIMARY KEY,                    -- 这就是 media_item_id（UUID 格式）
  user_id UUID NOT NULL,                  -- 用户 ID
  type VARCHAR(32) NOT NULL,              -- 媒体类型：photo / video / music / illustration / text / voice
  assets_type VARCHAR(64) NOT NULL,       -- 文件类型：image/jpeg, video/mp4, audio/mpeg 等
  label VARCHAR(255) NOT NULL,            -- 文件名称
  url TEXT NOT NULL,                      -- 文件存储路径或完整 URL
  task_id VARCHAR(128) NOT NULL,          -- 生成任务的 ID
  description TEXT,                        -- 可选描述
  prompts_meta TEXT,                       -- 生成任务参数（JSON 字符串）
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 注意事项

1. **UUID 格式**：`media_item_id` 必须是有效的 UUID 格式（例如：`550e8400-e29b-41d4-a716-446655440000`）
2. **用户权限**：只能使用属于当前登录用户的媒体文件 ID
3. **文件存在性**：文件必须在 `user_media` 表中存在
4. **多文件夹支持**：同一个文件可以添加到多个文件夹中

---

## 数据模型

### Folder（文件夹）

```typescript
interface Folder {
  id: string;              // UUID，文件夹唯一标识
  user_id: string;         // 用户 ID
  name: string;            // 文件夹名称
  parent_id: string | null; // 父文件夹 ID，null 表示根目录
  created_at: string;      // ISO 8601 格式的创建时间
  updated_at: string;      // ISO 8601 格式的更新时间
}
```

### MediaItem（媒体文件）

```typescript
interface MediaItem {
  id: string;              // UUID，媒体文件唯一标识（这就是 media_item_id）
  user_id: string;         // 用户 ID
  type: string;            // 媒体类型：photo / video / music / illustration / text / voice
  assets_type: string;     // MIME 类型：image/jpeg, video/mp4, audio/mpeg 等
  label: string;           // 文件名称
  url: string;             // 文件存储路径或完整 URL
  task_id: string;         // 生成任务的 ID
  description?: string;     // 可选描述
  prompts_meta?: string;   // 生成任务参数（JSON 字符串）
  created_at: string;      // ISO 8601 格式的创建时间
}
```

### FolderItem（文件夹-文件关联）

```typescript
interface FolderItem {
  folder_id: string;       // 文件夹 ID
  media_item_id: string;   // 媒体文件 ID（来自 user_media 表）
  created_at: string;      // 关联创建时间
}
```


---

## 接口列表

### 1. 获取文件夹列表

**GET** `/api/v1/assets/folders`

获取当前用户的文件夹列表，支持按父文件夹筛选。

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `parent_id` | string | 否 | 父文件夹 ID。不传或传空字符串 `""` 表示获取根目录文件夹；传 `null` 也表示根目录；传具体 ID 表示获取该文件夹的子文件夹 |

#### 请求示例

```http
GET http://localhost:3000/api/v1/assets/folders?parent_id=
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "获取文件夹列表成功",
  "data": {
    "folders": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "name": "我的图片",
        "parent_id": null,
        "created_at": "2026-01-12T10:00:00.000Z",
        "updated_at": "2026-01-12T10:00:00.000Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "name": "工作文档",
        "parent_id": null,
        "created_at": "2026-01-12T11:00:00.000Z",
        "updated_at": "2026-01-12T11:00:00.000Z"
      }
    ],
    "total": 2
  }
}
```

**表不存在时返回空数组 (200):**
```json
{
  "code": 200,
  "message": "获取文件夹列表成功",
  "data": {
    "folders": [],
    "total": 0
  }
}
```

---

### 2. 创建文件夹

**POST** `/api/v1/assets/folders`

创建新的文件夹。

#### 请求体

```json
{
  "name": "文件夹名称",
  "parent_id": "父文件夹ID（可选，不传或传null表示根目录）"
}
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `name` | string | 是 | 文件夹名称，不能为空，会自动去除首尾空格 |
| `parent_id` | string \| null | 否 | 父文件夹 ID。不传或传 `null` 表示在根目录创建 |

#### 请求示例

**在根目录创建文件夹：**
```http
POST http://localhost:3000/api/v1/assets/folders
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "我的新文件夹"
}
```

**在指定父文件夹下创建子文件夹：**
```http
POST http://localhost:3000/api/v1/assets/folders
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "子文件夹",
  "parent_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 响应示例

**成功响应 (201):**
```json
{
  "code": 201,
  "message": "创建文件夹成功",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
    "name": "我的新文件夹",
    "parent_id": null,
    "created_at": "2026-01-12T12:00:00.000Z",
    "updated_at": "2026-01-12T12:00:00.000Z"
  }
}
```

**错误响应 (400) - 名称为空：**
```json
{
  "code": 400,
  "message": "文件夹名称不能为空",
  "error": "VALIDATION_ERROR"
}
```

**错误响应 (404) - 父文件夹不存在：**
```json
{
  "code": 404,
  "message": "父文件夹不存在",
  "error": "NOT_FOUND"
}
```

**错误响应 (403) - 无权限访问父文件夹：**
```json
{
  "code": 403,
  "message": "无权限访问父文件夹",
  "error": "PERMISSION_DENIED"
}
```

**错误响应 (409) - 文件夹名称已存在：**
```json
{
  "code": 409,
  "message": "文件夹名称已存在",
  "error": "DUPLICATE_ERROR"
}
```

---

### 3. 更新文件夹

**PUT** `/api/v1/assets/folders/:id`

更新文件夹名称。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文件夹 ID |

#### 请求体

```json
{
  "name": "新文件夹名称"
}
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `name` | string | 是 | 新的文件夹名称，不能为空，会自动去除首尾空格 |

#### 请求示例

```http
PUT http://localhost:3000/api/v1/assets/folders/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "更新后的文件夹名称"
}
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "更新文件夹成功",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
    "name": "更新后的文件夹名称",
    "parent_id": null,
    "created_at": "2026-01-12T10:00:00.000Z",
    "updated_at": "2026-01-12T12:30:00.000Z"
  }
}
```

**错误响应 (404) - 文件夹不存在：**
```json
{
  "code": 404,
  "message": "文件夹不存在",
  "error": "NOT_FOUND"
}
```

**错误响应 (403) - 无权限：**
```json
{
  "code": 403,
  "message": "无权限操作此文件夹",
  "error": "PERMISSION_DENIED"
}
```

**错误响应 (409) - 文件夹名称已存在：**
```json
{
  "code": 409,
  "message": "文件夹名称已存在",
  "error": "DUPLICATE_ERROR"
}
```

---

### 4. 删除文件夹

**DELETE** `/api/v1/assets/folders/:id`

删除指定的文件夹。注意：如果文件夹包含子文件夹，将无法删除。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文件夹 ID |

#### 请求示例

```http
DELETE http://localhost:3000/api/v1/assets/folders/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "删除文件夹成功"
}
```

**错误响应 (404) - 文件夹不存在：**
```json
{
  "code": 404,
  "message": "文件夹不存在",
  "error": "NOT_FOUND"
}
```

**错误响应 (403) - 无权限：**
```json
{
  "code": 403,
  "message": "无权限操作此文件夹",
  "error": "PERMISSION_DENIED"
}
```

**错误响应 (400) - 包含子文件夹：**
```json
{
  "code": 400,
  "message": "无法删除包含子文件夹的文件夹",
  "error": "VALIDATION_ERROR"
}
```

---

### 5. 获取文件夹中的文件列表

**GET** `/api/v1/assets/folders/:id/items`

获取指定文件夹中包含的文件列表。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文件夹 ID |

#### 查询参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `limit` | number | 否 | 100 | 每页返回的文件数量 |
| `offset` | number | 否 | 0 | 分页偏移量 |

#### 请求示例

```http
GET http://localhost:3000/api/v1/assets/folders/550e8400-e29b-41d4-a716-446655440000/items?limit=20&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "获取文件夹文件列表成功",
  "data": {
    "items": [
      {
        "id": "media-uuid-1",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "type": "photo",
        "assets_type": "image/jpeg",
        "label": "我的图片1.jpg",
        "url": "https://minio.example.com/media/photo/xxx.jpg",
        "task_id": "task-uuid-1",
        "description": null,
        "prompts_meta": null,
        "created_at": "2026-01-12T10:00:00.000Z"
      },
      {
        "id": "media-uuid-2",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "type": "text",
        "assets_type": "text/plain",
        "label": "我的文档.txt",
        "url": "https://minio.example.com/media/text/xxx.txt",
        "task_id": "task-uuid-2",
        "description": "文档描述",
        "prompts_meta": "{\"prompt\":\"...\"}",
        "created_at": "2026-01-12T11:00:00.000Z"
      }
    ],
    "total": 2
  }
}
```

**空文件夹响应 (200):**
```json
{
  "code": 200,
  "message": "获取文件夹文件列表成功",
  "data": {
    "items": [],
    "total": 0
  }
}
```

**错误响应 (404) - 文件夹不存在：**
```json
{
  "code": 404,
  "message": "文件夹不存在",
  "error": "NOT_FOUND"
}
```

**错误响应 (403) - 无权限：**
```json
{
  "code": 403,
  "message": "无权限访问此文件夹",
  "error": "PERMISSION_DENIED"
}
```

---

### 6. 添加文件到文件夹

**POST** `/api/v1/assets/folders/:id/items`

将文件添加到指定文件夹。同一个文件可以添加到多个文件夹。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文件夹 ID |

#### 请求体

```json
{
  "task_id": "任务ID（来自任务列表）"
}
```

或者（向后兼容）：

```json
{
  "media_item_id": "user_media表的UUID（向后兼容）"
}
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `task_id` | string | 是 | 生成任务的 ID（例如：`"179e8d883c76179205af5"`），系统会通过 `task_id` 查找对应的 `user_media` 记录 |
| `media_item_id` | string (UUID) | 否 | 向后兼容字段，如果提供了 UUID 格式的值，会直接使用（不推荐，建议使用 `task_id`） |

#### `media_item_id` 说明

`media_item_id` 是 `user_media` 表中的 `id` 字段，是一个 UUID 格式的字符串。

**`user_media` 表结构：**
```sql
CREATE TABLE user_media (
  id UUID PRIMARY KEY,                    -- 这就是 media_item_id
  user_id UUID NOT NULL,                  -- 用户 ID
  type VARCHAR(32) NOT NULL,              -- 媒体类型：photo / video / music / illustration / text / voice
  assets_type VARCHAR(64) NOT NULL,       -- 文件类型：image/jpeg, video/mp4, audio/mpeg 等
  label VARCHAR(255) NOT NULL,            -- 文件名称
  url TEXT NOT NULL,                      -- 文件存储路径或完整 URL
  task_id VARCHAR(128) NOT NULL,          -- 生成任务的 ID
  description TEXT,                        -- 可选描述
  prompts_meta TEXT,                       -- 生成任务参数（JSON 字符串）
  created_at TIMESTAMP DEFAULT NOW()
);
```

**如何获取文件夹 ID：**

1. **从文件夹列表接口获取**（推荐）：
   ```http
   GET http://localhost:3000/api/v1/assets/folders
   Authorization: Bearer {{access_token}}
   ```
   
   响应示例：
   ```json
   {
     "code": 200,
     "message": "获取文件夹列表成功",
     "data": {
       "folders": [
         {
           "id": "550e8400-e29b-41d4-a716-446655440000",  // ← 这就是文件夹 ID（UUID）
           "name": "我的文件夹",
           "parent_id": null,
           "created_at": "2026-01-12T10:00:00.000Z",
           "updated_at": "2026-01-12T10:00:00.000Z"
         }
       ],
       "total": 1
     }
   }
   ```

2. **创建文件夹后获取**：
   ```http
   POST http://localhost:3000/api/v1/assets/folders
   Authorization: Bearer {{access_token}}
   Content-Type: application/json
   
   {
     "name": "新文件夹"
   }
   ```
   
   响应中的 `id` 字段就是新创建的文件夹 ID（UUID）。

**如何获取 `task_id`：**

1. **从任务列表接口获取**（推荐）：
   ```http
   GET http://localhost:3000/api/v1/cgi-tasks?type=writing&limit=20
   Authorization: Bearer {{access_token}}
   ```
   
   响应示例：
   ```json
   {
     "success": true,
     "data": {
       "tasks": [
         {
           "id": "179e8d883c76179205af5",  // ← 这就是 task_id
           "type": "writing",
           "status": "completed",
           "result": {
             "storageInfo": {
               "url": "http://localhost:9000/user-media/..."
             }
           },
           "createdAt": "2026-01-09T01:45:22.903Z"
         }
       ]
     }
   }
   ```

2. **从用户媒体列表接口获取**（如果已同步到 user_media 表）：
   ```http
   GET http://localhost:3000/api/v1/account/media?type=photo&page=1&limit=20
   Authorization: Bearer {{access_token}}
   ```
   
   响应中的 `task_id` 字段就是任务 ID：
   ```json
   {
     "data": {
       "items": [
         {
           "id": "550e8400-e29b-41d4-a716-446655440000",  // user_media.id (UUID)
           "task_id": "179e8d883c76179205af5",  // ← 这就是 task_id
           "type": "photo",
           "label": "我的图片.jpg",
           ...
         }
       ]
     }
   }
   ```

3. **从文件夹内容接口获取**：
   ```http
   GET http://localhost:3000/api/v1/assets/folders/{{folder_id}}/items
   Authorization: Bearer {{access_token}}
   ```
   
   响应中的文件项包含 `task_id` 字段，这就是任务 ID。

**注意事项：**
- `task_id` 是字符串格式，不一定是 UUID（例如：`"179e8d883c76179205af5"`）
- 任务必须已完成并已同步到 `user_media` 表
- 如果任务未同步到 `user_media` 表，接口会返回 404 错误
- 同一个文件（任务）可以添加到多个文件夹中
- 从文件夹移除文件不会删除文件本身，只是移除关联关系

#### 请求示例

```http
POST http://localhost:3000/api/v1/assets/folders/550e8400-e29b-41d4-a716-446655440000/items
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "task_id": "179e8d883c76179205af5"
}
```

#### 响应示例

**成功响应 (201):**
```json
{
  "code": 201,
  "message": "添加文件到文件夹成功"
}
```

**错误响应 (400) - 任务ID为空：**
```json
{
  "code": 400,
  "message": "任务 ID (task_id) 不能为空",
  "error": "VALIDATION_ERROR"
}
```

**错误响应 (404) - 文件夹不存在：**
```json
{
  "code": 404,
  "message": "文件夹不存在",
  "error": "NOT_FOUND"
}
```

**错误响应 (404) - 任务不存在：**
```json
{
  "code": 404,
  "message": "未找到任务 ID \"179e8d883c76179205af5\" 或该任务不属于当前用户",
  "error": "NOT_FOUND"
}
```

**错误响应 (403) - 无权限：**
```json
{
  "code": 403,
  "message": "无权限操作此文件夹",
  "error": "PERMISSION_DENIED"
}
```

---

### 7. 从文件夹移除文件

**DELETE** `/api/v1/assets/folders/:id/items/:taskId`

从文件夹中移除指定的文件（不会删除文件本身，只是移除关联关系）。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文件夹 ID |
| `taskId` | string | 是 | 任务 ID（例如：`"179e8d883c76179205af5"`）或 `user_media.id`（UUID 格式，向后兼容） |

#### 请求示例

```http
DELETE http://localhost:3000/api/v1/assets/folders/550e8400-e29b-41d4-a716-446655440000/items/179e8d883c76179205af5
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "从文件夹移除文件成功"
}
```

**错误响应 (404) - 文件夹不存在：**
```json
{
  "code": 404,
  "message": "文件夹不存在",
  "error": "NOT_FOUND"
}
```

**错误响应 (403) - 无权限：**
```json
{
  "code": 403,
  "message": "无权限操作此文件夹",
  "error": "PERMISSION_DENIED"
}
```

---

### 8. 获取文件所属的文件夹列表

**GET** `/api/v1/assets/items/:mediaItemId/folders`

获取指定文件所属的所有文件夹列表（一个文件可以属于多个文件夹）。

> **注意**：此接口目前在后端实现中，但路由可能未暴露。如需使用，需要在 `mxmauth/src/routes/assets.ts` 中添加路由。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `mediaItemId` | string | 是 | 媒体文件 ID |

#### 请求示例

```http
GET http://localhost:3000/api/v1/assets/items/media-uuid-1/folders
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "获取文件所属文件夹列表成功",
  "data": {
    "folders": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "name": "我的图片",
        "parent_id": null,
        "created_at": "2026-01-12T10:00:00.000Z",
        "updated_at": "2026-01-12T10:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### 9. 获取文件夹路径

**GET** `/api/v1/assets/folders/:id/path`

获取文件夹的完整路径（从根目录到当前文件夹）。

> **注意**：此接口目前在后端实现中，但路由可能未暴露。如需使用，需要在 `mxmauth/src/routes/assets.ts` 中添加路由。

#### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文件夹 ID |

#### 请求示例

```http
GET http://localhost:3000/api/v1/assets/folders/770e8400-e29b-41d4-a716-446655440002/path
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 响应示例

**成功响应 (200):**
```json
{
  "code": 200,
  "message": "获取文件夹路径成功",
  "data": {
    "path": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "name": "我的图片",
        "parent_id": null,
        "created_at": "2026-01-12T10:00:00.000Z",
        "updated_at": "2026-01-12T10:00:00.000Z"
      },
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
        "name": "子文件夹",
        "parent_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2026-01-12T12:00:00.000Z",
        "updated_at": "2026-01-12T12:00:00.000Z"
      }
    ]
  }
}
```

---

## 完整测试用例

### 测试场景 1：完整的文件夹管理流程

```bash
# 1. 登录获取 Token
curl -X POST http://localhost:3000/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# 保存返回的 access_token 为 TOKEN 变量

# 2. 创建根目录文件夹
curl -X POST http://localhost:3000/api/v1/assets/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"我的工作"}'

# 保存返回的文件夹 ID 为 FOLDER_ID

# 3. 获取文件夹列表（验证创建成功）
curl -X GET "http://localhost:3000/api/v1/assets/folders?parent_id=" \
  -H "Authorization: Bearer $TOKEN"

# 4. 创建子文件夹
curl -X POST http://localhost:3000/api/v1/assets/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"项目A\",\"parent_id\":\"$FOLDER_ID\"}"

# 保存返回的子文件夹 ID 为 SUB_FOLDER_ID

# 5. 更新文件夹名称
curl -X PUT "http://localhost:3000/api/v1/assets/folders/$FOLDER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"我的工作（已更新）"}'

# 6. 添加文件到文件夹（需要先有一个 task_id）
curl -X POST "http://localhost:3000/api/v1/assets/folders/$FOLDER_ID/items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task_id":"179e8d883c76179205af5"}'

# 7. 获取文件夹中的文件列表
curl -X GET "http://localhost:3000/api/v1/assets/folders/$FOLDER_ID/items" \
  -H "Authorization: Bearer $TOKEN"

# 8. 从文件夹移除文件
curl -X DELETE "http://localhost:3000/api/v1/assets/folders/$FOLDER_ID/items/179e8d883c76179205af5" \
  -H "Authorization: Bearer $TOKEN"

# 9. 删除子文件夹
curl -X DELETE "http://localhost:3000/api/v1/assets/folders/$SUB_FOLDER_ID" \
  -H "Authorization: Bearer $TOKEN"

# 10. 删除根文件夹
curl -X DELETE "http://localhost:3000/api/v1/assets/folders/$FOLDER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### 测试场景 2：错误处理测试

```bash
# 1. 未认证请求（应该返回 401）
curl -X GET http://localhost:3000/api/v1/assets/folders

# 2. 无效的 Token（应该返回 401）
curl -X GET http://localhost:3000/api/v1/assets/folders \
  -H "Authorization: Bearer invalid-token"

# 3. 创建空名称的文件夹（应该返回 400）
curl -X POST http://localhost:3000/api/v1/assets/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":""}'

# 4. 创建不存在的父文件夹（应该返回 404）
curl -X POST http://localhost:3000/api/v1/assets/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试","parent_id":"non-existent-id"}'

# 5. 更新不存在的文件夹（应该返回 404）
curl -X PUT "http://localhost:3000/api/v1/assets/folders/non-existent-id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试"}'

# 6. 添加不存在的任务（应该返回 404）
curl -X POST "http://localhost:3000/api/v1/assets/folders/$FOLDER_ID/items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task_id":"non-existent-task-id"}'
```

---

## 错误码说明

| 错误码 | HTTP 状态 | 说明 | 示例场景 |
|--------|-----------|------|----------|
| `UNAUTHORIZED` | 401 | 未认证或 Token 无效 | 未提供 Token 或 Token 已过期 |
| `NOT_FOUND` | 404 | 资源不存在 | 访问不存在的文件夹或文件 |
| `PERMISSION_DENIED` | 403 | 无权限操作 | 尝试操作其他用户的文件夹 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 | 文件夹名称为空、删除包含子文件夹的文件夹 |
| `DUPLICATE_ERROR` | 409 | 资源已存在 | 在同一父目录下创建重名文件夹 |

---

## 注意事项

1. **用户隔离**：每个用户只能操作自己的文件夹和文件
2. **嵌套限制**：删除文件夹前必须先删除所有子文件夹
3. **文件关联**：添加文件到文件夹不会复制文件，只是建立关联关系。同一个文件可以添加到多个文件夹
4. **删除文件**：从文件夹移除文件不会删除文件本身，只是移除关联关系
5. **唯一性约束**：同一用户在同一父目录下不能创建重名文件夹
6. **表不存在处理**：如果数据库表尚未创建，接口会返回空数组而不是错误，避免前端报错
7. **分页支持**：获取文件列表接口支持 `limit` 和 `offset` 参数进行分页
8. **task_id 使用**：接口接受 `task_id`（任务 ID），系统会自动查找对应的 `user_media` 记录。可以通过 `/api/v1/cgi-tasks` 接口获取任务列表，每个任务的 `id` 就是 `task_id`

---

## 数据库表结构

### folders 表

```sql
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_folder_name_per_parent UNIQUE (user_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
```

### folder_items 表

```sql
CREATE TABLE IF NOT EXISTS folder_items (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  media_item_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (folder_id, media_item_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_items_folder_id ON folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_items_media_item_id ON folder_items(media_item_id);
```

---

## Postman Collection

完整的 Postman Collection 文件已保存在：
`mxmauth/文件夹管理API.postman_collection.json`

可以直接导入到 Postman 中使用。
