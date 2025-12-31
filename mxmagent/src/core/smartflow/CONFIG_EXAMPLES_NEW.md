# Smartflow JSON 配置示例（新设计）

## 设计原则
- ✅ 使用 JSON 而非 YAML（避免缩进错误）
- ✅ 扁平化配置（减少嵌套）
- ✅ 自动推断（减少配置量）
- ✅ 友好错误提示
- ✅ 专注于输出（text, image, video, sound, embedding）

---

## 一、节点类型概览

### 节点类型
1. **start** - 开始节点（设置全局参数、触发词、预期输出）
2. **model** - 模型节点（替代 llm，支持 text/image/video/sound/embedding）
3. **tools** - 工具节点（统一执行器，支持内置和用户自定义工具）
4. **formatter** - 格式化节点（Prompt 模板 + 格式转换，基于 text 模型）
5. **recall** - 召回节点（从知识库召回内容）
6. **condition** - 条件节点（支持 if/else if/else）
7. **end** - 结束节点（验证输出，支持多资源输出）

---

## 二、配置示例

### 示例 1：简单文本生成工作流

```json
{
  "id": "simple_text",
  "name": "简单文本生成",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
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
  }
}
```

---

### 示例 2：图像生成工作流（使用 formatter 优化 prompt）

```json
{
  "id": "image_with_formatter",
  "name": "图像生成并格式化",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "input": [
          {
            "content": "生成一张日系风格的写真照片",
            "type": "text",
            "name": "user_input"
          },
          {
            "content": "日系风格",
            "type": "text",
            "name": "style"
          }
        ],
        "expected_outputs": [
          { "type": "text", "name": "description", "required": true },
          { "type": "image", "name": "image", "required": true }
        ],
        "smartflow_name": "日系写真生成工作流"
      },
      {
        "id": "text_gen",
        "type": "model",
        "name": "理解需求",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "分析用户需求：{{input.user_input}}"
      },
      {
        "id": "format_prompt",
        "type": "formatter",
        "name": "优化提示词",
        "template": "nano-banana-photo-prompt",
        "format_prompt": "将需求转换为专业摄影提示词",
        "reference_nodes": ["text_gen"],
        "output_format": "prompt"
      },
      {
        "id": "image_gen",
        "type": "model",
        "name": "生成图像",
        "model_type": "image",
        "model": "nano-banana",
        "prompt": "{{format_prompt.formatted}}"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "description": "{{text_gen.response}}",
          "image": "{{image_gen.image_urls}}"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "text_gen" },
      { "from": "text_gen", "to": "format_prompt" },
      { "from": "format_prompt", "to": "image_gen" },
      { "from": "image_gen", "to": "end" }
    ]
  }
}
```

---

### 示例 3：带知识库召回的工作流

```json
{
  "id": "recall_workflow",
  "name": "知识库召回工作流",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "expected_outputs": [
          { "type": "text", "name": "answer", "required": true }
        ]
      },
      {
        "id": "recall",
        "type": "recall",
        "name": "召回相关知识",
        "knowledge_base": "general",
        "query": "{{input.user_input}}",
        "recall_params": {
          "top_k": 5,
          "search_type": "hybrid"
        }
      },
      {
        "id": "answer_gen",
        "type": "model",
        "name": "生成回答",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "基于以下知识回答问题：\n{{recall.results}}\n\n问题：{{input.user_input}}"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "answer": "{{answer_gen.response}}"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "recall" },
      { "from": "recall", "to": "answer_gen" },
      { "from": "answer_gen", "to": "end" }
    ]
  }
}
```

---

### 示例 4：带条件分支的工作流

```json
{
  "id": "conditional_workflow",
  "name": "条件分支工作流",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "expected_outputs": [
          { "type": "text", "name": "result", "required": true }
        ]
      },
      {
        "id": "check_type",
        "type": "condition",
        "name": "检查类型",
        "if": "{{input.type}} === 'image'",
        "then": "image_gen",
        "else_if": [
          {
            "condition": "{{input.type}} === 'video'",
            "then": "video_gen"
          },
          {
            "condition": "{{input.type}} === 'text'",
            "then": "text_gen"
          }
        ],
        "else": "default_gen"
      },
      {
        "id": "image_gen",
        "type": "model",
        "model_type": "image",
        "model": "nano-banana",
        "prompt": "{{input.prompt}}"
      },
      {
        "id": "text_gen",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "{{input.prompt}}"
      },
      {
        "id": "default_gen",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "默认处理：{{input.prompt}}"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "result": "{{check_type.result}}"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "check_type" },
      { "from": "check_type", "to": "image_gen" },
      { "from": "check_type", "to": "text_gen" },
      { "from": "check_type", "to": "default_gen" },
      { "from": "image_gen", "to": "end" },
      { "from": "text_gen", "to": "end" },
      { "from": "default_gen", "to": "end" }
    ]
  }
}
```

---

### 示例 5：使用工具的工作流

```json
{
  "id": "tool_workflow",
  "name": "工具工作流",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "expected_outputs": [
          { "type": "text", "name": "summary", "required": true }
        ]
      },
      {
        "id": "web_search",
        "type": "tools",
        "name": "网络搜索",
        "tool_type": "web_search",
        "tool_params": {
          "query": "{{input.topic}}",
          "max_results": 5
        }
      },
      {
        "id": "format_summary",
        "type": "formatter",
        "name": "格式化摘要",
        "format_prompt": "将搜索结果总结为简洁摘要",
        "reference_nodes": ["web_search"],
        "output_format": "text"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "summary": "{{format_summary.formatted}}"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "web_search" },
      { "from": "web_search", "to": "format_summary" },
      { "from": "format_summary", "to": "end" }
    ]
  }
}
```

---

## 三、节点配置详解

### Start 节点

```json
{
  "id": "start",
  "type": "start",
  "input": [
    {
      "content": "用户输入的文本内容",
      "type": "text",
      "name": "user_input"
    },
    {
      "content": "https://example.com/image.jpg",
      "type": "image",
      "name": "reference_image"
    },
    {
      "content": "日系风格",
      "type": "text",
      "name": "style"
    }
  ],
  "trigger_words": ["生成", "创建"],
  "expected_outputs": [
    {
      "type": "text",
      "name": "description",
      "required": true
    },
    {
      "type": "image",
      "name": "image",
      "required": false
    }
  ],
  "smartflow_name": "工作流名称"
}
```

**输入类型说明**：
- `text`: 文本内容
- `file`: 文件（文件路径或文件对象）
- `image`: 图片（URL 或 base64）
- `video`: 视频（URL 或文件路径）
- `audio`: 音频（URL 或文件路径）
- `json`: JSON 数据
- `url`: URL 链接
- `other`: 其他类型

### Model 节点

```json
{
  "id": "model1",
  "type": "model",
  "name": "文本生成",
  "model_type": "text",
  "model": "gpt-5-nano",
  "prompt": "{{input.user_input}}",
  "params": {
    "temperature": 0.7,
    "max_tokens": 1000
  }
}
```

### Tools 节点

```json
{
  "id": "tool1",
  "type": "tools",
  "name": "网络搜索",
  "tool_type": "web_search",
  "tool_params": {
    "query": "{{input.query}}",
    "max_results": 5
  }
}
```

### Formatter 节点

```json
{
  "id": "formatter1",
  "type": "formatter",
  "name": "格式化输出",
  "template": "nano-banana-photo-prompt",
  "format_prompt": "将需求转换为专业提示词",
  "reference_nodes": ["model1"],
  "output_format": "prompt",
  "formatter_model": "gpt-5-nano"
}
```

### Recall 节点

```json
{
  "id": "recall1",
  "type": "recall",
  "name": "知识库召回",
  "knowledge_base": "general",
  "query": "{{input.user_input}}",
  "recall_params": {
    "top_k": 5,
    "similarity_threshold": 0.7,
    "search_type": "hybrid"
  }
}
```

### Condition 节点

```json
{
  "id": "condition1",
  "type": "condition",
  "name": "条件判断",
  "if": "{{model1.response}} === 'success'",
  "then": "node_a",
  "else_if": [
    {
      "condition": "{{model1.response}} === 'warning'",
      "then": "node_b"
    }
  ],
  "else": "node_c"
}
```

### End 节点

```json
{
  "id": "end",
  "type": "end",
  "output_mapping": {
    "description": "{{text_gen.response}}",
    "image": "{{image_gen.image_urls}}"
  },
  "nullable_outputs": ["preview_video"],
  "validate_outputs": true
}
```

---

## 四、变量引用规则

### 输入变量
```json
"{{input.user_input}}"        // 从输入数据获取
"{{input.text}}"              // 从输入数据获取
```

### 输入参数
```json
"{{input.user_input}}"        // 从 start 节点的 input 中按 name 获取
"{{input.style}}"             // 从 start 节点的 input 中按 name 获取
"{{input.text}}"              // 如果没有 name，按 type 获取（兼容旧格式）
```

### 节点输出（自动推断）
```json
"{{model1.response}}"         // Model 节点默认输出 response
"{{tool1.data}}"              // Tools 节点输出 data
"{{formatter1.formatted}}"    // Formatter 节点输出 formatted
"{{recall1.results}}"          // Recall 节点输出 results
```

---

## 五、最佳实践

1. **节点命名**：使用有意义的 ID，如 `understand` 而非 `node1`
2. **变量引用**：优先使用明确的字段名，如 `{{model1.response}}`
3. **配置顺序**：先定义节点，再定义边
4. **测试配置**：保存前先验证，确保没有错误
5. **输出验证**：在 end 节点启用输出验证，确保输出符合预期

---

**这些示例展示了如何使用新的节点类型构建复杂的工作流，专注于输出生成。**
