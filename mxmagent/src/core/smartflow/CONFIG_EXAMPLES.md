# Smartflow JSON 配置示例

## 设计原则
- ✅ 使用 JSON 而非 YAML（避免缩进错误）
- ✅ 扁平化配置（减少嵌套）
- ✅ 自动推断（减少配置量）
- ✅ 友好错误提示

---

## 一、最简单的配置

### 示例 1：单步 LLM 工作流
```json
{
  "id": "simple_chat",
  "name": "简单对话",
  "schema": {
    "nodes": [
      { "id": "start", "type": "start" },
      { "id": "llm", "type": "llm", "prompt": "{{input.user_input}}" },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "from": "start", "to": "llm" },
      { "from": "llm", "to": "end" }
    ]
  }
}
```

**关键点**：
- ✅ 只需要 3 个节点：start, llm, end
- ✅ 边使用简单的 `from/to`
- ✅ 变量引用：`{{input.user_input}}`

---

## 二、多步骤工作流

### 示例 2：理解 -> 处理 -> 回复
```json
{
  "id": "three_step",
  "name": "三步工作流",
  "schema": {
    "nodes": [
      { "id": "start", "type": "start" },
      {
        "id": "understand",
        "type": "llm",
        "name": "理解用户意图",
        "prompt": "分析用户输入：{{input.user_input}}"
      },
      {
        "id": "process",
        "type": "llm",
        "name": "处理信息",
        "prompt": "基于理解结果生成方案：{{understand.response}}"
      },
      {
        "id": "respond",
        "type": "llm",
        "name": "生成回复",
        "prompt": "生成友好回复：用户说{{input.user_input}}，理解是{{understand.response}}，方案是{{process.response}}"
      },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "from": "start", "to": "understand" },
      { "from": "understand", "to": "process" },
      { "from": "process", "to": "respond" },
      { "from": "respond", "to": "end" }
    ]
  }
}
```

**关键点**：
- ✅ 变量自动推断：`{{understand.response}}` 自动获取 understand 节点的输出
- ✅ 可以引用多个节点：`{{understand.response}}` 和 `{{process.response}}`
- ✅ 可以引用输入：`{{input.user_input}}`

---

## 三、带工具的工作流

### 示例 3：图像生成工作流
```json
{
  "id": "image_generation",
  "name": "图像生成",
  "schema": {
    "nodes": [
      { "id": "start", "type": "start" },
      {
        "id": "optimize",
        "type": "llm",
        "name": "优化提示词",
        "prompt": "将用户需求转换为专业图像提示词：{{input.user_input}}",
        "model": "gpt-5-nano"
      },
      {
        "id": "generate",
        "type": "tool",
        "name": "生成图像",
        "tool": "image_generation",
        "params": {
          "prompt": "{{optimize.response}}",
          "size": "1024x1024",
          "quality": "hd"
        }
      },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "from": "start", "to": "optimize" },
      { "from": "optimize", "to": "generate" },
      { "from": "generate", "to": "end" }
    ]
  }
}
```

**关键点**：
- ✅ Tool 节点使用 `tool` 和 `params`
- ✅ `params` 中可以引用其他节点的输出
- ✅ 工具参数直接配置，不需要嵌套

---

## 四、带条件的工作流

### 示例 4：条件分支
```json
{
  "id": "conditional_flow",
  "name": "条件工作流",
  "schema": {
    "nodes": [
      { "id": "start", "type": "start" },
      {
        "id": "check",
        "type": "condition",
        "name": "检查条件",
        "if": "{{input.type}} === 'image'",
        "then": "generate_image",
        "else": "generate_text"
      },
      {
        "id": "generate_image",
        "type": "tool",
        "tool": "image_generation",
        "params": { "prompt": "{{input.prompt}}" }
      },
      {
        "id": "generate_text",
        "type": "llm",
        "prompt": "{{input.prompt}}"
      },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "from": "start", "to": "check" },
      { "from": "check", "to": "generate_image" },
      { "from": "check", "to": "generate_text" },
      { "from": "generate_image", "to": "end" },
      { "from": "generate_text", "to": "end" }
    ]
  }
}
```

**关键点**：
- ✅ 条件节点使用 `if/then/else`
- ✅ 条件表达式：`{{input.type}} === 'image'`
- ✅ 根据条件执行不同分支

---

## 五、变量节点

### 示例 5：变量处理和格式化
```json
{
  "id": "variable_example",
  "name": "变量处理",
  "schema": {
    "nodes": [
      { "id": "start", "type": "start" },
      {
        "id": "llm1",
        "type": "llm",
        "prompt": "分析：{{input.text}}"
      },
      {
        "id": "format",
        "type": "variable",
        "name": "格式化",
        "set": {
          "formatted": "优化后的内容：{{llm1.response}}",
          "summary": "{{llm1.response}}"
        }
      },
      {
        "id": "llm2",
        "type": "llm",
        "prompt": "{{format.formatted}}"
      },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "from": "start", "to": "llm1" },
      { "from": "llm1", "to": "format" },
      { "from": "format", "to": "llm2" },
      { "from": "llm2", "to": "end" }
    ]
  }
}
```

---

## 六、完整配置示例（包含所有可选字段）

```json
{
  "id": "complete_example",
  "name": "完整示例",
  "description": "这是一个完整的工作流示例",
  "category": "multimodal",
  "tags": ["image", "generation"],
  "schema": {
    "version": "1.0.0",
    "nodes": [
      { "id": "start", "type": "start" },
      {
        "id": "llm1",
        "type": "llm",
        "name": "理解需求",
        "prompt": "分析：{{input.user_input}}",
        "model": "gpt-5-nano",
        "temperature": 0.7,
        "max_tokens": 500
      },
      {
        "id": "tool1",
        "type": "tool",
        "name": "生成图像",
        "tool": "image_generation",
        "params": {
          "prompt": "{{llm1.response}}",
          "size": "1024x1024"
        }
      },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "from": "start", "to": "llm1" },
      { "from": "llm1", "to": "tool1" },
      { "from": "tool1", "to": "end" }
    ],
    "variables": {
      "user_input": ""
    },
    "settings": {
      "timeout": 300,
      "retry_count": 3,
      "error_handling": "stop"
    }
  }
}
```

---

## 七、变量引用规则

### 输入变量
```json
"{{input.user_input}}"        // 从输入数据获取
"{{input.text}}"              // 从输入数据获取
```

### 节点输出（自动推断）
```json
"{{llm1.response}}"           // LLM 节点默认输出 response
"{{tool1.image_url}}"         // Tool 节点根据工具类型输出不同字段
"{{check.result}}"            // Condition 节点输出 result
```

### 简化引用（如果节点只有一个输出）
```json
"{{llm1}}"                    // 等同于 {{llm1.response}}
"{{format}}"                  // 等同于 {{format.formatted}}（如果只有一个输出）
```

---

## 八、常见错误和修复

### 错误 1：缺少必需字段
```json
// ❌ 错误
{
  "id": "llm1",
  "type": "llm"
  // 缺少 prompt
}
```

**错误提示**：
```
❌ 配置错误：LLM 节点 "llm1" 缺少必需字段 "prompt"
💡 修复建议：添加 prompt 字段
📝 示例：{ "id": "llm1", "type": "llm", "prompt": "你的提示词" }
```

### 错误 2：变量引用不存在
```json
// ❌ 错误
{
  "prompt": "{{unknown_node.response}}"
}
```

**错误提示**：
```
❌ 变量引用错误：节点 "unknown_node" 不存在
💡 可用节点：start, llm1, end
💡 修复建议：检查节点 ID 是否正确
```

### 错误 3：边连接错误
```json
// ❌ 错误
{
  "edges": [
    { "from": "nonexistent", "to": "llm1" }
  ]
}
```

**错误提示**：
```
❌ 边连接错误：源节点 "nonexistent" 不存在
💡 可用节点：start, llm1, end
💡 修复建议：检查节点 ID 是否正确
```

---

## 九、配置验证清单

在保存工作流前，系统会自动验证：

- ✅ 是否有 start 节点
- ✅ 是否有 end 节点
- ✅ 所有节点 ID 是否唯一
- ✅ 所有边连接的节点是否存在
- ✅ LLM 节点是否有 prompt
- ✅ Tool 节点是否有 tool 和 params
- ✅ Condition 节点是否有 if/then/else
- ✅ 变量引用是否存在

---

## 十、最佳实践

1. **节点命名**：使用有意义的 ID，如 `understand` 而非 `node1`
2. **变量引用**：优先使用 `{{node_id.response}}` 而非 `{{node_id}}`
3. **配置顺序**：先定义节点，再定义边
4. **测试配置**：保存前先验证，确保没有错误
5. **版本控制**：使用有意义的版本号，如 `1.0.0`

---

**这些示例展示了如何用简单的 JSON 配置复杂的工作流，避免了 YAML 的复杂性。**
