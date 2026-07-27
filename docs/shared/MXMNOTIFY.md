# mxmnotify - 通知业务模块

## 一、模块概述与核心功能

mxmnotify 负责统一接收来自各业务模块（mxmpay、mxmcgi、mxmauth 等）的事件，按照模板生成通知，并通过 API / WebSocket / Push 推送给终端。核心功能：

- **事件接入**：所有异步任务状态变化通过消息队列统一上报 `async_task.status_changed`。
- **数据存储**：将通知拆分为“异步任务通知表 + 通用通知表”，支持去重、过期、已读状态等。
- **多渠道推送**：REST API 查询、WebSocket 实时推送、APNs/FCM/ Web Push。
- **模板系统**：支持按 `module_type + task_status` 渲染标题、副文本以及跳转链接。
- **扩展友好**：通过 Handler 模式实现模块级自定义逻辑。

---

## 二、数据库表设计

```sql
-- 异步任务通知：专门对应任务的状态流转
CREATE TABLE async_task_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_type VARCHAR(50) NOT NULL,        -- mxmpay / mxmcgi / ...
  task_id VARCHAR(255) NOT NULL,
  task_status VARCHAR(50) NOT NULL,
  task_status_message TEXT,

  notification_type VARCHAR(20) NOT NULL,  -- system / reminder / activity / promotion
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,

  metadata JSONB,
  action_url TEXT,
  avatar_url TEXT,

  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  push_sent BOOLEAN DEFAULT false,
  push_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  UNIQUE(module_type, task_id, task_status)  -- 去重：同一任务状态只保留一条
);

CREATE INDEX idx_async_notify_user ON async_task_notifications(user_id);
CREATE INDEX idx_async_notify_module_task ON async_task_notifications(module_type, task_id);
CREATE INDEX idx_async_notify_unread ON async_task_notifications(user_id, is_read) WHERE is_read = false;

-- 通用通知：活动、系统公告等非任务类通知
CREATE TABLE general_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  source_service VARCHAR(50),
  source_id VARCHAR(255),
  action_url TEXT,
  avatar_url TEXT,
  metadata JSONB,

  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  push_sent BOOLEAN DEFAULT false,
  push_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_general_notify_user ON general_notifications(user_id);
CREATE INDEX idx_general_notify_unread ON general_notifications(user_id, is_read) WHERE is_read = false;
```

> 所有表同样保持“弱外键”策略，`user_id` 由上游保证合法性；如需跨服务校验可调用 `mxmdata`。

---

## 三、消息队列事件模型

### 3.1 异步任务状态事件

```typescript
type AsyncTaskStatusChangedEvent = {
  event_type: 'async_task.status_changed';
  module_type: 'mxmpay' | 'mxmcgi' | 'mxmauth' | 'mxmagent' | string;  // mxmagent 为历史 module_type，非独立服务
  task_id: string;
  user_id: string;
  task_status: string;               // queued / processing / completed / failed / ...
  task_status_message?: string;
  metadata?: Record<string, any>;    // order_no、agent_name、media_type 等
  notification_config?: {
    notification_type?: 'system' | 'reminder' | 'activity' | 'promotion';
    title?: string;
    content?: string;
    action_url?: string;
    avatar_url?: string;
    send_push?: boolean;
    send_email?: boolean;
  };
};
```

业务模块示例（mxmcgi 视频生成完成）：

```typescript
publish('async_task.status_changed', {
  module_type: 'mxmcgi',
  task_id: 'task-789',
  user_id: 'user-123',
  task_status: 'completed',
  task_status_message: '视频生成完成',
  metadata: {
    task_no: 'GEN20240115123456',
    agent_id: 'assistant-director',
    agent_name: '导演助手',
    media_type: 'video',
  },
  notification_config: {
    notification_type: 'reminder',
    action_url: '/project-detail/task-789',
    send_push: true,
  },
});
```

### 3.2 通用通知事件

```typescript
type GeneralNotificationEvent = {
  event_type: 'notification.created';
  user_id: string;
  notification: {
    type: 'system' | 'activity' | 'reminder' | 'promotion';
    title: string;
    content: string;
    source_service?: string;
    source_id?: string;
    action_url?: string;
    avatar_url?: string;
    expires_at?: string;
    metadata?: Record<string, any>;
  };
  push_options?: {
    send_push?: boolean;
    send_email?: boolean;
    send_sms?: boolean;
  };
};
```

---

## 四、处理器架构与模板系统

### 4.1 Handler 接口

```typescript
export interface NotificationHandler {
  supports(module_type: string): boolean;
  handle(event: AsyncTaskStatusChangedEvent): Promise<void>;
  generateNotification(event: AsyncTaskStatusChangedEvent): {
    notification_type: string;
    title: string;
    content: string;
    action_url?: string;
  };
}
```

- **DefaultNotificationHandler**：兜底处理，按模板渲染；所有模块自动支持。
- **模块特定 Handler**：如 `PaymentNotificationHandler`，可覆盖 `generateNotification` 并在 `handle` 中追加业务逻辑（例如充值到账后触发余额更新事件）。

### 4.2 模板配置

```typescript
export enum ModuleType { MXMPAY='mxmpay', MXMAUTH='mxmauth', MXMCGI='mxmcgi', MXMAGENT='mxmagent' }
export enum TaskStatus { QUEUED='queued', PROCESSING='processing', COMPLETED='completed', FAILED='failed', PAID='paid', REFUNDED='refunded' }

export interface NotificationTemplate {
  module_type: string;
  task_status: string;
  notification_type: 'system' | 'reminder' | 'activity' | 'promotion';
  title_template: string;
  content_template: string;
  default_action_url?: string;
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    module_type: ModuleType.MXMPAY,
    task_status: TaskStatus.PAID,
    notification_type: 'system',
    title_template: '支付成功',
    content_template: '订单{{order_no}}支付成功，金额¥{{amount}}',
    default_action_url: '/payment/orders/{{task_id}}',
  },
  {
    module_type: ModuleType.MXMCGI,
    task_status: TaskStatus.COMPLETED,
    notification_type: 'reminder',
    title_template: '生成完成',
    content_template: '《{{task_no}}》的{{agent_name}}任务已完成，点击查看',
    default_action_url: '/project-detail/{{task_id}}',
  },
  // 其他模板按需扩展
];
```

处理流程：去重 → 定位模板 / handler → 渲染变量（metadata + task_id 等）→ 写库 → 触发推送。

---

## 五、API 接口规范

**基础路径**：`/api/v1/notifications`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/` | 分页获取通知（支持筛选模块/类型/已读） | ✅ |
| GET | `/async-tasks` | 获取异步任务通知列表 | ✅ |
| GET | `/async-tasks/:module_type/:task_id` | 查询某任务的通知历史 | ✅ |
| GET | `/unread` | 获取未读通知列表 | ✅ |
| GET | `/unread/count` | 获取未读数量 | ✅ |
| PUT | `/:id/read` | 单条标记已读 | ✅ |
| PUT | `/read-all` | 全部标记已读 | ✅ |
| DELETE | `/:id` | 删除通知 | ✅ |
| GET | `/modules` | 返回支持的 module 列表（用于筛选 UI） | ✅ |

### 5.1 请求/响应示例

```typescript
// GET /api/v1/notifications
Query: {
  page?: number;
  page_size?: number;
  type?: 'system' | 'activity' | 'reminder' | 'promotion';
  module_type?: 'mxmpay' | 'mxmauth' | 'mxmcgi' | 'mxmagent';
  is_read?: boolean;
}

Response: {
  code: 200;
  data: {
    list: Array<{
      id: string;
      type: string;
      title: string;
      content: string;
      module_type?: string;
      task_id?: string;
      task_status?: string;
      action_url?: string;
      avatar_url?: string;
      is_read: boolean;
      created_at: string;
    }>;
    total: number;
    page: number;
    page_size: number;
  };
}
```

---

## 六、实时推送与客户端订阅

### 6.1 WebSocket

- **连接地址**：`wss://api.example.com/ws/notifications`
- **认证**：连接时发送 `{ type: 'connect', token: 'jwt' }`。
- **服务端推送**：

  ```json
  { "type": "notification", "data": { "id": "uuid", "title": "生成完成", "content": "...", "created_at": "..." } }
  { "type": "unread_count", "data": { "count": 5 } }
  ```

- **订阅范围**：基于用户 ID，服务端只推送当前用户数据（可利用 Supabase Realtime / 自建 WS）。

### 6.2 Push 集成

- **iOS**：APNs，使用 device token 维护映射；推荐使用 `p8` key + topic。
- **Android**：FCM，下发包含 notification + data payload。
- **Web**：Web Push API，维护 subscription endpoint。
- `notification_config.send_push = true` 时写入推送任务队列，由 Push Worker 处理。

---

## 七、扩展步骤

1. 业务模块发布事件（见 §3）。
2. 如果需要特殊文案 → 实现自定义 Handler，并在 `NotificationService` 注册。
3. 只需要默认行为 → 仅添加模板即可（无需代码改动）。
4. 新增渠道（如短信）→ 在 Handler 或 Push Worker 中扩展。
