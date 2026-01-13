# 通知系统 API 接口总结

## 接口列表（通过 Gateway 访问）

所有接口都需要在 Header 中携带 `Authorization: Bearer YOUR_JWT_TOKEN`

Gateway 会自动从 Token 解析用户信息，并通过 `x-user-id` header 传递给 mxmnotify。

### 1. WebSocket 连接

**连接地址**: `ws://localhost:3000/api/v1/ws/notifications?token=YOUR_JWT_TOKEN`

**Token 说明**:
- 使用用户登录后获取的 `accessToken`（JWT Token）
- 登录接口返回格式：`{ "tokens": { "accessToken": "eyJhbGc...", "refreshToken": "...", "expiresIn": 57600 } }`
- 直接使用 `accessToken` 的值作为 token 参数

**功能**:
- 实时接收通知推送
- 支持心跳机制
- 支持事件订阅

**消息格式**:
- 客户端 → 服务端: `{"type": "ping"}` 或 `{"type": "subscribe", "payload": {"events": [...]}}`
- 服务端 → 客户端: `{"type": "notification", "event": "task_completed", "data": {...}, "timestamp": "..."}`

---

### 2. 获取用户通知列表

**接口**: `GET /api/v1/notifications`

**查询参数**:
- `is_read` (可选): `true` | `false` - 筛选已读/未读
- `limit` (可选): 数量限制，默认 20
- `offset` (可选): 偏移量，默认 0

**响应示例**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification-id",
      "user_id": "user-id",
      "task_id": "task-id",
      "type": "task_completed",
      "title": "图片生成完成",
      "content": "您的图片已生成完成，共生成 1 个文件，点击查看。",
      "data": {
        "module_type": "mxmcgi",
        "task_status": "completed",
        "task_type": "image"
      },
      "is_read": false,
      "read_at": null,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

### 3. 标记通知为已读

**接口**: `PUT /api/v1/notifications/:notificationId/read`

**路径参数**:
- `notificationId`: 通知 ID

**响应示例**:
```json
{
  "success": true
}
```

**权限验证**: 自动验证通知属于当前用户

---

### 4. 标记所有通知为已读

**接口**: `PUT /api/v1/notifications/read-all`

**响应示例**:
```json
{
  "success": true
}
```

---

### 5. 删除通知

**接口**: `DELETE /api/v1/notifications/:notificationId`

**路径参数**:
- `notificationId`: 通知 ID

**响应示例**:
```json
{
  "success": true
}
```

**权限验证**: 自动验证通知属于当前用户

---

## 内部接口（mxmcgi 调用）

### 发送任务状态变更事件

**接口**: `POST /api/v1/task-events/status-changed`

**请求体**:
```json
{
  "module_type": "mxmcgi",
  "task_id": "task-id",
  "user_id": "user-id",
  "task_status": "completed",
  "task_status_message": "任务已完成",
  "metadata": {
    "task_type": "image",
    "model_name": "seedream-4",
    "media_count": 1
  }
}
```

**说明**: 
- mxmcgi 在任务创建和状态变更时调用此接口
- mxmnotify 会自动创建通知并推送给用户（通过 WebSocket）

---

## 数据流程

1. **用户登录** → Gateway 验证 Token → 返回 JWT Token
2. **前端连接 WebSocket** → `ws://localhost:3000/api/v1/ws/notifications?token=TOKEN`
   - Gateway 验证 Token → 解析用户 ID → 代理到 mxmnotify
   - mxmnotify 从 Token 解析用户 ID → 建立连接
3. **mxmcgi 任务创建/更新** → 调用 `/api/v1/task-events/status-changed`
   - mxmnotify 创建通知记录
   - 通过 WebSocket 推送给用户
4. **前端查询通知** → `GET /api/v1/notifications`
   - Gateway 验证 Token → 传递 `x-user-id` → mxmnotify 返回通知列表
5. **前端标记已读/删除** → `PUT /api/v1/notifications/:id/read` 或 `DELETE /api/v1/notifications/:id`
   - Gateway 验证 Token → 传递 `x-user-id` → mxmnotify 验证权限并执行操作

---

## 注意事项

1. **用户 ID 获取**: 
   - Gateway 从 Token 解析用户 ID，通过 `x-user-id` header 传递
   - mxmnotify 从 `x-user-id` header 获取，不再从 URL 参数获取

2. **权限验证**:
   - 所有操作都验证通知属于当前用户
   - 删除和标记已读都会检查权限

3. **WebSocket 连接**:
   - 连接时传递 Token（query 参数或 header）
   - mxmnotify 从 Token 解析用户 ID
   - 只推送属于该用户的通知

4. **通知创建**:
   - mxmcgi 调用 `/api/v1/task-events/status-changed` 创建通知
   - 自动通过 WebSocket 推送给对应用户

