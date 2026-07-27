# CGI Task 异步任务系统

> **HTTP 变更（2026-05）**：对外的任务创建/列表/详情/取消等 REST 已迁至 **`/api/v2/tasks/*`**（实现于 `src/tasks/routes.ts` + `task-http-handlers.ts`）。下文中的 `/api/v1/cgi-tasks` 路径已废弃；数据仍落在 **`cgi_tasks`** 表。

## 概述

CGI Task 系统统一管理所有生成物料的异步任务，支持：
- **统一接口**：无论同步（DeerAPI）还是异步（Replicate），都通过任务系统管理
- **进度跟踪**：实时更新任务进度和状态
- **结果格式**：支持 base64 和 MinIO URL 两种格式
- **任务查询**：通过任务 ID 查询状态、进度、结果

## 数据库表

表名：`cgi_tasks`（避免与其他模块命名冲突）

```sql
CREATE TABLE cgi_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  task_type VARCHAR(50) NOT NULL,  -- 'text' | 'image' | 'video' | 'audio'
  model_name VARCHAR(100) NOT NULL,
  model_provider VARCHAR(50),       -- 'replicate' | 'ppio' | 'deer'
  status VARCHAR(50) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,       -- 0-100
  error_message TEXT,
  input_data JSONB NOT NULL,
  prompt TEXT,
  output_data JSONB,
  result_format VARCHAR(20) DEFAULT 'base64',  -- 'base64' | 'minio'
  storage_info JSONB,
  queued_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);
```

## 核心组件

### 1. TaskManager（任务管理器）
- 创建、查询、更新、取消任务
- 使用数据库存储（`DatabaseTaskStorage`）

### 2. TaskExecutor（任务执行器）
- 统一处理同步和异步任务
- 监听进度流，更新任务状态
- 处理结果存储（base64 或 MinIO）

### 3. DatabaseTaskStorage（数据库存储适配器）
- 将 Task 接口适配到 CGITask 数据库模型
- 实现 TaskStorage 接口

## API 接口

### 创建任务
```http
POST /api/v1/cgi-tasks
Headers:
  x-user-id: <userId>
Content-Type: application/json

{
  "type": "image",              // 'text' | 'image' | 'video' | 'audio'
  "model": "nano-banana",       // 模型名称
  "provider": "deer",           // 可选：'replicate' | 'ppio' | 'deer'
  "params": {                   // 生成参数
    "prompt": "...",
    "aspect_ratio": "16:9",
    ...
  },
  "storeToMinio": false,        // 是否存储到 MinIO（默认 false，返回 base64）
  "storageConfig": {           // MinIO 存储配置（如果 storeToMinio 为 true）
    "bucket": "user-media",
    "pathTemplate": "generated/{userId}/{date}/{timestamp}-{randomId}.{ext}"
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "taskId": "uuid",
    "status": "pending",
    "createdAt": "2025-01-15T12:34:56Z"
  }
}
```

### 查询任务详情
```http
GET /api/v1/cgi-tasks/:taskId
Headers:
  x-user-id: <userId>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "image",
    "status": "completed",
    "progress": {
      "status": "completed",
      "progress": 100,
      "startedAt": "2025-01-15T12:34:56Z",
      "completedAt": "2025-01-15T12:35:10Z"
    },
    "result": {
      "mediaUrls": ["data:image/png;base64,..."],  // 或 MinIO URL
      "storageInfo": {                              // 如果存储到 MinIO
        "keys": ["generated/..."],
        "bucket": "user-media",
        "urls": ["http://..."]
      },
      "metadata": {...}
    },
    "metadata": {
      "model": "nano-banana",
      "provider": "deer",
      "userId": "user-123"
    },
    "createdAt": "2025-01-15T12:34:56Z",
    "updatedAt": "2025-01-15T12:35:10Z"
  }
}
```

### 查询任务列表
```http
GET /api/v1/cgi-tasks?type=image&status=completed&limit=20&offset=0
Headers:
  x-user-id: <userId>
```

### 取消任务
```http
POST /api/v1/cgi-tasks/:taskId/cancel
Headers:
  x-user-id: <userId>
```

## 统一处理方案

### 同步任务（DeerAPI）
1. 创建任务（status: pending）
2. 立即调用生成接口
3. 直接返回结果，更新任务状态为 completed
4. 如果启用进度流，发送 `starting` → `succeeded` 事件

### 异步任务（Replicate）
1. 创建任务（status: pending）
2. 更新状态为 queued
3. 调用生成接口（启用进度流）
4. 监听进度流，更新任务进度
5. 任务完成时更新状态为 completed，保存结果

## 结果格式

### Base64 格式（默认）
```json
{
  "result": {
    "mediaUrls": [
      "data:image/png;base64,iVBORw0KGgo..."
    ]
  }
}
```

### MinIO URL 格式
```json
{
  "result": {
    "mediaUrls": [
      "http://localhost:9000/user-media/generated/user123/20241217/1702800000-abc123.png"
    ],
    "storageInfo": {
      "keys": ["generated/user123/20241217/1702800000-abc123.png"],
      "bucket": "user-media",
      "urls": ["http://..."]
    }
  }
}
```

## 使用示例

### 创建图片生成任务（返回 base64）
```typescript
const response = await fetch('/api/v1/cgi-tasks', {
  method: 'POST',
  headers: {
    'x-user-id': 'user-123',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'image',
    model: 'nano-banana',
    params: {
      prompt: 'A beautiful sunset',
      aspect_ratio: '16:9',
    },
    storeToMinio: false,  // 返回 base64
  }),
});

const { taskId } = response.data;

// 轮询查询任务状态
const task = await fetch(`/api/v1/cgi-tasks/${taskId}`, {
  headers: { 'x-user-id': 'user-123' },
});

if (task.data.status === 'completed') {
  const imageUrl = task.data.result.mediaUrls[0]; // base64 data URL
}
```

### 创建图片生成任务（存储到 MinIO）
```typescript
const response = await fetch('/api/v1/cgi-tasks', {
  method: 'POST',
  headers: {
    'x-user-id': 'user-123',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'image',
    model: 'nano-banana',
    params: {
      prompt: 'A beautiful sunset',
    },
    storeToMinio: true,  // 存储到 MinIO
    storageConfig: {
      bucket: 'user-media',
      pathTemplate: 'generated/{userId}/{date}/{timestamp}-{randomId}.{ext}',
    },
  }),
});
```
