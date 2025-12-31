# 3x3九宫格Studio人物写真智能链 - Postman测试指南

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

## 测试步骤

### 步骤1: 创建智能链

**请求:**
- **Method**: `POST`
- **URL**: `{{API_BASE}}/smartflows`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {{AUTH_TOKEN}}
  ```
- **Body** (raw JSON):

将 `studio-portrait-3x3-grid.json` 文件的内容复制到 Body 中，或者使用以下简化版本：

```json
{
  "name": "3x3九宫格室内专业Studio人物写真生成",
  "version": "1.0.0",
  "is_public": true,
  "status": "active",
  "description": "用户上传1-3张参考图片，AI分析人物面部特征，生成一张3x3九宫格室内专业studio摄影师人物写真",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "input": [
          {
            "name": "reference_images",
            "type": "image",
            "description": "参考图片（1-3张，支持base64或URL），用于提取人物面部特征"
          },
          {
            "name": "style_preference",
            "type": "text",
            "description": "风格偏好（可选，如：商务、时尚、艺术等，默认为专业studio风格）"
          }
        ],
        "expected_outputs": [
          {
            "type": "image",
            "name": "portrait_grid",
            "required": true
          }
        ],
        "smartflow_name": "3x3九宫格Studio人物写真生成"
      },
      {
        "id": "analyze_face_features",
        "type": "model",
        "model_type": "text",
        "model": "gemini-3-pro",
        "prompt": "请仔细分析用户提供的参考图片中的人物面部特征...",
        "params": {
          "images": "{{input.reference_images}}",
          "temperature": 0.3,
          "max_tokens": 2000,
          "outputFormat": "json"
        }
      },
      {
        "id": "generate_portrait_prompt",
        "type": "model",
        "model_type": "text",
        "model": "gemini-3-pro",
        "prompt": "基于以下人物面部特征分析，生成一个详细的图片生成prompt...",
        "params": {
          "temperature": 0.7,
          "max_tokens": 2000,
          "outputFormat": "json"
        },
        "reference_nodes": ["analyze_face_features"]
      },
      {
        "id": "generate_portrait_grid",
        "type": "model",
        "model_type": "image",
        "model": "nano-banana",
        "prompt": "{{generate_portrait_prompt.text}}",
        "params": {
          "aspect_ratio": "1:1",
          "image_size": "2K"
        },
        "reference_nodes": ["generate_portrait_prompt"]
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "portrait_grid": "{{generate_portrait_grid.image_urls}}"
        },
        "validate_outputs": true
      }
    ],
    "edges": [
      { "from": "start", "to": "analyze_face_features" },
      { "from": "analyze_face_features", "to": "generate_portrait_prompt" },
      { "from": "generate_portrait_prompt", "to": "generate_portrait_grid" },
      { "from": "generate_portrait_grid", "to": "end" }
    ]
  }
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "smartflow-xxx",
    "name": "3x3九宫格室内专业Studio人物写真生成",
    ...
  }
}
```

**保存响应中的 `id` 到环境变量 `SMARTFLOW_ID`**

---

### 步骤2: 执行智能链（使用图片URL）

**请求:**
- **Method**: `POST`
- **URL**: `{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}/execute`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {{AUTH_TOKEN}}
  ```
- **Body** (raw JSON):

**方式1: 使用图片URL（推荐）**
```json
{
  "userId": "test-user-123",
  "input": [
    {
      "name": "reference_images",
      "type": "image",
      "content": [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
      ]
    },
    {
      "name": "style_preference",
      "type": "text",
      "content": "商务风格"
    }
  ],
  "conversationId": "conversation-456"
}
```

**方式2: 使用单张图片URL**
```json
{
  "userId": "test-user-123",
  "input": [
    {
      "name": "reference_images",
      "type": "image",
      "content": "https://example.com/image1.jpg"
    },
    {
      "name": "style_preference",
      "type": "text",
      "content": "时尚风格"
    }
  ]
}
```

**方式3: 使用Base64图片（适合小图片）**
```json
{
  "userId": "test-user-123",
  "input": [
    {
      "name": "reference_images",
      "type": "image",
      "content": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD..."
    },
    {
      "name": "style_preference",
      "type": "text",
      "content": "艺术风格"
    }
  ]
}
```

**方式4: 使用Base64图片数组**
```json
{
  "userId": "test-user-123",
  "input": [
    {
      "name": "reference_images",
      "type": "image",
      "content": [
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
      ]
    }
  ]
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "task-xxx",
    "smartflow_id": "smartflow-xxx",
    "status": "running",
    "progress": 0,
    "message": "Task created successfully. Use the task ID to query execution status.",
    "status_url": "/api/v1/smartflows/task-xxx/status"
  }
}
```

**保存响应中的 `id` 到环境变量 `TASK_ID`**

---

### 步骤3: 查询执行状态

**请求:**
- **Method**: `GET`
- **URL**: `{{API_BASE}}/smartflow-tasks/{{TASK_ID}}`
- **Headers**:
  ```
  Authorization: Bearer {{AUTH_TOKEN}}
  ```

**预期响应（执行中）:**
```json
{
  "success": true,
  "data": {
    "id": "task-xxx",
    "status": "running",
    "progress": 50,
    "input_data": {
      "input": [...]
    },
    "output_data": null,
    "flow_chain": [
      {
        "node_id": "start",
        "state": "completed",
        "timestamp": 1234567890
      },
      {
        "node_id": "analyze_face_features",
        "state": "running",
        "timestamp": 1234567900
      }
    ]
  }
}
```

**预期响应（执行完成）:**
```json
{
  "success": true,
  "data": {
    "id": "task-xxx",
    "status": "completed",
    "progress": 100,
    "input_data": {
      "input": [...]
    },
    "output_data": {
      "portrait_grid": [
        "https://example.com/generated-image.jpg"
      ]
    },
    "flow_chain": [
      {
        "node_id": "start",
        "state": "completed",
        "timestamp": 1234567890
      },
      {
        "node_id": "analyze_face_features",
        "state": "completed",
        "output": {...},
        "timestamp": 1234567900
      },
      {
        "node_id": "generate_portrait_prompt",
        "state": "completed",
        "output": {...},
        "timestamp": 1234568000
      },
      {
        "node_id": "generate_portrait_grid",
        "state": "completed",
        "output": {
          "image_urls": ["https://example.com/generated-image.jpg"]
        },
        "timestamp": 1234569000
      },
      {
        "node_id": "end",
        "state": "completed",
        "timestamp": 1234569010
      }
    ]
  }
}
```

---

## 完整测试流程示例

### 1. 准备测试图片

你可以使用以下方式获取图片：
- **在线图片URL**: 使用公开的图片URL（如：`https://picsum.photos/400/400`）
- **Base64编码**: 将本地图片转换为base64（注意：base64字符串可能很长）

### 2. 创建智能链

使用步骤1的请求创建智能链，保存返回的 `smartflow_id`

### 3. 执行智能链

使用步骤2的请求执行智能链，根据你的图片格式选择合适的请求体：
- 如果使用在线图片URL，使用**方式1**或**方式2**
- 如果使用本地图片，先转换为base64，使用**方式3**或**方式4**

### 4. 轮询查询状态

使用步骤3的请求定期查询执行状态，直到 `status` 变为 `completed` 或 `failed`

### 5. 获取结果

执行完成后，从 `output_data.portrait_grid` 中获取生成的图片URL

---

## 注意事项

1. **图片格式支持**:
   - URL格式: `https://example.com/image.jpg`
   - Base64格式: `data:image/jpeg;base64,xxx...` 或纯base64字符串

2. **图片数量**:
   - 支持1-3张参考图片
   - 单张图片：`content` 为字符串
   - 多张图片：`content` 为数组

3. **认证**:
   - 确保 `AUTH_TOKEN` 环境变量已设置
   - Token会从Authorization header中自动提取用户ID

4. **异步执行**:
   - 执行请求会立即返回task_id，实际执行在后台进行
   - 需要轮询查询状态直到完成

5. **错误处理**:
   - 如果执行失败，`status` 会变为 `failed`
   - 检查 `flow_chain` 中各个节点的状态定位问题

---

## Postman Collection 导入

你可以将以下请求保存为Postman Collection：

```json
{
  "info": {
    "name": "3x3九宫格Studio人物写真智能链",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. 创建智能链",
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
          "raw": "{{SMARTFLOW_SCHEMA}}"
        },
        "url": {
          "raw": "{{API_BASE}}/smartflows",
          "host": ["{{API_BASE}}"],
          "path": ["smartflows"]
        }
      }
    },
    {
      "name": "2. 执行智能链（URL图片）",
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
          "raw": "{\n  \"userId\": \"test-user-123\",\n  \"input\": [\n    {\n      \"name\": \"reference_images\",\n      \"type\": \"image\",\n      \"content\": [\"https://example.com/image1.jpg\"]\n    },\n    {\n      \"name\": \"style_preference\",\n      \"type\": \"text\",\n      \"content\": \"商务风格\"\n    }\n  ]\n}"
        },
        "url": {
          "raw": "{{API_BASE}}/smartflows/{{SMARTFLOW_ID}}/execute",
          "host": ["{{API_BASE}}"],
          "path": ["smartflows", "{{SMARTFLOW_ID}}", "execute"]
        }
      }
    },
    {
      "name": "3. 查询执行状态",
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
    }
  ],
  "variable": [
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
