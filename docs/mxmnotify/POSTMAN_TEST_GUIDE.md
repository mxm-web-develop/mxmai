# Postman 测试通知功能指南

## ✅ 可以测试的功能

Postman 可以测试以下通知功能：

### 1. REST API 接口 ✅
- ✅ 登录获取 Token
- ✅ 发送任务状态变更事件
- ✅ 查询通知列表
- ✅ 标记通知为已读
- ✅ 标记所有通知为已读

### 2. WebSocket 连接 ⚠️
- ⚠️ Postman 支持 WebSocket，但功能有限
- 💡 建议使用专门的 WebSocket 客户端工具进行测试

---

## 📥 导入 Postman Collection

1. 打开 Postman
2. 点击左上角 **Import** 按钮
3. 选择文件 `Notification_API.postman_collection.json`
4. 导入成功后，你会看到 "通知系统 API" 集合

---

## 🚀 测试步骤

### 步骤 1: 配置环境变量

在 Postman 中设置 Collection Variables（集合变量）：

1. 右键点击 "通知系统 API" 集合
2. 选择 **Edit**
3. 切换到 **Variables** 标签
4. 确认以下变量：
   - `baseUrl`: `http://localhost:3000`
   - `token`: (留空，登录后自动填充)
   - `userId`: (留空，登录后自动填充)

### 步骤 2: 登录获取 Token

1. 展开集合，找到 **1. 认证** → **登录获取 Token**
2. 修改请求体中的用户名和密码（根据你的测试账号）
3. 点击 **Send**
4. ✅ 成功后，Token 和 UserId 会自动保存到集合变量中

**请求示例**:
```json
{
  "username": "testuser",
  "password": "testpassword"
}
```

**响应示例**:
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

### 步骤 3: 发送任务完成事件

1. 找到 **2. 任务事件** → **发送任务完成事件**
2. 点击 **Send**
3. ✅ 应该收到 `{"success": true, "message": "Event processed successfully"}`

**请求体说明**:
- `task_id`: 使用 `{{$timestamp}}` 自动生成唯一 ID
- `user_id`: 自动使用登录时保存的 `{{userId}}`
- `metadata`: 包含任务类型、模型名称等信息

### 步骤 4: 查询通知列表

1. 找到 **3. 通知查询** → **获取用户通知列表**
2. 点击 **Send**
3. ✅ 应该看到刚才发送的任务完成通知

**响应示例**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification-id-1",
      "title": "图片生成完成",
      "content": "您的图片已生成完成，共生成 1 个文件，点击查看。",
      "is_read": false,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### 步骤 5: 标记通知为已读

1. 从通知列表中复制一个 `notification.id`
2. 找到 **3. 通知查询** → **标记通知为已读**
3. 在 URL 参数中替换 `:notificationId` 为实际的 ID
4. 点击 **Send**
5. ✅ 应该收到 `{"success": true}`

---

## 🔌 WebSocket 测试（Postman 限制）

### Postman WebSocket 支持情况

Postman 支持 WebSocket，但功能有限：

1. **连接方式**:
   - 在 Postman 中创建新请求
   - 将协议改为 `ws://` 或 `wss://`
   - URL: `ws://localhost:3000/api/v1/ws/notifications?token={{token}}`

2. **限制**:
   - 消息发送/接收界面可能不够直观
   - 实时消息显示可能有问题
   - 调试功能有限

### 💡 推荐使用其他工具测试 WebSocket

#### 方案 1: 使用 wscat（命令行工具）

```bash
# 安装
npm install -g wscat

# 连接（需要先获取 Token）
wscat -c "ws://localhost:3000/api/v1/ws/notifications?token=YOUR_TOKEN"
```

#### 方案 2: 使用浏览器控制台

```javascript
// 在浏览器控制台中运行
const token = 'YOUR_JWT_TOKEN';
const ws = new WebSocket(`ws://localhost:3000/api/v1/ws/notifications?token=${token}`);

ws.onopen = () => console.log('✅ Connected');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('📨 Received:', message);
};
ws.onerror = (error) => console.error('❌ Error:', error);
ws.onclose = () => console.log('🔌 Closed');
```

#### 方案 3: 使用在线 WebSocket 客户端

- [WebSocket King](https://websocketking.com/)
- [WebSocket Test Client](https://www.websocket.org/echo.html)

---

## 📋 完整测试流程

### 测试场景 1: 任务完成通知

1. ✅ 登录获取 Token
2. ✅ 发送任务完成事件（图片生成）
3. ✅ 查询通知列表，确认收到通知
4. ✅ 标记通知为已读
5. ✅ 再次查询，确认通知已标记为已读

### 测试场景 2: 任务失败通知

1. ✅ 登录获取 Token
2. ✅ 发送任务失败事件
3. ✅ 查询通知列表，确认收到失败通知
4. ✅ 验证通知内容包含错误信息

### 测试场景 3: 多种任务类型

1. ✅ 发送图片任务完成事件
2. ✅ 发送视频任务完成事件
3. ✅ 发送音频任务完成事件
4. ✅ 发送写作任务完成事件
5. ✅ 查询通知列表，验证不同类型的通知格式

---

## 🐛 常见问题

### 1. 401 Unauthorized

**原因**: Token 无效或过期

**解决**:
- 重新登录获取新的 Token
- 检查 Token 是否正确保存到集合变量

### 2. 404 Not Found

**原因**: 路由配置错误或服务未启动

**解决**:
- 确认 Gateway 服务正在运行（端口 3000）
- 确认 mxmnotify 服务正在运行（端口 4005）
- 检查 `baseUrl` 变量是否正确

### 3. 500 Internal Server Error

**原因**: 服务端错误

**解决**:
- 查看 Gateway 和 mxmnotify 的日志
- 检查数据库连接是否正常
- 确认环境变量配置正确

### 4. WebSocket 连接失败

**原因**: 
- Token 无效
- 服务未启动
- 防火墙阻止

**解决**:
- 使用有效的 Token
- 确认服务都在运行
- 检查网络连接

---

## 📝 测试检查清单

- [ ] 成功导入 Postman Collection
- [ ] 成功登录并获取 Token
- [ ] 成功发送任务完成事件
- [ ] 成功发送任务失败事件
- [ ] 成功查询通知列表
- [ ] 成功标记通知为已读
- [ ] 成功标记所有通知为已读
- [ ] WebSocket 连接测试（使用其他工具）

---

## 💡 提示

1. **自动化测试**: 可以使用 Postman 的 Test Scripts 编写自动化测试
2. **环境切换**: 可以创建不同的环境（开发、测试、生产）
3. **变量管理**: 充分利用集合变量和环境变量
4. **文档**: 每个请求都可以添加描述和示例

---

## 🔗 相关文档

- [完整测试案例](./TEST_CASES.md)
- [CGI Task 通知实现](./CGI_TASK_NOTIFICATION.md)
- [WebSocket 设计方案](./WEBSOCKET_DESIGN.md)

