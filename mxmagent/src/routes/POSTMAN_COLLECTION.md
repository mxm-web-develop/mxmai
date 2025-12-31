# Smartflow API Postman 测试集合

## 环境变量配置

在 Postman 中创建环境变量：

```
BASE_URL: http://localhost:3000
GATEWAY_URL: http://localhost:3000
MXMAGENT_URL: http://localhost:4004
API_BASE: {{BASE_URL}}/api/v1
AUTH_TOKEN: <your_jwt_token>
```

---

## 一、Smartflow 接口

### 1. 创建 Smartflow

**请求:**
- **Method**: `POST`
- **URL**: `{{API_BASE}}/smartflows`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {{AUTH_TOKEN}}
  ```
- **Body** (raw JSON):
```json
{
  "name": "简单文本生成工作流",
  "description": "一个简单的文本生成工作流示例",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "input": [
          {
            "content": "",
            "type": "text",
            "name": "user_input"
          }
        ],
        "expected_outputs": [
          {
            "type": "text",
            "name": "result",
            "required": true
          }
        ],
        "smartflow_name": "简单文本生成工作流"
      },
      {
        "id": "text_gen",
        "type": "model",
        "name": "文本生成",
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
  "status": "active",
  "author_id": "test-user-123"
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "smartflow-123...",
    "name": "简单文本生成工作流",
    ...
  }
}
```

---

### 2. 获取 Smartflow 列表

**请求:**
- **Method**: `GET`
- **URL**: `{{API_BASE}}/smartflows?userId=test-user-123&limit=10`
- **Headers**:
  ```
  Authorization: Bearer {{AUTH_TOKEN}}
  ```

---

### 3. 获取单个 Smartflow

**请求:**
- **Method**: `GET`
- **URL**: `{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}`
- **Headers**:
  ```
  Authorization: Bearer {{AUTH_TOKEN}}
  ```

**变量**: `SMARTFLOW_ID` - 从创建接口的响应中获取

---

### 4. 更新 Smartflow

**请求:**
- **Method**: `PUT`
- **URL**: `{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {{AUTH_TOKEN}}
  ```
- **Body** (raw JSON):
```json
{
  "name": "更新后的工作流名称",
  "description": "更新后的描述"
}
```

---

### 5. 删除 Smartflow

**请求:**
- **Method**: `DELETE`
- **URL**: `{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}`
- **Headers**:
  ```
  Authorization: Bearer {{AUTH_TOKEN}}
  ```

---

### 6. 执行 Smartflow（创建 Task）

**请求:**
- **Method**: `POST`
- **URL**: `{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}/execute`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {{AUTH_TOKEN}}
  ```
- **Body** (raw JSON):
```json
{
  "userId": "test-user-123",
  "input": [
    {
      "content": "你好，请介绍一下自己",
      "type": "text",
      "name": "user_input"
    }
  ],
  "conversationId": "conversation-456"
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "task-123...",
    "smartflow_id": "smartflow-123...",
    "status": "running",
    "progress": 0,
    ...
  }
}
```

**变量**: `TASK_ID` - 从响应中获取 `data.id`

---

## 二、Task 接口

### 1. 获取 Task 详情

**请求:**
- **Method**: `GET`
- **URL**: `{{API_BASE}}/smartflow-tasks/{{TASK_ID}}`
- **Headers**:
  ```
  Authorization: Bearer {{AUTH_TOKEN}}
  ```

**注意**: 通过 Gateway 访问时使用 `/smartflow-tasks`，直接访问 mxmagent 时使用 `/tasks`

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "task-123...",
    "status": "completed",
    "progress": 100,
    "input_data": { ... },
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
    ...
  }
}
```

---

### 2. 获取用户的 Task 列表

**请求:**
- **Method**: `GET`
- **URL**: `{{API_BASE}}/smartflow-tasks?userId=test-user-123&limit=10&offset=0`
- **Headers**:
  ```
  Authorization: Bearer {{AUTH_TOKEN}}
  ```

---

## 三、测试流程

### 完整测试流程

1. **创建 Smartflow**
   - 使用 "创建 Smartflow" 接口
   - 保存响应中的 `id` 到环境变量 `SMARTFLOW_ID`

2. **执行 Smartflow**
   - 使用 "执行 Smartflow" 接口
   - 传入 `SMARTFLOW_ID`
   - 保存响应中的 `data.id` 到环境变量 `TASK_ID`

3. **查询 Task 状态（轮询）**
   - 使用 "获取 Task 详情" 接口
   - 重复调用直到 `status === 'completed'` 或 `status === 'failed'`
   - 查看 `output_data` 获取最终输出
   - 查看 `flow_chain` 获取执行链

4. **查看 Task 列表**
   - 使用 "获取用户的 Task 列表" 接口
   - 查看所有执行历史

---

## 四、Postman Collection JSON

```json
{
  "info": {
    "name": "Smartflow API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Smartflows",
      "item": [
        {
          "name": "创建 Smartflow",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{AUTH_TOKEN}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"简单文本生成工作流\",\n  \"schema\": {\n    \"nodes\": [\n      {\n        \"id\": \"start\",\n        \"type\": \"start\",\n        \"input\": [\n          {\n            \"content\": \"\",\n            \"type\": \"text\",\n            \"name\": \"user_input\"\n          }\n        ],\n        \"expected_outputs\": [\n          {\n            \"type\": \"text\",\n            \"name\": \"result\",\n            \"required\": true\n          }\n        ]\n      },\n      {\n        \"id\": \"text_gen\",\n        \"type\": \"model\",\n        \"model_type\": \"text\",\n        \"model\": \"gpt-5-nano\",\n        \"prompt\": \"{{input.user_input}}\"\n      },\n      {\n        \"id\": \"end\",\n        \"type\": \"end\",\n        \"output_mapping\": {\n          \"result\": \"{{text_gen.response}}\"\n        }\n      }\n    ],\n    \"edges\": [\n      { \"from\": \"start\", \"to\": \"text_gen\" },\n      { \"from\": \"text_gen\", \"to\": \"end\" }\n    ]\n  },\n  \"author_id\": \"test-user-123\"\n}"
            },
            "url": {
              "raw": "{{API_BASE}}/smartflows",
              "host": ["{{API_BASE}}"],
              "path": ["smartflows"]
            }
          }
        },
        {
          "name": "获取 Smartflow 列表",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{AUTH_TOKEN}}"
              }
            ],
            "url": {
              "raw": "{{API_BASE}}/smartflows?userId=test-user-123&limit=10",
              "host": ["{{API_BASE}}"],
              "path": ["smartflows"],
              "query": [
                {
                  "key": "userId",
                  "value": "test-user-123"
                },
                {
                  "key": "limit",
                  "value": "10"
                }
              ]
            }
          }
        },
        {
          "name": "获取单个 Smartflow",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{AUTH_TOKEN}}"
              }
            ],
            "url": {
              "raw": "{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}",
              "host": ["{{API_BASE}}"],
              "path": ["smartflows", "{{SMARTFLOW_ID}}"]
            }
          }
        },
        {
          "name": "执行 Smartflow",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{AUTH_TOKEN}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"userId\": \"test-user-123\",\n  \"input\": [\n    {\n      \"content\": \"你好，请介绍一下自己\",\n      \"type\": \"text\",\n      \"name\": \"user_input\"\n    }\n  ]\n}"
            },
            "url": {
              "raw": "{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}/execute",
              "host": ["{{API_BASE}}"],
              "path": ["smartflows", "{{SMARTFLOW_ID}}", "execute"]
            }
          }
        }
      ]
    },
    {
      "name": "Tasks",
      "item": [
        {
          "name": "获取 Task 详情",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{AUTH_TOKEN}}"
              }
            ],
            "url": {
              "raw": "{{API_BASE}}/smartflow-tasks/{{TASK_ID}}",
              "host": ["{{API_BASE}}"],
              "path": ["smartflow-tasks", "{{TASK_ID}}"]
            }
          }
        },
        {
          "name": "获取用户的 Task 列表",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{AUTH_TOKEN}}"
              }
            ],
            "url": {
              "raw": "{{API_BASE}}/smartflow-tasks?userId=test-user-123&limit=10",
              "host": ["{{API_BASE}}"],
              "path": ["smartflow-tasks"],
              "query": [
                {
                  "key": "userId",
                  "value": "test-user-123"
                },
                {
                  "key": "limit",
                  "value": "10"
                }
              ]
            }
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "API_BASE",
      "value": "http://localhost:3000/api/v1"
    },
    {
      "key": "AUTH_TOKEN",
      "value": ""
    },
    {
      "key": "SMARTFLOW_ID",
      "value": ""
    },
    {
      "key": "TASK_ID",
      "value": ""
    }
  ]
}
```

---

## 五、快速测试步骤

1. **启动服务**
   ```bash
   # 启动所有服务（包括 mxmagent）
   pnpm dev:all
   ```

2. **获取认证 Token**
   - 先登录获取 JWT token
   - 或使用测试 token（如果配置了 `ADMIN_TOKEN`）

3. **在 Postman 中设置环境变量**
   - `BASE_URL`: `http://localhost:3000`
   - `API_BASE`: `{{BASE_URL}}/api/v1`
   - `AUTH_TOKEN`: `<your_token>`

4. **按顺序测试**
   - 创建 Smartflow → 保存 `SMARTFLOW_ID`
   - 执行 Smartflow → 保存 `TASK_ID`
   - 查询 Task 状态 → 轮询直到完成
   - 查看最终输出和 flow_chain

---

## 六、常见问题

### 1. 401 Unauthorized
- 检查 `AUTH_TOKEN` 是否正确设置
- 确认 token 未过期
- 确认 Gateway 的 `JWT_SECRET` 与 mxmauth 一致

### 2. 502 Bad Gateway
- 确认 mxmagent 服务已启动
- 检查 Gateway 的 `MXMAGENT_URL` 配置是否正确

### 3. Task 状态一直是 running
- 检查 mxmcgi 服务是否正常运行
- 查看 mxmagent 服务的日志
- 确认数据库连接正常

---

**现在可以使用 Postman 进行测试了！**
