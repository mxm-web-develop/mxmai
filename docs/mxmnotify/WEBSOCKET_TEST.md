# WebSocket 测试脚本使用指南

## 快速开始

### 1. 安装依赖

```bash
cd mxmnotify
npm install ws
# 或
pnpm add ws
```

### 2. 运行测试脚本

```bash
# 方式 1: 通过命令行参数传递 Token
node test-websocket.js YOUR_JWT_TOKEN

# 方式 2: 通过环境变量传递 Token
TOKEN=your_jwt_token node test-websocket.js
```

## 测试步骤

### 步骤 1: 获取 JWT Token

从 Gateway 的登录接口获取 Token（使用 Postman 或其他工具）：

```bash
curl -X POST http://localhost:3000/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'
```

### 步骤 2: 运行 WebSocket 测试脚本

```bash
node test-websocket.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 步骤 3: 发送测试通知

在另一个终端发送任务完成事件来触发通知：

```bash
curl -X POST http://localhost:3000/api/v1/task-events/status-changed \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_type": "mxmcgi",
    "task_id": "test-task-123",
    "user_id": "YOUR_USER_ID",
    "task_status": "completed",
    "metadata": {
      "task_type": "image",
      "model_name": "seedream-4"
    }
  }'
```

## 脚本功能

### ✅ 自动功能

1. **连接测试**: 自动连接到 WebSocket 服务器
2. **认证验证**: 验证 Token 是否有效
3. **心跳机制**: 每 30 秒自动发送心跳
4. **事件订阅**: 自动订阅所有通知事件
5. **消息解析**: 自动解析并格式化显示通知消息
6. **错误处理**: 友好的错误提示

### 📨 支持的消息类型

- `connected`: 连接成功确认
- `pong`: 心跳响应
- `notification`: 通知消息（任务完成、失败等）
- `error`: 错误消息

### 🔔 通知信息解析

脚本会自动解析并显示：

- **通知详情**:
  - 通知 ID
  - 标题
  - 内容
  - 跳转链接
  - 已读状态
  - 创建时间

- **任务信息**:
  - 任务 ID
  - 状态
  - 模块类型
  - 任务类型
  - 模型名称
  - 错误信息（如果有）

## 输出示例

```
🔌 正在连接到 WebSocket 服务器...
📍 URL: ws://localhost:3000/api/v1/ws/notifications?token=***

✅ WebSocket 连接成功！

💓 发送心跳消息...
📝 订阅通知事件...

⏳ 等待通知消息...
💡 提示: 在另一个终端发送任务完成事件来触发通知
💡 按 Ctrl+C 退出

📨 收到消息:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 连接确认
   用户 ID: user-123
   消息: WebSocket connection established
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📨 收到消息:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔔 收到通知！
   事件类型: task_completed
   时间戳: 2024-01-01T00:00:00Z

📋 通知详情:
   ID: notification-id-123
   标题: 图片生成完成
   内容: 您的图片已生成完成，共生成 1 个文件，点击查看。
   跳转链接: /media/graph/test-task-123
   已读: 否
   创建时间: 2024-01-01T00:00:00Z

📦 任务信息:
   任务 ID: test-task-123
   状态: completed
   模块: mxmcgi
   任务类型: image
   模型: seedream-4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 常见问题

### 1. 连接失败: ECONNREFUSED

**原因**: Gateway 服务未启动

**解决**: 
```bash
# 确保 Gateway 服务正在运行
cd gateway
pnpm dev
```

### 2. 认证失败: 401 Unauthorized

**原因**: Token 无效或已过期

**解决**: 
- 重新登录获取新的 Token
- 确认 Token 格式正确（不包含 Bearer 前缀）

### 3. 没有收到通知

**原因**: 
- 发送事件时使用的 `user_id` 与 WebSocket 连接的用户 ID 不一致
- 事件发送失败

**解决**: 
- 确认 `user_id` 匹配
- 检查事件发送接口的响应

## 测试检查清单

- [ ] 成功连接到 WebSocket 服务器
- [ ] 收到 `connected` 确认消息
- [ ] 心跳机制正常工作（收到 `pong` 响应）
- [ ] 成功订阅事件
- [ ] 收到任务完成通知并正确解析
- [ ] 收到任务失败通知并正确解析
- [ ] 通知信息完整（标题、内容、任务信息等）

