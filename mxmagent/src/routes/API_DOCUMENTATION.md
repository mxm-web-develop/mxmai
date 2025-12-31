# Smartflow API 文档

## 基础信息

### 直接访问 mxmagent 服务
- **Base URL**: `http://localhost:4004/api/v1`
- **Content-Type**: `application/json`

### 通过 Gateway 访问（推荐）
- **Base URL**: `http://localhost:3000/api/v1`
- **Content-Type**: `application/json`
- **认证**: 需要在请求头中添加 `Authorization: Bearer <token>`

**注意**：
- Smartflow 相关接口：`/api/v1/smartflows/*`
- Task 相关接口：`/api/v1/smartflow-tasks/*`（通过 Gateway 访问时使用此路径，避免与 mxmnotify 的 `/api/v1/tasks` 冲突）
- 直接访问 mxmagent 时，Task 接口仍使用 `/api/v1/tasks/*`

---

## Smartflow 接口

### 1. 获取 Smartflow 列表

**GET** `/smartflows`

**Query Parameters:**
- `userId` (string, 可选): 用户 ID，获取该用户的 Smartflow
- `public` (boolean, 可选): 设置为 `true` 获取公开的 Smartflow
- `limit` (number, 可选): 数量限制，默认 50
- `offset` (number, 可选): 偏移量，默认 0

**示例:**
```bash
# 获取用户的 Smartflow
GET /api/v1/smartflows?userId=user-123&limit=10

# 获取公开的 Smartflow
GET /api/v1/smartflows?public=true&limit=20
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "smartflow-123",
      "name": "简单文本生成工作流",
      "description": "...",
      "schema": { ... },
      "status": "active",
      ...
    }
  ],
  "count": 1
}
```

---

### 2. 获取单个 Smartflow

**GET** `/smartflows/:id`

**示例:**
```bash
GET /api/v1/smartflows/smartflow-123
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "smartflow-123",
    "name": "简单文本生成工作流",
    "schema": { ... },
    ...
  }
}
```

---

### 3. 创建 Smartflow

**POST** `/smartflows`

**Body:**
```json
{
  "name": "工作流名称",
  "description": "工作流描述",
  "schema": {
    "nodes": [ ... ],
    "edges": [ ... ]
  },
  "status": "active",
  "author_id": "user-123"
}
```

**示例:**
```bash
POST /api/v1/smartflows
Content-Type: application/json

{
  "name": "简单文本生成工作流",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "input": [
          { "content": "", "type": "text", "name": "user_input" }
        ],
        "expected_outputs": [
          { "type": "text", "name": "result", "required": true }
        ]
      },
      {
        "id": "text_gen",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "{{input.user_input}}"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "result": "{{text_gen.response}}"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "text_gen" },
      { "from": "text_gen", "to": "end" }
    ]
  },
  "author_id": "user-123"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "smartflow-123",
    "name": "简单文本生成工作流",
    ...
  }
}
```

---

### 4. 更新 Smartflow

**PUT** `/smartflows/:id`

**Body:**
```json
{
  "name": "新名称",
  "description": "新描述",
  "schema": { ... },
  "status": "active"
}
```

**示例:**
```bash
PUT /api/v1/smartflows/smartflow-123
Content-Type: application/json

{
  "name": "更新后的工作流名称"
}
```

---

### 5. 删除 Smartflow

**DELETE** `/smartflows/:id`

**示例:**
```bash
DELETE /api/v1/smartflows/smartflow-123
```

**响应:**
```json
{
  "success": true,
  "message": "Smartflow deleted successfully"
}
```

---

### 6. 执行 Smartflow（创建 Task）

**POST** `/smartflows/:id/execute`

**Body:**
```json
{
  "userId": "user-123",
  "input": [
    {
      "content": "用户输入的内容",
      "type": "text",
      "name": "user_input"
    }
  ],
  "conversationId": "conversation-456"  // 可选
}
```

**示例:**
```bash
POST /api/v1/smartflows/smartflow-123/execute
Content-Type: application/json

{
  "userId": "user-123",
  "input": [
    {
      "content": "你好，请介绍一下自己",
      "type": "text",
      "name": "user_input"
    }
  ]
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "task-123",
    "smartflow_id": "smartflow-123",
    "status": "running",
    "progress": 0,
    "input_data": { ... },
    "flow_chain": [],
    ...
  }
}
```

---

## Task 接口

**注意**：通过 Gateway 访问时，使用 `/smartflow-tasks` 路径；直接访问 mxmagent 时，使用 `/tasks` 路径。

### 1. 获取 Task 列表

**GET** `/tasks` (直接访问) 或 `/smartflow-tasks` (通过 Gateway)

**Query Parameters:**
- `userId` (string, 必需): 用户 ID
- `limit` (number, 可选): 数量限制，默认 50
- `offset` (number, 可选): 偏移量，默认 0

**示例:**
```bash
# 直接访问 mxmagent
GET /api/v1/tasks?userId=user-123&limit=10

# 通过 Gateway（需要认证）
GET /api/v1/smartflow-tasks?userId=user-123&limit=10
Authorization: Bearer <token>
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "task-123",
      "smartflow_id": "smartflow-123",
      "status": "completed",
      "progress": 100,
      "output_data": { ... },
      "flow_chain": [ ... ],
      ...
    }
  ],
  "count": 1
}
```

---

### 2. 获取单个 Task 详情

**GET** `/tasks/:id` (直接访问) 或 `/smartflow-tasks/:id` (通过 Gateway)

**示例:**
```bash
# 直接访问 mxmagent
GET /api/v1/tasks/task-123

# 通过 Gateway（需要认证）
GET /api/v1/smartflow-tasks/task-123
Authorization: Bearer <token>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "task-123",
    "smartflow_id": "smartflow-123",
    "status": "completed",
    "progress": 100,
    "input_data": {
      "input": [
        {
          "content": "你好，请介绍一下自己",
          "type": "text",
          "name": "user_input"
        }
      ]
    },
    "output_data": {
      "result": "你好！我是一个AI助手..."
    },
    "flow_chain": [
      {
        "node_id": "start",
        "node_name": "工作流入口",
        "state": "completed",
        "timestamp": 1234567890,
        "duration": 10
      },
      {
        "node_id": "text_gen",
        "node_name": "文本生成",
        "state": "completed",
        "input": { ... },
        "output": { "response": "..." },
        "timestamp": 1234567900,
        "duration": 1500
      },
      {
        "node_id": "end",
        "node_name": "工作流结束",
        "state": "completed",
        "timestamp": 1234569400,
        "duration": 5
      }
    ],
    "started_at": "2024-01-01T00:00:00Z",
    "completed_at": "2024-01-01T00:00:01Z",
    ...
  }
}
```

---

## Task 状态说明

- `pending`: 等待执行
- `running`: 执行中
- `completed`: 已完成
- `failed`: 执行失败
- `cancelled`: 已取消

---

## 错误响应格式

```json
{
  "success": false,
  "error": "错误信息"
}
```

---

## 使用流程

1. **创建 Smartflow**: `POST /api/v1/smartflows`
2. **执行 Smartflow**: `POST /api/v1/smartflows/:id/execute` → 返回 Task ID
3. **查询 Task 状态**: `GET /api/v1/tasks/:id` → 轮询直到 `status === 'completed'`
4. **获取结果**: 从 Task 的 `output_data` 字段获取最终输出

---

## 测试

### 方式 1: 直接访问 mxmagent（开发测试）

```bash
# 启动 mxmagent 服务
cd mxmagent
pnpm dev

# 在另一个终端运行测试
pnpm --filter @mxmai/mxmagent test:smartflow-api
```

### 方式 2: 通过 Gateway（生产环境推荐）

```bash
# 1. 启动 Gateway
cd gateway
pnpm dev

# 2. 启动 mxmagent
cd mxmagent
pnpm dev

# 3. 设置环境变量并运行测试
export GATEWAY_URL=http://localhost:3000
export GATEWAY_API_KEY=<your_token>  # 如果需要认证
pnpm --filter @mxmai/mxmagent test:smartflow-api
```

**注意**：测试脚本会自动检测 `GATEWAY_URL` 环境变量，如果设置了则使用 Gateway，否则直接访问 mxmagent。
