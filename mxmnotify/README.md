# mxmnotify - 任务和通知服务

## 概述

mxmnotify 服务负责管理生成任务的生命周期和发送通知，使用户无需在页面等待异步任务完成。

## 功能特性

1. **任务管理**
   - 创建生成任务（图片/文本）
   - 更新任务状态（pending → processing → completed/failed）
   - 查询任务详情和列表

2. **通知系统**
   - 任务完成时自动发送通知
   - 任务失败时发送错误通知
   - 通知已读/未读管理

## 数据库结构

### generation_tasks 表
- `id`: 任务 ID (UUID)
- `user_id`: 用户 ID
- `task_type`: 任务类型 ('graph' | 'text')
- `model_name`: 模型名称
- `status`: 任务状态 ('pending' | 'processing' | 'completed' | 'failed')
- `prompt`: 提示词
- `params`: 任务参数 (JSONB)
- `result`: 生成结果 (JSONB)
- `error_message`: 错误信息
- `started_at`: 开始时间
- `completed_at`: 完成时间

### notifications 表
- `id`: 通知 ID (UUID)
- `user_id`: 用户 ID
- `task_id`: 关联的任务 ID
- `type`: 通知类型 ('task_completed' | 'task_failed' | 'system')
- `title`: 通知标题
- `content`: 通知内容
- `data`: 附加数据 (JSONB)
- `is_read`: 是否已读
- `read_at`: 阅读时间

## API 接口

### 任务管理

#### 创建任务
```http
POST /tasks
Content-Type: application/json

{
  "user_id": "user-uuid",
  "task_type": "graph" | "text",
  "model_name": "seedream-4",
  "prompt": "A beautiful landscape",
  "params": { ... }
}
```

#### 更新任务
```http
PUT /tasks/:taskId
Content-Type: application/json

{
  "status": "completed" | "failed",
  "result": { ... },
  "error_message": "..."
}
```

#### 获取任务详情
```http
GET /tasks/:taskId
```

#### 获取用户任务列表
```http
GET /tasks/user/:userId?status=completed&task_type=graph&limit=20&offset=0
```

### 通知管理

#### 发送任务完成通知（内部接口）
```http
POST /notifications/task-completed
Content-Type: application/json

{
  "task_id": "task-uuid"
}
```

#### 发送任务失败通知（内部接口）
```http
POST /notifications/task-failed
Content-Type: application/json

{
  "task_id": "task-uuid"
}
```

#### 获取用户通知列表
```http
GET /notifications/user/:userId?is_read=false&limit=20&offset=0
```

#### 标记通知为已读
```http
PUT /notifications/:notificationId/read
```

#### 标记所有通知为已读
```http
PUT /notifications/user/:userId/read-all
```

## 集成流程

### 1. 在 Gateway 中自动创建任务

当用户发起生成请求时，Gateway 会自动：
1. 创建任务（status: 'pending'）
2. 更新任务状态为 'processing'
3. 生成完成后更新任务为 'completed' 并发送通知
4. 生成失败时更新任务为 'failed' 并发送失败通知

### 2. 控制通知行为

在生成请求中可以添加参数：
```json
{
  "prompt": "...",
  "enable_notification": true  // 默认 true，设为 false 可禁用通知
}
```

### 3. 前端使用

#### 方式一：SSE 实时推送（推荐）

通过 Server-Sent Events 主动接收通知，无需轮询：

```javascript
// 建立 SSE 连接
const eventSource = new EventSource(`/api/v1/sse/${userId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// 监听任务完成事件
eventSource.addEventListener('task_completed', (e) => {
  const data = JSON.parse(e.data);
  console.log('Task completed:', data);
  // 处理任务完成通知
});

// 监听任务失败事件
eventSource.addEventListener('task_failed', (e) => {
  const data = JSON.parse(e.data);
  console.log('Task failed:', data);
  // 处理任务失败通知
});
```

**详细使用指南**：请参考 [SSE_USAGE.md](./SSE_USAGE.md)

#### 方式二：轮询任务状态（备选）

如果 SSE 不可用，可以轮询任务状态：
```javascript
// 发起生成请求后，轮询任务状态
const taskId = 'task-uuid';
setInterval(async () => {
  const task = await fetch(`/api/v1/tasks/${taskId}`);
  if (task.status === 'completed') {
    // 处理完成
  }
}, 2000);
```

#### 方式三：轮询通知列表（备选）

轮询未读通知：
```javascript
setInterval(async () => {
  const notifications = await fetch('/api/v1/notifications/user/:userId?is_read=false');
  // 处理新通知
}, 2000);
```

## 环境变量

```bash
# mxmnotify 端口
PORT=4005

# Supabase 配置（与 mxmdata 一致）
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

## 数据库初始化

执行 SQL 文件创建表结构：
```bash
psql -h localhost -U postgres -d mxmai -f mxmdata/src/database/schemas/mxmnotify.sql
```

## 启动服务

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

## 注意事项

1. **任务创建时机**：任务在 Gateway 的 `onProxyReq` 阶段创建，确保在生成开始前记录
2. **通知发送时机**：在生成完成后异步发送，不阻塞响应
3. **流式响应处理**：对于文本生成的流式响应，任务完成状态可能需要特殊处理
4. **错误处理**：所有任务和通知操作都是异步的，失败不会影响主流程
