# CGI Task 通知系统实现

## 概述

已实现按模块管理的通知系统，专门为 CGI Task（mxmcgi 模块）设计了通知处理器。当任务状态变更时，系统会自动发送通知到前端。

## 架构设计

### 1. 模块化通知系统

```
mxmcgi (任务状态变更)
    ↓ HTTP POST
mxmnotify/task-events/status-changed
    ↓
ModuleNotificationService
    ↓
CgiTaskNotificationHandler (CGI 任务专用处理器)
    ↓
WebSocket + SSE 推送
    ↓
前端接收通知
```

### 2. 核心组件

#### mxmnotify 模块

1. **类型定义** (`src/types/notification.types.ts`)
   - `ModuleType`: 模块类型枚举
   - `TaskStatus`: 任务状态枚举
   - `NotificationHandler`: 通知处理器接口
   - `AsyncTaskStatusChangedEvent`: 任务状态变更事件

2. **通知处理器**
   - `BaseNotificationHandler`: 基础处理器（兜底）
   - `CgiTaskNotificationHandler`: CGI 任务专用处理器

3. **服务**
   - `ModuleNotificationService`: 模块化通知服务
   - `WebSocketService`: WebSocket 实时推送服务

4. **路由**
   - `POST /task-events/status-changed`: 接收任务状态变更事件
   - `WS /ws/notifications`: WebSocket 连接端点

#### mxmcgi 模块

1. **通知 Hook** (`src/core/task/notification-hook.ts`)
   - `sendTaskStatusNotification`: 发送任务状态通知

2. **集成点** (`src/core/task/task-manager.ts`)
   - `setTaskResult`: 任务完成时发送通知
   - `setTaskError`: 任务失败时发送通知
   - `updateTaskStatus`: 状态变更时发送通知

## 使用方式

### 1. 后端发送通知

在 mxmcgi 中，任务状态变更时会自动发送通知，无需手动调用。

**自动触发场景**：
- 任务完成 (`setTaskResult`)
- 任务失败 (`setTaskError`)
- 状态更新为 completed/failed (`updateTaskStatus`)

**手动发送通知**（如果需要）：

```typescript
import { sendTaskStatusNotification } from './core/task/notification-hook';

// 发送任务完成通知
await sendTaskStatusNotification(
  task,
  'completed',
  '任务已完成'
);

// 发送任务失败通知
await sendTaskStatusNotification(
  task,
  'failed',
  '任务执行失败：网络错误'
);
```

### 2. 前端接收通知

#### WebSocket 连接

```typescript
// 连接 WebSocket
const ws = new WebSocket('ws://localhost:3000/api/v1/ws/notifications?token=YOUR_JWT_TOKEN');

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.event) {
    case 'task_completed':
      // 处理任务完成
      console.log('Task completed:', message.data);
      refreshTaskList();
      break;
      
    case 'task_failed':
      // 处理任务失败
      console.log('Task failed:', message.data);
      refreshTaskList();
      break;
      
    case 'task_updated':
      // 处理任务更新
      console.log('Task updated:', message.data);
      break;
  }
};
```

#### 消息格式

**服务端推送的消息**：

```json
{
  "type": "notification",
  "event": "task_completed",
  "data": {
    "notification": {
      "id": "notification-id",
      "title": "图片生成完成",
      "content": "您的图片已生成完成，共生成 1 个文件，点击查看。",
      "action_url": "/media/graph/task-id"
    },
    "task": {
      "id": "task-id",
      "status": "completed",
      "module_type": "mxmcgi",
      "task_type": "image",
      "model_name": "seedream-4"
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## 通知类型

### CGI Task 通知类型

根据任务类型和状态，系统会自动生成不同的通知：

1. **任务完成** (`task_completed`)
   - 标题：`{任务类型}生成完成`（如：图片生成完成）
   - 内容：包含生成文件数量
   - 跳转：根据任务类型跳转到对应页面

2. **任务失败** (`task_failed`)
   - 标题：`{任务类型}生成失败`
   - 内容：包含错误信息
   - 跳转：任务详情页

3. **任务更新** (`task_updated`)
   - 标题：`{任务类型}任务状态更新`
   - 内容：状态更新信息

### 支持的任务类型

- `writing`: 写作任务
- `image` / `graph`: 图片生成
- `video`: 视频生成
- `audio`: 音频生成
- `text`: 文本生成

## 配置

### 环境变量

**mxmnotify**:
- `PORT`: 服务端口（默认 4005）
- `MXMNOTIFY_URL`: 服务 URL（用于内部调用）

**mxmcgi**:
- `MXMNOTIFY_URL`: mxmnotify 服务地址（默认 `http://localhost:4005`）

### Gateway 配置

Gateway 需要配置 WebSocket 代理：

```typescript
// gateway/src/routes/proxy.ts
router.use('/ws/notifications', 
  authMiddleware,
  createProxyMiddleware({
    target: `ws://${process.env.MXMNOTIFY_URL || 'localhost:4005'}`,
    ws: true,
    changeOrigin: true,
  })
);
```

## 扩展

### 添加新的模块处理器

1. 创建处理器类：

```typescript
// mxmnotify/src/handlers/payment.handler.ts
import { PaymentNotificationHandler } from './base.handler';
import { ModuleType } from '../types/notification.types';

export class PaymentNotificationHandler extends BaseNotificationHandler {
  supports(module_type: ModuleType | string): boolean {
    return module_type === ModuleType.MXMPAY;
  }
  
  // 实现自定义逻辑
}
```

2. 注册处理器：

```typescript
// mxmnotify/src/services/module-notification.service.ts
import { PaymentNotificationHandler } from '../handlers/payment.handler';

constructor() {
  // ...
  this.registerHandler(new PaymentNotificationHandler());
}
```

## 测试

### 测试通知发送

```bash
# 发送任务完成通知
curl -X POST http://localhost:4005/task-events/status-changed \
  -H "Content-Type: application/json" \
  -d '{
    "module_type": "mxmcgi",
    "task_id": "test-task-123",
    "user_id": "test-user-456",
    "task_status": "completed",
    "task_status_message": "任务已完成",
    "metadata": {
      "task_type": "image",
      "model_name": "seedream-4",
      "media_count": 1
    }
  }'
```

### 测试 WebSocket 连接

```javascript
// 使用 wscat 工具测试
wscat -c "ws://localhost:4005/ws/notifications?token=YOUR_TOKEN"

// 发送心跳
{"type": "ping"}

// 订阅事件
{"type": "subscribe", "payload": {"events": ["task_completed", "task_failed"]}}
```

## 注意事项

1. **通知失败不影响主流程**：通知发送失败不会影响任务状态更新
2. **自动重连**：WebSocket 连接断开后需要前端实现自动重连
3. **认证**：WebSocket 连接需要 JWT Token 认证
4. **向后兼容**：保留 SSE 支持，确保现有功能不受影响

## 下一步

1. ✅ 后端通知系统已实现
2. ⏳ Gateway WebSocket 代理配置
3. ⏳ 前端 WebSocket 客户端实现
4. ⏳ 前端集成到媒体页面

