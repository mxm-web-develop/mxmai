# Smartflow 示例：文本优化 + 图片生成工作流

这是一个完整的工作流示例，展示如何使用文本模型生成内容，通过 formatter 节点优化提示词，然后使用 nano-banana 生成图片。

## 快速开始

### 1. 调用接口创建 Smartflow

直接使用 curl 命令创建智能链：

```bash
curl -X POST http://localhost:3000/api/v1/smartflows \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
  "id": "text-to-image-optimized",
  "name": "文本优化图片生成工作流",
  "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片",
  "category": "image-generation",
  "tags": ["image", "text", "formatter", "nano-banana"],
  "schema": {
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
            "type": "image",
            "name": "result",
            "required": true
          }
        ],
        "smartflow_name": "文本优化图片生成工作流"
      },
      {
        "id": "text_model",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "根据以下主题生成一个详细的图片描述，包含场景、氛围、细节等信息：\n主题：{{input.topic}}\n风格：{{input.style}}\n\n要求：描述要详细、生动，适合用于图片生成。"
      },
      {
        "id": "formatter",
        "type": "formatter",
        "template": "nano-banana-photo-prompt",
        "format_prompt": "将以下文本描述转换为专业的摄影 prompt，包含构图、光线、风格等细节：\n{{text_model.text}}",
        "reference_nodes": ["text_model"],
        "output_format": "prompt",
        "formatter_model": "gpt-5-nano"
      },
      {
        "id": "nano_banana",
        "type": "model",
        "model_type": "image",
        "model": "nano-banana",
        "prompt": "{{formatter.formatted}}",
        "aspect_ratio": "16:9",
        "image_size": "2K"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "result": "nano_banana.image_urls"
        },
        "validate_outputs": true
      }
    ],
    "edges": [
      { "from": "start", "to": "text_model" },
      { "from": "text_model", "to": "formatter" },
      { "from": "formatter", "to": "nano_banana" },
      { "from": "nano_banana", "to": "end" }
    ]
  },
  "status": "active",
  "is_public": false,
  "author_id": "user-123"
}'
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "text-to-image-optimized",
    "name": "文本优化图片生成工作流",
    "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片",
    "schema": { ... },
    "status": "active",
    "is_public": false,
    "author_id": "user-123",
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

### 2. 执行 Smartflow

**重要提示**：执行接口需要认证，请确保 Authorization 头部格式正确：
- ✅ 正确格式：`Authorization: Bearer <your_token>`（注意：`Bearer` 后面有一个空格）
- ❌ 错误格式：`Authorization: Beaerer <token>`（拼写错误）
- ❌ 错误格式：`Authorization:Bearer <token>`（缺少空格）

```bash
curl -X POST http://localhost:3000/api/v1/smartflows/text-to-image-optimized/execute \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "input": [
      {
        "content": "一只可爱的小猫坐在窗台上",
        "type": "text",
        "name": "topic"
      },
      {
        "content": "温馨、自然光",
        "type": "text",
        "name": "style"
      }
    ]
  }'
```

**响应示例**（保存返回的 `id`，用于后续查询）：
```json
{
  "success": true,
  "data": {
    "id": "execution-123456",
    "smartflow_id": "text-to-image-optimized",
    "user_id": "user-123",
    "status": "running",
    "progress": 0,
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

### 3. 查询执行结果

```bash
# 获取执行状态（替换 <execution_id> 为实际返回的 ID）
curl http://localhost:3000/api/v1/smartflow-tasks/<execution_id> \
  -H "Authorization: Bearer <your_token>"
```

---

## 详细说明

## 工作流结构

```
start → text_model → formatter → nano_banana → end
```

1. **start 节点**：接收用户输入（主题描述）
2. **text_model 节点**：使用文本模型生成初始描述
3. **formatter 节点**：使用模板优化提示词为专业的摄影 prompt
4. **nano_banana 节点**：使用优化后的 prompt 生成图片
5. **end 节点**：输出最终图片

## 前置条件

1. **确保模板已初始化**：
   ```bash
   cd mxmdata
   pnpm run init:prompt-templates
   ```

2. **确保服务已启动**：
   - Gateway: `http://localhost:3000`
   - mxmagent: `http://localhost:4004`
   - mxmcgi: `http://localhost:4003`

3. **准备认证 Token**：
   - 通过登录接口获取 token，或使用 `ADMIN_TOKEN`

## 步骤 1: 创建 Smartflow

### 请求示例

```bash
POST http://localhost:3000/api/v1/smartflows
Authorization: Bearer <your_token>
Content-Type: application/json
```

### 请求体

```json
{
  "id": "text-to-image-optimized",
  "name": "文本优化图片生成工作流",
  "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片",
  "category": "image-generation",
  "tags": ["image", "text", "formatter", "nano-banana"],
  "schema": {
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
            "type": "image",
            "name": "result",
            "required": true
          }
        ],
        "smartflow_name": "文本优化图片生成工作流"
      },
      {
        "id": "text_model",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "根据以下主题生成一个详细的图片描述，包含场景、氛围、细节等信息：\n主题：{{input.topic}}\n风格：{{input.style}}\n\n要求：描述要详细、生动，适合用于图片生成。"
      },
      {
        "id": "formatter",
        "type": "formatter",
        "template": "nano-banana-photo-prompt",
        "format_prompt": "将以下文本描述转换为专业的摄影 prompt，包含构图、光线、风格等细节：\n{{text_model.text}}",
        "reference_nodes": ["text_model"],
        "output_format": "prompt",
        "formatter_model": "gpt-5-nano"
      },
      {
        "id": "nano_banana",
        "type": "model",
        "model_type": "image",
        "model": "nano-banana",
        "prompt": "{{formatter.formatted}}",
        "aspect_ratio": "16:9",
        "image_size": "2K"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "result": "nano_banana.image_urls"
        },
        "validate_outputs": true
      }
    ],
    "edges": [
      { "from": "start", "to": "text_model" },
      { "from": "text_model", "to": "formatter" },
      { "from": "formatter", "to": "nano_banana" },
      { "from": "nano_banana", "to": "end" }
    ]
  },
  "status": "active",
  "is_public": false,
  "author_id": "user-123"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "text-to-image-optimized",
    "name": "文本优化图片生成工作流",
    "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片",
    "schema": { ... },
    "status": "active",
    "is_public": false,
    "author_id": "user-123",
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

## 步骤 2: 执行 Smartflow

### 请求示例

```bash
POST http://localhost:3000/api/v1/smartflows/text-to-image-optimized/execute
Authorization: Bearer <your_token>
Content-Type: application/json
```

### 请求体

```json
{
  "userId": "user-123",
  "input": [
    {
      "content": "一只可爱的小猫坐在窗台上",
      "type": "text",
      "name": "topic"
    },
    {
      "content": "温馨、自然光",
      "type": "text",
      "name": "style"
    }
  ],
  "conversationId": "conv-123"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "execution-123456",
    "smartflow_id": "text-to-image-optimized",
    "user_id": "user-123",
    "status": "running",
    "progress": 0,
    "input_data": [
      {
        "content": "一只可爱的小猫坐在窗台上",
        "type": "text",
        "name": "topic"
      },
      {
        "content": "温馨、自然光",
        "type": "text",
        "name": "style"
      }
    ],
    "flow_chain": [],
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

## 步骤 3: 查询执行状态

### 请求示例

```bash
GET http://localhost:3000/api/v1/smartflow-tasks/execution-123456
Authorization: Bearer <your_token>
```

### 响应示例（执行中）

```json
{
  "success": true,
  "data": {
    "id": "execution-123456",
    "smartflow_id": "text-to-image-optimized",
    "user_id": "user-123",
    "status": "running",
    "progress": 50,
    "flow_chain": [
      {
        "node_id": "start",
        "node_type": "start",
        "status": "completed",
        "output": {
          "input": {
            "topic": "一只可爱的小猫坐在窗台上",
            "style": "温馨、自然光"
          }
        },
        "duration_ms": 5,
        "timestamp": "2025-01-15T12:00:00Z"
      },
      {
        "node_id": "text_model",
        "node_type": "model",
        "status": "completed",
        "output": {
          "text": "一只可爱的小猫，毛色柔软，坐在明亮的窗台上，阳光透过窗户洒在它身上，营造出温馨自然的氛围..."
        },
        "duration_ms": 1234,
        "timestamp": "2025-01-15T12:00:01Z"
      },
      {
        "node_id": "formatter",
        "node_type": "formatter",
        "status": "completed",
        "output": {
          "formatted": "专业摄影风格提示词：\n主题：一只可爱的小猫坐在窗台上\n风格：温馨、自然光\n细节：毛色柔软，阳光透过窗户洒在它身上\n质量要求：高清、细节丰富",
          "original": {
            "text_model": {
              "text": "一只可爱的小猫，毛色柔软，坐在明亮的窗台上..."
            }
          }
        },
        "duration_ms": 567,
        "timestamp": "2025-01-15T12:00:02Z"
      },
      {
        "node_id": "nano_banana",
        "node_type": "model",
        "status": "processing",
        "output": null,
        "duration_ms": 0,
        "timestamp": "2025-01-15T12:00:03Z"
      }
    ],
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

### 响应示例（已完成）

```json
{
  "success": true,
  "data": {
    "id": "execution-123456",
    "smartflow_id": "text-to-image-optimized",
    "user_id": "user-123",
    "status": "completed",
    "progress": 100,
    "input_data": [ ... ],
    "output_data": {
      "result": [
        "https://example.com/generated-image-123456.jpg"
      ]
    },
    "flow_chain": [
      {
        "node_id": "start",
        "node_type": "start",
        "status": "completed",
        "output": { ... },
        "duration_ms": 5,
        "timestamp": "2025-01-15T12:00:00Z"
      },
      {
        "node_id": "text_model",
        "node_type": "model",
        "status": "completed",
        "output": {
          "text": "一只可爱的小猫，毛色柔软，坐在明亮的窗台上..."
        },
        "duration_ms": 1234,
        "timestamp": "2025-01-15T12:00:01Z"
      },
      {
        "node_id": "formatter",
        "node_type": "formatter",
        "status": "completed",
        "output": {
          "formatted": "专业摄影风格提示词：\n主题：一只可爱的小猫坐在窗台上\n风格：温馨、自然光\n细节：毛色柔软，阳光透过窗户洒在它身上\n质量要求：高清、细节丰富",
          "original": {
            "text_model": {
              "text": "一只可爱的小猫，毛色柔软，坐在明亮的窗台上..."
            }
          }
        },
        "duration_ms": 567,
        "timestamp": "2025-01-15T12:00:02Z"
      },
      {
        "node_id": "nano_banana",
        "node_type": "model",
        "status": "completed",
        "output": {
          "image_urls": [
            "https://example.com/generated-image-123456.jpg"
          ]
        },
        "duration_ms": 15000,
        "timestamp": "2025-01-15T12:00:17Z"
      },
      {
        "node_id": "end",
        "node_type": "end",
        "status": "completed",
        "output": {
          "result": [
            "https://example.com/generated-image-123456.jpg"
          ]
        },
        "duration_ms": 10,
        "timestamp": "2025-01-15T12:00:17Z"
      }
    ],
    "started_at": "2025-01-15T12:00:00Z",
    "completed_at": "2025-01-15T12:00:17Z",
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

## 完整测试流程（使用 curl）

### 1. 检查模板是否存在

```bash
# 检查模板是否存在
curl http://localhost:3000/api/v1/prompt-templates/name/nano-banana-photo-prompt

# 如果返回 404，先初始化模板
cd mxmdata
pnpm run init:prompt-templates
```

### 2. 创建 Smartflow

直接调用接口创建智能链：

```bash
curl -X POST http://localhost:3000/api/v1/smartflows \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
  "id": "text-to-image-optimized",
  "name": "文本优化图片生成工作流",
  "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片",
  "category": "image-generation",
  "tags": ["image", "text", "formatter", "nano-banana"],
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "input": [
          {"name": "topic", "type": "text", "description": "图片主题描述"},
          {"name": "style", "type": "text", "description": "图片风格（可选）"}
        ],
        "expected_outputs": [
          {"type": "image", "name": "result", "required": true}
        ],
        "smartflow_name": "文本优化图片生成工作流"
      },
      {
        "id": "text_model",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "根据以下主题生成一个详细的图片描述，包含场景、氛围、细节等信息：\n主题：{{input.topic}}\n风格：{{input.style}}\n\n要求：描述要详细、生动，适合用于图片生成。"
      },
      {
        "id": "formatter",
        "type": "formatter",
        "template": "nano-banana-photo-prompt",
        "format_prompt": "将以下文本描述转换为专业的摄影 prompt，包含构图、光线、风格等细节：\n{{text_model.text}}",
        "reference_nodes": ["text_model"],
        "output_format": "prompt",
        "formatter_model": "gpt-5-nano"
      },
      {
        "id": "nano_banana",
        "type": "model",
        "model_type": "image",
        "model": "nano-banana",
        "prompt": "{{formatter.formatted}}",
        "aspect_ratio": "16:9",
        "image_size": "2K"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {"result": "nano_banana.image_urls"},
        "validate_outputs": true
      }
    ],
    "edges": [
      {"from": "start", "to": "text_model"},
      {"from": "text_model", "to": "formatter"},
      {"from": "formatter", "to": "nano_banana"},
      {"from": "nano_banana", "to": "end"}
    ]
  },
  "status": "active",
  "is_public": false,
  "author_id": "user-123"
}'
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "text-to-image-optimized",
    "name": "文本优化图片生成工作流",
    "description": "使用文本模型生成描述，通过 formatter 优化提示词，然后生成高质量图片",
    "schema": { ... },
    "status": "active",
    "is_public": false,
    "author_id": "user-123",
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

### 3. 执行 Smartflow

```bash
curl -X POST http://localhost:3000/api/v1/smartflows/text-to-image-optimized/execute \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "input": [
      {
        "content": "一只可爱的小猫坐在窗台上",
        "type": "text",
        "name": "topic"
      },
      {
        "content": "温馨、自然光",
        "type": "text",
        "name": "style"
      }
    ]
  }'
```

**响应示例**（保存返回的 `id`，用于后续查询）：
```json
{
  "success": true,
  "data": {
    "id": "execution-123456",
    "status": "running",
    ...
  }
}
```

### 4. 轮询执行状态（可选）

```bash
# 替换 <execution_id> 为步骤 3 返回的 id
EXECUTION_ID="execution-123456"

# 获取执行状态
curl http://localhost:3000/api/v1/smartflow-tasks/$EXECUTION_ID \
  -H "Authorization: Bearer <your_token>"

# 持续轮询直到 status 为 "completed" 或 "failed"
# 可以使用循环脚本：
while true; do
  STATUS=$(curl -s http://localhost:3000/api/v1/smartflow-tasks/$EXECUTION_ID \
    -H "Authorization: Bearer <your_token>" | jq -r '.data.status')
  echo "Status: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done
```

### 5. 查看最终结果（执行完成后）

执行完成后，再次查询执行详情，查看 `output_data` 字段：

```bash
curl http://localhost:3000/api/v1/smartflow-tasks/$EXECUTION_ID \
  -H "Authorization: Bearer <your_token>" | jq '.data.output_data'
```

**输出示例**：
```json
{
  "result": [
    "https://example.com/generated-image-123456.jpg"
  ]
}
```

## 节点配置说明

### text_model 节点

- **model_type**: `text` - 文本生成模型
- **model**: `gpt-5-nano` - 快速文本模型
- **prompt**: 使用 `{{input.topic}}` 和 `{{input.style}}` 引用用户输入

### formatter 节点

- **template**: `nano-banana-photo-prompt` - 使用数据库中的模板
- **format_prompt**: 额外的格式化指令
- **reference_nodes**: `["text_model"]` - 引用 text_model 节点的输出
- **output_format**: `prompt` - 输出格式为提示词
- **formatter_model**: `gpt-5-nano` - 用于格式化的模型

### nano_banana 节点

- **model_type**: `image` - 图片生成模型
- **model**: `nano-banana` - Nano Banana 图片生成模型
- **prompt**: `{{formatter.formatted}}` - 使用 formatter 节点的格式化输出
- **aspect_ratio**: `16:9` - 图片宽高比（可选）
- **image_size**: `2K` - 图片尺寸（可选，1K/2K/4K）

### end 节点

- **output_mapping**: 将 `nano_banana.image_urls` 映射到最终输出 `result`
- **validate_outputs**: `true` - 验证输出是否符合 start 节点的预期

## 注意事项

1. **模板必须存在**：确保 `nano-banana-photo-prompt` 模板已在数据库中
2. **认证 Token**：创建和执行 Smartflow 需要有效的认证 token
3. **异步执行**：图片生成是异步的，需要轮询查询状态
4. **变量引用**：确保变量引用路径正确（如 `{{formatter.output}}`）
5. **输出格式**：formatter 节点的输出格式会影响下游节点的使用

## 故障排除

### 错误：401 Unauthorized - Invalid authorization header format

**症状**：
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid authorization header format. Expected: \"Bearer <token>\"",
    "hint": "Make sure there is a space after \"Bearer\" and the spelling is correct."
  }
}
```

**常见原因**：
1. **拼写错误**：`Beaerer` 应该是 `Bearer`（注意拼写）
2. **缺少空格**：`Bearer<token>` 应该是 `Bearer <token>`（Bearer 后面必须有空格）
3. **Token 为空**：`Bearer ` 后面没有实际的 token

**解决方案**：
- ✅ 正确格式：`Authorization: Bearer <your_token>`
- ❌ 错误格式：`Authorization: Beaerer <token>`（拼写错误）
- ❌ 错误格式：`Authorization:Bearer <token>`（缺少空格）
- ❌ 错误格式：`Authorization: Bearer `（token 为空）

**检查步骤**：
1. 确认 Authorization 头部拼写正确（`Bearer`，不是 `Beaerer`）
2. 确认 `Bearer` 后面有一个空格
3. 确认 token 值不为空
4. 如果使用 Postman 或类似工具，检查头部是否被正确设置

### 错误：模板不存在

**解决方案**：
```bash
cd mxmdata
pnpm run init:prompt-templates
```

### 错误：变量引用失败

**检查**：
- 确保上游节点已成功执行
- 检查变量路径是否正确（如 `formatter.output` vs `formatter.formatted`）

### 错误：图片生成失败

**检查**：
- 确保 nano-banana 模型可用
- 检查 prompt 格式是否正确
- 查看 flow_chain 中 nano_banana 节点的错误信息
