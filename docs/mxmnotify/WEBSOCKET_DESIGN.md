# WebSocket 实时通知方案设计

## 一、方案概述

### 1.1 目标
- 将前端从轮询模式改为 WebSocket 实时推送模式
- 用户登录后自动建立 WebSocket 连接
- 后端主动推送任务状态更新、通知等事件
- 前端根据事件类型触发相应的 UI 更新（如刷新写作列表）

### 1.2 架构设计

```
前端 (React Native)
    ↓ WebSocket 连接 (wss://)
Gateway (WebSocket 代理/升级)
    ↓ WebSocket 连接
mxmnotify (WebSocket 服务器)
    ↓ 事件推送
业务模块 (mxmcgi, mxmpay, etc.)
```

## 二、后端实现（mxmnotify）

### 2.1 技术选型
- **WebSocket 库**: `ws` (Node.js 标准库)
- **认证方式**: JWT Token（通过连接时的 query 参数或首个子消息传递）

### 2.2 目录结构

```
mxmnotify/src/
├── services/
│   ├── websocket.service.ts    # WebSocket 服务（新增）
│   ├── sse.service.ts          # 保留 SSE（向后兼容）
│   └── notification.service.ts # 修改：同时支持 SSE 和 WebSocket
├── routes/
│   ├── websocket.ts            # WebSocket 路由（新增）
│   └── ...
└── types/
    └── websocket.types.ts      # WebSocket 消息类型定义（新增）
```

### 2.3 WebSocket 服务设计

#### 2.3.1 连接管理

```typescript
interface WebSocketClient {
  userId: string;
  socket: WebSocket;
  connectedAt: Date;
  lastPingAt: Date;
}

class WebSocketService {
  private clients: Map<string, WebSocketClient> = new Map();
  private userConnections: Map<string, Set<WebSocket>> = new Map();
  
  // 添加客户端连接
  addClient(userId: string, socket: WebSocket): void;
  
  // 移除客户端连接
  removeClient(userId: string, socket: WebSocket): void;
  
  // 发送消息给用户
  sendToUser(userId: string, event: string, data: any): void;
  
  // 广播消息（可选）
  broadcast(event: string, data: any): void;
}
```

#### 2.3.2 消息协议

**客户端 → 服务端消息格式**:
```typescript
interface ClientMessage {
  type: 'auth' | 'ping' | 'subscribe' | 'unsubscribe';
  payload?: any;
}

// 认证消息（连接后第一个消息）
{
  type: 'auth',
  payload: {
    token: 'jwt-token'
  }
}

// 心跳消息
{
  type: 'ping'
}

// 订阅事件
{
  type: 'subscribe',
  payload: {
    events: ['task_completed', 'task_failed', 'writing_updated']
  }
}
```

**服务端 → 客户端消息格式**:
```typescript
interface ServerMessage {
  type: 'connected' | 'error' | 'notification' | 'task_update' | 'pong';
  event?: string;  // 事件类型：task_completed, task_failed, writing_updated, etc.
  data: any;
  timestamp: string;
}

// 连接成功
{
  type: 'connected',
  data: {
    userId: 'user-id',
    message: 'WebSocket connection established'
  },
  timestamp: '2024-01-01T00:00:00Z'
}

// 通知消息
{
  type: 'notification',
  event: 'task_completed',
  data: {
    notification: { ... },
    task: { ... }
  },
  timestamp: '2024-01-01T00:00:00Z'
}

// 任务更新
{
  type: 'task_update',
  event: 'writing_updated',
  data: {
    task_id: 'task-id',
    status: 'completed',
    result: { ... }
  },
  timestamp: '2024-01-01T00:00:00Z'
}
```

#### 2.3.3 事件类型定义

```typescript
enum NotificationEventType {
  // 任务相关
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_UPDATED = 'task_updated',
  
  // 写作相关
  WRITING_COMPLETED = 'writing_completed',
  WRITING_UPDATED = 'writing_updated',
  
  // 支付相关
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  
  // 系统通知
  SYSTEM_NOTIFICATION = 'system_notification',
  
  // 未读数量更新
  UNREAD_COUNT_UPDATED = 'unread_count_updated',
}
```

### 2.4 路由实现

```typescript
// routes/websocket.ts
import { WebSocketServer } from 'ws';
import { verifyToken } from '@mxmai/mxmdata'; // 假设有 JWT 验证函数

export function setupWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/notifications'
  });
  
  wss.on('connection', async (socket, req) => {
    // 从 query 参数或首条消息获取 token
    const token = getTokenFromRequest(req);
    
    // 验证 token 并获取 userId
    const userId = await authenticateConnection(token);
    
    if (!userId) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    
    // 添加到连接管理
    websocketService.addClient(userId, socket);
    
    // 发送连接成功消息
    socket.send(JSON.stringify({
      type: 'connected',
      data: { userId },
      timestamp: new Date().toISOString()
    }));
    
    // 处理消息
    socket.on('message', (message) => {
      handleClientMessage(userId, socket, message);
    });
    
    // 处理断开
    socket.on('close', () => {
      websocketService.removeClient(userId, socket);
    });
    
    // 心跳检测
    setupHeartbeat(socket);
  });
}
```

### 2.5 通知服务集成

修改 `notification.service.ts`，在发送通知时同时通过 WebSocket 推送：

```typescript
// 发送任务完成通知
async sendTaskCompletedNotification(task: GenerationTask): Promise<Notification> {
  // ... 创建通知 ...
  
  // 通过 WebSocket 推送
  websocketService.sendToUser(task.user_id, 'task_completed', {
    notification,
    task,
  });
  
  // 保留 SSE 支持（向后兼容）
  sseService.sendTaskCompleted(task.user_id, { notification, task });
  
  return notification;
}
```

## 三、Gateway 实现

### 3.1 WebSocket 代理方案

Gateway 需要支持 WebSocket 升级。有两种方案：

#### 方案 A：Gateway 直接处理 WebSocket（推荐）

Gateway 接收 WebSocket 连接，验证 JWT，然后转发到 mxmnotify。

**优点**:
- 统一认证入口
- 更好的安全控制
- 可以添加限流、日志等中间件

**实现**:
```typescript
// gateway/src/routes/websocket.ts
import { WebSocketServer } from 'ws';
import { verifyToken } from '@mxmai/mxmdata';

export function setupWebSocketProxy(server: http.Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/api/v1/ws/notifications'
  });
  
  wss.on('connection', async (socket, req) => {
    // 1. 从 query 参数获取 token
    const token = getTokenFromQuery(req);
    
    // 2. 验证 JWT
    const user = await verifyToken(token);
    if (!user) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    
    // 3. 建立到 mxmnotify 的 WebSocket 连接
    const notifyUrl = `${process.env.MXMNOTIFY_WS_URL || 'ws://localhost:4005'}/ws/notifications?userId=${user.userId}`;
    const notifySocket = new WebSocket(notifyUrl);
    
    // 4. 双向转发消息
    socket.on('message', (data) => {
      notifySocket.send(data);
    });
    
    notifySocket.on('message', (data) => {
      socket.send(data);
    });
    
    // 5. 处理断开
    socket.on('close', () => notifySocket.close());
    notifySocket.on('close', () => socket.close());
  });
}
```

#### 方案 B：直接代理到 mxmnotify（简单）

使用 `http-proxy-middleware` 的 WebSocket 支持。

**实现**:
```typescript
// gateway/src/routes/proxy.ts
import { createProxyMiddleware } from 'http-proxy-middleware';

// WebSocket 代理
router.use('/ws/notifications', 
  authMiddleware, // 注意：WebSocket 需要特殊处理认证
  createProxyMiddleware({
    target: `ws://${process.env.MXMNOTIFY_URL || 'localhost:4005'}`,
    ws: true, // 启用 WebSocket 支持
    changeOrigin: true,
  })
);
```

**推荐使用方案 A**，因为可以更好地控制认证和日志。

### 3.2 认证处理

WebSocket 连接无法使用 HTTP 中间件，需要：
1. 从 query 参数获取 token: `ws://gateway/ws/notifications?token=jwt-token`
2. 或者在连接后第一个消息中发送认证信息

## 四、前端实现（React Native）

### 4.1 WebSocket 客户端服务

创建 `lib/websocket/notification-client.ts`:

```typescript
import { getToken } from '../auth/storage';

interface NotificationEvent {
  type: string;
  event?: string;
  data: any;
  timestamp: string;
}

type EventHandler = (data: any) => void;

class NotificationWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  // 连接 WebSocket
  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }
    
    this.isConnecting = true;
    
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token');
      }
      
      // 从环境变量或配置获取 WebSocket URL
      const wsUrl = `${process.env.WS_URL || 'ws://localhost:3000'}/api/v1/ws/notifications?token=${token}`;
      
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        console.log('[WebSocket] Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setupHeartbeat();
      };
      
      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      
      this.socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
      };
      
      this.socket.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnecting = false;
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  
  // 断开连接
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
  
  // 订阅事件
  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    
    // 返回取消订阅函数
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
        }
      }
    };
  }
  
  // 处理消息
  private handleMessage(data: string): void {
    try {
      const message: NotificationEvent = JSON.parse(data);
      
      // 触发对应事件的处理器
      if (message.event) {
        const handlers = this.eventHandlers.get(message.event);
        if (handlers) {
          handlers.forEach(handler => handler(message.data));
        }
      }
      
      // 也触发通用 type 处理器
      const typeHandlers = this.eventHandlers.get(message.type);
      if (typeHandlers) {
        typeHandlers.forEach(handler => handler(message.data));
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }
  
  // 心跳检测
  private setupHeartbeat(): void {
    setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 每 30 秒发送一次心跳
  }
  
  // 重连逻辑
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached');
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// 单例
export const notificationClient = new NotificationWebSocketClient();
```

### 4.2 在认证上下文中集成

修改 `lib/auth/context.tsx`:

```typescript
import { notificationClient } from '../websocket/notification-client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // ... 现有代码 ...
  
  useEffect(() => {
    if (isAuthenticated) {
      // 登录后建立 WebSocket 连接
      notificationClient.connect();
    } else {
      // 登出后断开连接
      notificationClient.disconnect();
    }
    
    return () => {
      // 组件卸载时断开连接
      notificationClient.disconnect();
    };
  }, [isAuthenticated]);
  
  // ... 其他代码 ...
}
```

### 4.3 在媒体页面使用

修改 `app/(tabs)/media.tsx`:

```typescript
import { notificationClient } from '@/lib/websocket/notification-client';

export default function MediaScreen() {
  // ... 现有代码 ...
  
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // 订阅任务完成事件
    const unsubscribeTaskCompleted = notificationClient.on('task_completed', (data) => {
      console.log('[媒体] 收到任务完成通知:', data);
      
      // 根据任务类型刷新对应的列表
      if (data.task?.task_type === 'graph') {
        refreshGraphTasks();
      } else if (data.task?.task_type === 'audio') {
        refreshAudioTasks();
      } else if (data.task?.task_type === 'video') {
        refreshVideoTasks();
      }
    });
    
    // 订阅任务失败事件
    const unsubscribeTaskFailed = notificationClient.on('task_failed', (data) => {
      console.log('[媒体] 收到任务失败通知:', data);
      // 刷新对应列表
      if (data.task?.task_type === 'graph') {
        refreshGraphTasks();
      } else if (data.task?.task_type === 'audio') {
        refreshAudioTasks();
      } else if (data.task?.task_type === 'video') {
        refreshVideoTasks();
      }
    });
    
    // 订阅写作更新事件
    const unsubscribeWritingUpdated = notificationClient.on('writing_updated', (data) => {
      console.log('[媒体] 收到写作更新通知:', data);
      refreshWritingTasks();
    });
    
    return () => {
      unsubscribeTaskCompleted();
      unsubscribeTaskFailed();
      unsubscribeWritingUpdated();
    };
  }, [isAuthenticated, refreshGraphTasks, refreshAudioTasks, refreshVideoTasks, refreshWritingTasks]);
  
  // 移除轮询逻辑（不再需要）
  // useEffect(() => {
  //   const intervalId = setInterval(() => {
  //     refreshGraphTasks();
  //   }, 5000);
  //   return () => clearInterval(intervalId);
  // }, []);
}
```

## 五、实施步骤

### 阶段 1：后端 WebSocket 服务（mxmnotify）
1. ✅ 安装 `ws` 依赖
2. ✅ 创建 `websocket.service.ts`
3. ✅ 创建 `routes/websocket.ts`
4. ✅ 修改 `notification.service.ts` 集成 WebSocket
5. ✅ 修改 `index.ts` 启动 WebSocket 服务器
6. ✅ 测试 WebSocket 连接和消息推送

### 阶段 2：Gateway WebSocket 代理
1. ✅ 安装 `ws` 依赖（如果需要）
2. ✅ 创建 WebSocket 路由和认证
3. ✅ 测试通过 Gateway 连接 WebSocket

### 阶段 3：前端集成
1. ✅ 创建 WebSocket 客户端服务
2. ✅ 在认证上下文中集成连接管理
3. ✅ 在媒体页面订阅事件并移除轮询
4. ✅ 测试实时通知功能

### 阶段 4：优化和测试
1. ✅ 添加重连逻辑
2. ✅ 添加错误处理
3. ✅ 性能优化
4. ✅ 端到端测试

## 六、注意事项

### 6.1 兼容性
- 保留 SSE 支持，确保向后兼容
- 前端可以同时支持 WebSocket 和 SSE（降级方案）

### 6.2 安全性
- WebSocket 连接必须验证 JWT
- 防止未授权访问
- 考虑添加连接数限制

### 6.3 性能
- 合理设置心跳间隔
- 实现连接池管理
- 考虑使用 Redis 进行多实例部署时的连接管理

### 6.4 错误处理
- 网络断开自动重连
- 认证失败处理
- 消息解析错误处理

## 七、API 接口暴露

mxmnotify 的 REST API 已经通过 Gateway 暴露：
- `/api/v1/notifications/*` → mxmnotify `/notifications/*`
- `/api/v1/tasks/*` → mxmnotify `/tasks/*`
- `/api/v1/ws/notifications` → mxmnotify WebSocket（新增）

## 八、测试方案

### 8.1 单元测试
- WebSocket 服务连接管理
- 消息序列化/反序列化
- 认证逻辑

### 8.2 集成测试
- Gateway → mxmnotify WebSocket 连接
- 前端 → Gateway WebSocket 连接
- 端到端消息推送

### 8.3 压力测试
- 并发连接数测试
- 消息推送性能测试
- 重连机制测试

