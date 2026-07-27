# SSE (Server-Sent Events) 使用指南

## 概述

mxmnotify 服务支持通过 Server-Sent Events (SSE) 主动推送通知给用户，无需轮询。

## 前端集成

### 1. 建立 SSE 连接

```javascript
// 使用原生 EventSource API
const userId = 'your-user-id';
const token = 'your-auth-token';

const eventSource = new EventSource(
  `http://localhost:3000/api/v1/sse/${userId}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// 注意：原生 EventSource 不支持自定义 headers
// 如果使用原生 API，需要在 URL 中传递 token 或使用 cookie
// 或者使用 fetch + ReadableStream 实现
```

### 2. 使用 fetch + ReadableStream（推荐，支持自定义 headers）

```javascript
async function connectSSE(userId, token) {
  const response = await fetch(`http://localhost:3000/api/v1/sse/${userId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
    },
  });

  if (!response.ok) {
    throw new Error(`SSE connection failed: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    let event = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data = line.substring(5).trim();
      } else if (line === '' && event && data) {
        // 处理完整的事件
        handleSSEEvent(event, JSON.parse(data));
        event = '';
        data = '';
      }
    }
  }
}

function handleSSEEvent(event, data) {
  switch (event) {
    case 'connected':
      console.log('SSE connected:', data);
      break;
    case 'task_completed':
      console.log('Task completed:', data);
      // 处理任务完成通知
      showNotification(data.notification);
      break;
    case 'task_failed':
      console.log('Task failed:', data);
      // 处理任务失败通知
      showErrorNotification(data.notification);
      break;
    case 'notification':
      console.log('New notification:', data);
      // 处理通用通知
      showNotification(data.notification);
      break;
  }
}

// 连接
connectSSE(userId, token).catch(console.error);
```

### 3. React Hook 示例

```typescript
import { useEffect, useState } from 'react';

interface SSEMessage {
  type: string;
  data: any;
  timestamp: string;
}

export function useSSE(userId: string, token: string) {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let abortController: AbortController | null = null;

    async function connect() {
      abortController = new AbortController();

      try {
        const response = await fetch(`http://localhost:3000/api/v1/sse/${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream',
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.statusText}`);
        }

        setConnected(true);
        reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          let event = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              event = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.substring(5).trim();
            } else if (line === '' && event && data) {
              try {
                const parsedData = JSON.parse(data);
                setMessages(prev => [...prev, {
                  type: event,
                  data: parsedData,
                  timestamp: new Date().toISOString(),
                }]);
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
              event = '';
              data = '';
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('SSE connection error:', error);
          setConnected(false);
        }
      }
    }

    connect();

    return () => {
      if (abortController) {
        abortController.abort();
      }
      if (reader) {
        reader.cancel();
      }
      setConnected(false);
    };
  }, [userId, token]);

  return { messages, connected };
}

// 使用示例
function NotificationComponent() {
  const { userId, token } = useAuth();
  const { messages, connected } = useSSE(userId, token);

  useEffect(() => {
    messages.forEach(msg => {
      if (msg.type === 'task_completed') {
        // 显示任务完成通知
        toast.success(`任务完成: ${msg.data.notification.title}`);
      } else if (msg.type === 'task_failed') {
        // 显示任务失败通知
        toast.error(`任务失败: ${msg.data.notification.title}`);
      }
    });
  }, [messages]);

  return (
    <div>
      {connected ? (
        <span>实时通知已连接</span>
      ) : (
        <span>正在连接实时通知...</span>
      )}
    </div>
  );
}
```

## 事件类型

### 1. connected
连接建立时发送：
```json
{
  "message": "SSE connection established"
}
```

### 2. task_completed
任务完成时发送：
```json
{
  "type": "task_completed",
  "task": {
    "id": "task-uuid",
    "task_type": "graph",
    "model_name": "seedream-4",
    "status": "completed",
    "result": {
      "image_urls": ["https://..."]
    }
  },
  "notification": {
    "id": "notification-uuid",
    "title": "图片生成任务已完成",
    "content": "...",
    ...
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 3. task_failed
任务失败时发送：
```json
{
  "type": "task_failed",
  "task": {
    "id": "task-uuid",
    "task_type": "graph",
    "model_name": "seedream-4",
    "status": "failed",
    "error_message": "..."
  },
  "notification": {
    "id": "notification-uuid",
    "title": "图片生成任务失败",
    "content": "...",
    ...
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 4. notification
通用通知：
```json
{
  "type": "notification",
  "notification": {
    "id": "notification-uuid",
    "title": "...",
    "content": "...",
    ...
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 心跳机制

服务端每 30 秒发送一次心跳（`: heartbeat\n\n`），用于保持连接活跃。

## 自动重连

如果连接断开，客户端应该自动重连：

```javascript
let reconnectDelay = 1000;
const maxReconnectDelay = 30000;

async function connectWithReconnect(userId, token) {
  while (true) {
    try {
      await connectSSE(userId, token);
      reconnectDelay = 1000; // 重置延迟
    } catch (error) {
      console.error('SSE connection failed, reconnecting...', error);
      await new Promise(resolve => setTimeout(resolve, reconnectDelay));
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    }
  }
}
```

## 安全注意事项

1. **认证**：SSE 连接需要通过 Gateway 的认证中间件
2. **用户 ID 验证**：用户只能连接到自己的 SSE 流
3. **HTTPS**：生产环境应使用 HTTPS 确保连接安全

## 性能考虑

1. **连接数限制**：每个用户可以有多个连接（多标签页/设备）
2. **心跳间隔**：30 秒心跳，可根据需要调整
3. **消息缓冲**：断开重连后，客户端可以通过 API 获取错过的通知
