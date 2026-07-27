# 通知系统测试案例

## 前置条件

1. 确保所有服务已启动：
   - Gateway: `http://localhost:3000`
   - mxmnotify: `http://localhost:4005`
   - mxmauth: `http://localhost:4001` (用于获取 JWT Token)

2. 准备测试用户和 JWT Token

## 测试案例

### 1. 获取 JWT Token（登录）

**请求**:
```bash
curl -X POST http://localhost:3000/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpassword"
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-id-123",
      "username": "testuser"
    }
  }
}
```

**保存 Token**:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export USER_ID="user-id-123"
```

---

### 2. 发送任务状态变更事件（模拟 CGI 任务完成）

**请求**:
```bash
curl -X POST http://localhost:3000/api/v1/task-events/status-changed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_type": "mxmcgi",
    "task_id": "test-task-123",
    "user_id": "'$USER_ID'",
    "task_status": "completed",
    "task_status_message": "任务已完成",
    "metadata": {
      "task_type": "image",
      "model_name": "seedream-4",
      "model_provider": "replicate",
      "progress": 100,
      "media_count": 1,
      "result": {
        "mediaUrls": ["https://example.com/image.jpg"],
        "storageInfo": {
          "bucket": "media",
          "keys": ["images/task-123.jpg"],
          "urls": ["https://storage.example.com/images/task-123.jpg"]
        }
      }
    },
    "notification_config": {
      "notification_type": "reminder",
      "action_url": "/media/graph/test-task-123"
    }
  }'
```

**响应**:
```json
{
  "success": true,
  "message": "Event processed successfully"
}
```

---

### 3. 发送任务失败事件

**请求**:
```bash
curl -X POST http://localhost:3000/api/v1/task-events/status-changed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_type": "mxmcgi",
    "task_id": "test-task-456",
    "user_id": "'$USER_ID'",
    "task_status": "failed",
    "task_status_message": "任务执行失败：网络超时",
    "metadata": {
      "task_type": "video",
      "model_name": "sora-2",
      "error": "网络超时",
      "error_message": "请求超时，请重试"
    }
  }'
```

---

### 4. 查询用户通知列表

**请求**:
```bash
curl -X GET "http://localhost:3000/api/v1/notifications/user/$USER_ID?is_read=false&limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**响应**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification-id-1",
      "user_id": "user-id-123",
      "task_id": "test-task-123",
      "type": "reminder",
      "title": "图片生成完成",
      "content": "您的图片已生成完成，共生成 1 个文件，点击查看。",
      "data": {
        "module_type": "mxmcgi",
        "task_status": "completed",
        "task_type": "image",
        "model_name": "seedream-4"
      },
      "is_read": false,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

### 5. 标记通知为已读

**请求**:
```bash
curl -X PUT http://localhost:3000/api/v1/notifications/notification-id-1/read \
  -H "Authorization: Bearer $TOKEN"
```

**响应**:
```json
{
  "success": true
}
```

---

### 6. WebSocket 连接测试

#### 6.1 使用 wscat 工具测试

**安装 wscat**:
```bash
npm install -g wscat
```

**连接 WebSocket**:
```bash
wscat -c "ws://localhost:3000/api/v1/ws/notifications?token=$TOKEN"
```

**连接成功后，你会收到**:
```json
{
  "type": "connected",
  "data": {
    "userId": "user-id-123",
    "message": "WebSocket connection established"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**发送心跳**:
```json
{"type": "ping"}
```

**收到心跳响应**:
```json
{
  "type": "pong",
  "data": {
    "timestamp": "2024-01-01T00:00:01Z"
  },
  "timestamp": "2024-01-01T00:00:01Z"
}
```

**订阅事件**:
```json
{"type": "subscribe", "payload": {"events": ["task_completed", "task_failed"]}}
```

#### 6.2 使用 JavaScript 测试

**创建测试文件 `test-websocket.js`**:
```javascript
const WebSocket = require('ws');

const token = process.env.TOKEN || 'YOUR_JWT_TOKEN';
const ws = new WebSocket(`ws://localhost:3000/api/v1/ws/notifications?token=${token}`);

ws.on('open', () => {
  console.log('✅ WebSocket connected');
  
  // 发送心跳
  setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30000);
  
  // 订阅事件
  ws.send(JSON.stringify({
    type: 'subscribe',
    payload: {
      events: ['task_completed', 'task_failed', 'task_updated']
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received message:', JSON.stringify(message, null, 2));
  
  if (message.event === 'task_completed') {
    console.log('🎉 Task completed:', message.data.task);
  } else if (message.event === 'task_failed') {
    console.log('❌ Task failed:', message.data.task);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
});

// 保持连接
process.on('SIGINT', () => {
  ws.close();
  process.exit(0);
});
```

**运行测试**:
```bash
TOKEN="your-jwt-token" node test-websocket.js
```

**在另一个终端发送任务完成事件**:
```bash
curl -X POST http://localhost:3000/api/v1/task-events/status-changed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_type": "mxmcgi",
    "task_id": "test-task-789",
    "user_id": "'$USER_ID'",
    "task_status": "completed",
    "metadata": {
      "task_type": "image",
      "model_name": "seedream-4"
    }
  }'
```

**WebSocket 客户端会收到**:
```json
{
  "type": "notification",
  "event": "task_completed",
  "data": {
    "notification": {
      "id": "notification-id-2",
      "title": "图片生成完成",
      "content": "您的图片已生成完成，共生成 1 个文件，点击查看。",
      "action_url": "/media/graph/test-task-789"
    },
    "task": {
      "id": "test-task-789",
      "status": "completed",
      "module_type": "mxmcgi",
      "task_type": "image",
      "model_name": "seedream-4"
    }
  },
  "timestamp": "2024-01-01T00:00:02Z"
}
```

---

### 7. 端到端测试流程

#### 完整测试脚本 `test-notification-flow.sh`:

```bash
#!/bin/bash

# 配置
GATEWAY_URL="http://localhost:3000"
USERNAME="testuser"
PASSWORD="testpassword"

echo "🔐 Step 1: 登录获取 Token..."
LOGIN_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/v1/account/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')
USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.data.user.id')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo $LOGIN_RESPONSE | jq
  exit 1
fi

echo "✅ Token: ${TOKEN:0:20}..."
echo "✅ User ID: $USER_ID"
echo ""

echo "📤 Step 2: 发送任务完成事件..."
TASK_ID="test-task-$(date +%s)"
curl -X POST "$GATEWAY_URL/api/v1/task-events/status-changed" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"module_type\": \"mxmcgi\",
    \"task_id\": \"$TASK_ID\",
    \"user_id\": \"$USER_ID\",
    \"task_status\": \"completed\",
    \"task_status_message\": \"任务已完成\",
    \"metadata\": {
      \"task_type\": \"image\",
      \"model_name\": \"seedream-4\",
      \"media_count\": 1
    }
  }" | jq

echo ""
echo "📥 Step 3: 查询通知列表..."
curl -s -X GET "$GATEWAY_URL/api/v1/notifications/user/$USER_ID?is_read=false&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq

echo ""
echo "✅ 测试完成！"
echo ""
echo "💡 提示: 使用以下命令测试 WebSocket:"
echo "wscat -c \"ws://localhost:3000/api/v1/ws/notifications?token=$TOKEN\""
```

**运行测试**:
```bash
chmod +x test-notification-flow.sh
./test-notification-flow.sh
```

---

### 8. Postman 测试集合

**导入到 Postman**:

```json
{
  "info": {
    "name": "通知系统测试",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. 登录",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"username\": \"testuser\",\n  \"password\": \"testpassword\"\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/v1/account/login",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "v1", "account", "login"]
        }
      }
    },
    {
      "name": "2. 发送任务完成事件",
      "request": {
        "method": "POST",
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"},
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"module_type\": \"mxmcgi\",\n  \"task_id\": \"test-task-123\",\n  \"user_id\": \"{{userId}}\",\n  \"task_status\": \"completed\",\n  \"task_status_message\": \"任务已完成\",\n  \"metadata\": {\n    \"task_type\": \"image\",\n    \"model_name\": \"seedream-4\",\n    \"media_count\": 1\n  }\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/v1/task-events/status-changed",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "v1", "task-events", "status-changed"]
        }
      }
    },
    {
      "name": "3. 查询通知列表",
      "request": {
        "method": "GET",
        "header": [{"key": "Authorization", "value": "Bearer {{token}}"}],
        "url": {
          "raw": "http://localhost:3000/api/v1/notifications/user/{{userId}}?is_read=false&limit=10",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "v1", "notifications", "user", "{{userId}}"],
          "query": [
            {"key": "is_read", "value": "false"},
            {"key": "limit", "value": "10"}
          ]
        }
      }
    }
  ]
}
```

---

## 测试检查清单

- [ ] 登录获取 Token 成功
- [ ] 发送任务完成事件成功
- [ ] 发送任务失败事件成功
- [ ] 查询通知列表成功
- [ ] 标记通知为已读成功
- [ ] WebSocket 连接成功
- [ ] WebSocket 接收通知成功
- [ ] 心跳机制正常工作
- [ ] 事件订阅/取消订阅正常

## 常见问题

### 1. WebSocket 连接失败

**问题**: `WebSocket connection failed`

**解决方案**:
- 检查 Gateway 和 mxmnotify 服务是否都在运行
- 确认 Token 是否有效
- 检查防火墙设置

### 2. 通知未收到

**问题**: 发送了事件但未收到通知

**解决方案**:
- 确认 `user_id` 与 WebSocket 连接的用户 ID 一致
- 检查 mxmnotify 服务日志
- 确认事件格式正确

### 3. 认证失败

**问题**: `Unauthorized: Invalid token`

**解决方案**:
- 确认 Token 未过期
- 检查 JWT_SECRET 配置是否正确
- 确认 Token 格式正确（Bearer token）

