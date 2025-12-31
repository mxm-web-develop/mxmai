# API 更新示例

本文档提供更新模板和智能链的 API 使用示例。

## 模型列表接口

### 1. 获取所有支持的模型

**接口**: `GET /api/v1/models`

**示例**:
```bash
curl -X GET http://localhost:3000/api/v1/models
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "name": "gpt-5-nano",
      "display_name": "GPT-5 Nano",
      "description": "快速文本生成",
      "type": "text",
      "supported_providers": ["replicate"],
      "default_params": {
        "temperature": 0.7,
        "max_tokens": 1000
      },
      "parameters": [
        {
          "name": "max_completion_tokens",
          "type": "number",
          "description": "最大完成 token 数",
          "required": false
        },
        {
          "name": "temperature",
          "type": "number",
          "description": "温度参数 (0-2)",
          "required": false,
          "default": 0.7,
          "range": { "min": 0, "max": 2 }
        },
        {
          "name": "top_p",
          "type": "number",
          "description": "核采样 (0-1)",
          "required": false,
          "range": { "min": 0, "max": 1 }
        }
      ]
    },
    {
      "name": "nano-banana",
      "display_name": "Nano Banana",
      "description": "支持图片生成和编辑，多图理解",
      "type": "image",
      "supported_providers": ["replicate", "ppio"],
      "default_params": {
        "aspect_ratio": "1:1",
        "image_size": "1K"
      },
      "parameters": [
        {
          "name": "aspect_ratio",
          "type": "string",
          "description": "宽高比",
          "required": false,
          "default": "1:1",
          "enum": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
        },
        {
          "name": "image_size",
          "type": "string",
          "description": "图片尺寸",
          "required": false,
          "default": "1K",
          "enum": ["1K", "2K", "4K"]
        }
      ]
    }
  ],
  "count": 10
}
```

### 2. 按类型获取模型

**接口**: `GET /api/v1/models?type=text`

**示例**:
```bash
# 获取所有文本模型
curl -X GET "http://localhost:3000/api/v1/models?type=text"

# 获取所有图片模型
curl -X GET "http://localhost:3000/api/v1/models?type=image"
```

### 3. 获取单个模型详情

**接口**: `GET /api/v1/models/:name`

**示例**:
```bash
curl -X GET http://localhost:3000/api/v1/models/nano-banana
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "name": "nano-banana",
    "display_name": "Nano Banana",
    "description": "支持图片生成和编辑，多图理解",
    "type": "image",
    "supported_providers": ["replicate", "ppio"],
    "default_params": {
      "aspect_ratio": "1:1",
      "image_size": "1K"
    },
    "parameters": [
      {
        "name": "aspect_ratio",
        "type": "string",
        "description": "宽高比",
        "required": false,
        "default": "1:1",
        "enum": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
      },
      {
        "name": "image_size",
        "type": "string",
        "description": "图片尺寸",
        "required": false,
        "default": "1K",
        "enum": ["1K", "2K", "4K"]
      },
      {
        "name": "image",
        "type": "string",
        "description": "图片 URL 或 base64（用于编辑）",
        "required": false
      },
      {
        "name": "image_urls",
        "type": "array",
        "description": "多图 URL 列表（用于多图理解）",
        "required": false
      }
    ]
  }
}
```

### 4. 获取所有模型类型

**接口**: `GET /api/v1/models/types/list`

**示例**:
```bash
curl -X GET http://localhost:3000/api/v1/models/types/list
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "type": "text",
      "count": 5,
      "models": [
        { "name": "gpt-5-nano", "display_name": "GPT-5 Nano" },
        { "name": "deepseek-r1", "display_name": "DeepSeek R1" },
        { "name": "gemini-2.5-flash", "display_name": "Gemini 2.5 Flash" },
        { "name": "claude-4.5-sonnet", "display_name": "Claude 4.5 Sonnet" },
        { "name": "gemini-3-pro", "display_name": "Gemini 3 Pro" }
      ]
    },
    {
      "type": "image",
      "count": 5,
      "models": [
        { "name": "nano-banana", "display_name": "Nano Banana" },
        { "name": "flux-fast", "display_name": "Flux Fast" },
        { "name": "flux-kontext-fast", "display_name": "Flux Kontext Fast" },
        { "name": "ideogram-v2a", "display_name": "Ideogram V2A" },
        { "name": "recraft-crisp-upscale", "display_name": "Recraft Crisp Upscale" }
      ]
    },
    {
      "type": "video",
      "count": 0,
      "models": []
    },
    {
      "type": "sound",
      "count": 0,
      "models": []
    },
    {
      "type": "embedding",
      "count": 0,
      "models": []
    }
  ]
}
```

---

## Formatter 节点工作流程说明

### 两种使用方式

1. **使用模板（推荐）**：
   - 提供 `template` 字段（模板名称，如 `"nano-banana-photo-prompt"`）
   - 系统会从数据库加载模板内容
   - 自动从 `reference_nodes` 中提取变量值并填充模板
   - 将填充后的模板发送给 LLM 进行格式转换
   - **不需要 `format_prompt` 字段**

2. **使用自定义提示词**：
   - 不提供 `template`，但提供 `format_prompt` 字段
   - `format_prompt` 可以包含变量引用（如 `{{text_model.text}}`）
   - 系统会解析变量并填充，然后发送给 LLM

### 工作流程示例

**使用模板方式**：
```json
{
  "id": "formatter",
  "type": "formatter",
  "template": "nano-banana-photo-prompt",  // 模板名称
  "output_format": "prompt",
  "formatter_model": "gpt-5-nano",
  "reference_nodes": ["text_model"]  // 提供变量来源
}
```

**使用自定义提示词方式**：
```json
{
  "id": "formatter",
  "type": "formatter",
  "format_prompt": "将以下文本转换为提示词：\n{{text_model.text}}",
  "output_format": "prompt",
  "formatter_model": "gpt-5-nano",
  "reference_nodes": ["text_model"]
}
```

### 为什么推荐使用模板？

- **可复用**：模板可以在多个 Smartflow 中复用
- **易维护**：更新模板内容时，所有使用该模板的 Smartflow 自动生效
- **标准化**：统一的输出格式，便于后续处理
- **简化配置**：不需要在每个 Smartflow 中重复写 `format_prompt`

## 创建 Smartflow 接口说明

### author_id 字段说明

**重要**：`author_id` 字段**不需要在请求 body 中提供**。

系统会从认证 token 中自动获取用户 ID：
1. Gateway 会解析 Bearer token，获取用户信息
2. Gateway 会通过 `x-user-id` header 转发用户 ID 到后端服务
3. 后端服务会自动使用 header 中的用户 ID 作为 `author_id`

**如果 body 中提供了 `author_id`**：
- 系统会验证是否与 token 中的用户 ID 一致
- 如果不一致，返回 `403 Forbidden` 错误
- 这是为了防止用户伪造 `author_id`

**推荐做法**：
- 只提供 `Authorization: Bearer <token>` header
- **不要**在 body 中提供 `author_id` 字段

**示例（正确）**：
```bash
curl -X POST http://localhost:3000/api/v1/smartflows \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "简单文本生成工作流",
    "description": "生成文本内容",
    "schema": {
      "nodes": [...],
      "edges": [...]
    },
    "status": "active",
    "is_public": true
  }'
```

**示例（不推荐，但兼容）**：
```bash
# 如果提供了 author_id，必须与 token 中的用户 ID 一致
curl -X POST http://localhost:3000/api/v1/smartflows \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "简单文本生成工作流",
    "author_id": "user-123",  // 必须与 token 中的用户 ID 一致
    "schema": {...}
  }'
```

---

## 一、更新 Prompt 模板

### 1. 更新模板基本信息

**接口**: `PUT /api/v1/prompt-templates/:id`

**示例：更新 `nano-banana-photo-prompt` 模板**

```bash
curl -X PUT http://localhost:3000/api/v1/prompt-templates/nano-banana-photo-prompt \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Nano Banana 照片提示词模板（更新版）",
    "description": "用于生成高质量照片提示词的模板，已优化输出格式",
    "template": "主题：{{theme}}\n细节：{{details}}\n风格：{{style}}\n质量要求：{{quality}}",
    "variables": [
      {
        "name": "theme",
        "type": "string",
        "description": "图片主题",
        "required": true
      },
      {
        "name": "details",
        "type": "string",
        "description": "详细描述",
        "required": true
      },
      {
        "name": "style",
        "type": "string",
        "description": "风格描述",
        "required": false
      },
      {
        "name": "quality",
        "type": "string",
        "description": "质量要求（如：hd, 4k）",
        "required": false,
        "default": "hd"
      }
    ],
    "category": "image-generation",
    "is_public": true
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "nano-banana-photo-prompt",
    "name": "nano-banana-photo-prompt",
    "display_name": "Nano Banana 照片提示词模板（更新版）",
    "description": "用于生成高质量照片提示词的模板，已优化输出格式",
    "template": "主题：{{theme}}\n细节：{{details}}\n风格：{{style}}\n质量要求：{{quality}}",
    "variables": [...],
    "category": "image-generation",
    "is_public": true,
    "author_id": "user-123",
    "created_at": "2025-12-15T01:00:00.000Z",
    "updated_at": "2025-12-15T03:00:00.000Z"
  }
}
```

### 2. 只更新模板内容

```bash
curl -X PUT http://localhost:3000/api/v1/prompt-templates/nano-banana-photo-prompt \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "新的模板内容：{{theme}} - {{details}}"
  }'
```

## 二、更新 Smartflow（智能链）

### 1. 更新整个 Smartflow

**接口**: `PUT /api/v1/smartflows/:id`

**示例：更新 `text-to-image-optimized` 智能链**

```bash
curl -X PUT http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "文本优化图片生成工作流（更新版）",
    "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片（已更新模型）",
    "schema": {
      "edges": [
        { "from": "start", "to": "text_model" },
        { "from": "text_model", "to": "formatter" },
        { "from": "formatter", "to": "nano_banana" },
        { "from": "nano_banana", "to": "end" }
      ],
      "nodes": [
        {
          "id": "start",
          "type": "start",
          "input": [
            {
              "name": "topic",
              "type": "text",
              "description": "图片主题描述"
            },
            {
              "name": "style",
              "type": "text",
              "description": "图片风格（可选）"
            }
          ],
          "expected_outputs": [
            {
              "name": "result",
              "type": "image",
              "required": true
            }
          ]
        },
        {
          "id": "text_model",
          "type": "model",
          "model": "gpt-5-nano",
          "prompt": "根据以下主题生成一个详细的图片描述：\n主题：{{input.topic}}\n风格：{{input.style}}",
          "model_type": "text"
        },
        {
          "id": "formatter",
          "type": "formatter",
          "template": "nano-banana-photo-prompt",
          "output_format": "prompt",
          "formatter_model": "gpt-5-nano",
          "reference_nodes": ["text_model"]
        },
        {
          "id": "nano_banana",
          "type": "model",
          "model": "nano-banana",
          "prompt": "{{formatter.formatted}}",
          "model_type": "image",
          "image_size": "2K",
          "aspect_ratio": "16:9"
        },
        {
          "id": "end",
          "type": "end",
          "output_mapping": {
            "result": "{{nano_banana.image_urls}}"
          },
          "validate_outputs": true
        }
      ]
    },
    "status": "active",
    "version": "1.0.1"
  }'
```

### 2. 只更新特定节点

**示例：只更新 `text_model` 节点的模型**

```bash
# 1. 先获取当前的 Smartflow
curl -X GET http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" > current_smartflow.json

# 2. 修改节点配置（例如将 text_model 的模型从 gpt-5-nano 改为 deepseek-r1）
# 编辑 current_smartflow.json，修改 text_model 节点：
# {
#   "id": "text_model",
#   "type": "model",
#   "model": "deepseek-r1",  // 更新模型
#   "prompt": "...",
#   "model_type": "text"
# }

# 3. 更新 Smartflow（只更新 schema）
curl -X PUT http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d @current_smartflow.json
```

### 3. 更新 formatter 节点使用的模板

**示例：将 formatter 节点使用的模板从 `nano-banana-photo-prompt` 改为其他模板**

```bash
curl -X PUT http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "nodes": [
        {
          "id": "formatter",
          "type": "formatter",
          "template": "new-template-name",  // 更新模板名称
          "output_format": "prompt",
          "formatter_model": "gpt-5-nano",
          "reference_nodes": ["text_model"]
        }
      ]
    }
  }'
```

**注意**: 
- 如果只更新部分节点，需要包含完整的 `schema.nodes` 数组，或者先获取完整的 Smartflow，修改后再更新。
- **Formatter 节点工作流程说明**：
  - 如果提供了 `template`（模板名称），系统会从数据库加载模板，自动填充变量，然后发送给 LLM 进行格式转换。**不需要 `format_prompt`**。
  - 如果没有 `template` 但有 `format_prompt`，系统会使用 `format_prompt` 作为转换指令。
  - 两者必须提供其一。

### 4. 更新节点参数

**示例：更新 `nano_banana` 节点的参数**

```bash
curl -X PUT http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "nodes": [
        {
          "id": "nano_banana",
          "type": "model",
          "model": "nano-banana",
          "prompt": "{{formatter.formatted}}",
          "model_type": "image",
          "image_size": "4K",        // 更新为 4K
          "aspect_ratio": "21:9"     // 更新宽高比
        }
      ]
    }
  }'
```

### 5. 更新 formatter 节点的模型

**示例：将 formatter 使用的模型从 `gpt-5-nano` 改为 `deepseek-r1`**

```bash
curl -X PUT http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "nodes": [
        {
          "id": "formatter",
          "type": "formatter",
          "template": "nano-banana-photo-prompt",
          "output_format": "prompt",
          "formatter_model": "deepseek-r1",  // 更新模型
          "reference_nodes": ["text_model"]
        }
      ]
    }
  }'
```

## 三、完整更新流程示例

### 场景：更新智能链中的模型和模板

```bash
# 步骤 1: 获取当前 Smartflow
curl -X GET http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" > smartflow.json

# 步骤 2: 更新模板（如果需要）
curl -X PUT http://localhost:3000/api/v1/prompt-templates/nano-banana-photo-prompt \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "优化后的模板内容：{{theme}}\n{{details}}\n{{style}}\n质量：{{quality}}"
  }'

# 步骤 3: 更新 Smartflow 中的节点
curl -X PUT http://localhost:3000/api/v1/smartflows/text-to-image-optimized \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "nodes": [
        {
          "id": "text_model",
          "type": "model",
          "model": "gpt-5-nano",
          "prompt": "根据以下主题生成一个详细的图片描述：\n主题：{{input.topic}}\n风格：{{input.style}}",
          "model_type": "text"
        },
        {
          "id": "formatter",
          "type": "formatter",
          "template": "nano-banana-photo-prompt",
          "output_format": "prompt",
          "formatter_model": "gpt-5-nano",
          "reference_nodes": ["text_model"]
        },
        {
          "id": "nano_banana",
          "type": "model",
          "model": "nano-banana",
          "prompt": "{{formatter.formatted}}",
          "model_type": "image",
          "image_size": "2K",
          "aspect_ratio": "16:9"
        }
      ]
    },
    "version": "1.0.2"
  }'
```

## 四、删除 Smartflow

### 删除智能链

**接口**: `DELETE /api/v1/smartflows/:id`

**示例**:
```bash
curl -X DELETE http://localhost:3000/api/v1/smartflows/text-to-image-seedream \
  -H "Authorization: Bearer <your_token>"
```

**重要提示**:
- DELETE 请求**不需要 body**，不要在 Postman 中设置 body
- 如果使用 Postman，请选择 "Body" 标签页，然后选择 "none"（不要选择 "raw" 或 "JSON"）
- 只需要在 URL 中提供 Smartflow 的 ID

**响应示例**:
```json
{
  "success": true,
  "message": "Smartflow deleted successfully"
}
```

**错误处理**:
- `404 Not Found`: Smartflow 不存在
- `401 Unauthorized`: 认证失败
- `403 Forbidden`: 没有权限删除该 Smartflow
- `500 Internal Server Error`: 服务器错误（如果遇到 "Unexpected end of JSON input"，请检查是否设置了空的 JSON body）

## 五、注意事项

1. **部分更新**: 更新 Smartflow 时，如果只提供部分字段，其他字段保持不变。但如果更新 `schema.nodes`，需要提供完整的节点数组，或者先获取完整配置再修改。

2. **模板引用**: 更新 formatter 节点的 `template` 字段时，确保该模板已存在。

3. **模型验证**: 更新节点模型时，确保模型名称在 `model-registry` 中已注册。

4. **版本管理**: 建议在更新时同时更新 `version` 字段，便于版本追踪。

5. **权限检查**: 更新操作需要认证，确保使用有效的 token。

## 六、错误处理

如果更新失败，API 会返回错误信息：

```json
{
  "success": false,
  "error": "错误描述信息"
}
```

常见错误：
- `404 Not Found`: 模板或 Smartflow 不存在
- `400 Bad Request`: 请求数据格式错误或缺少必需字段
- `401 Unauthorized`: 认证失败
- `403 Forbidden`: 没有权限更新该资源
