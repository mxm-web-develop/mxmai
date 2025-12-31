# Smartflow 简化设计方案
## 基于 JSON 配置，简单易用，避免 Dify.ai YAML 的复杂性

---

## 一、设计原则

### 核心原则
1. **简单优先**：配置尽可能简单，减少嵌套和复杂度
2. **JSON 格式**：使用 JSON 而非 YAML，避免缩进错误
3. **友好错误**：清晰的错误提示，告诉用户哪里错了，如何修复
4. **渐进式复杂度**：基础功能简单，高级功能可选
5. **向后兼容**：配置格式稳定，易于迁移

---

## 二、简化的 JSON 配置格式

### 2.1 最小化配置示例

```json
{
  "id": "testflow",
  "name": "测试工作流",
  "nodes": [
    {
      "id": "start",
      "type": "start"
    },
    {
      "id": "llm1",
      "type": "llm",
      "prompt": "请分析：{{input.user_input}}",
      "model": "gpt-5-nano"
    },
    {
      "id": "end",
      "type": "end"
    }
  ],
  "edges": [
    { "from": "start", "to": "llm1" },
    { "from": "llm1", "to": "end" }
  ]
}
```

**关键简化**：
- ✅ 不需要 `position`（可视化时才需要）
- ✅ 不需要 `inputs/outputs`（自动推断）
- ✅ 不需要复杂的 `config` 嵌套
- ✅ 边使用简单的 `from/to` 而非 `source/target`

---

### 2.2 完整配置示例（但保持简单）

```json
{
  "id": "image_generation",
  "name": "图像生成工作流",
  "description": "理解需求 -> 优化提示词 -> 生成图像",
  "nodes": [
    {
      "id": "start",
      "type": "start"
    },
    {
      "id": "understand",
      "type": "llm",
      "name": "理解用户意图",
      "prompt": "分析用户需求：{{input.user_input}}",
      "model": "gpt-5-nano",
      "temperature": 0.7
    },
    {
      "id": "optimize",
      "type": "llm",
      "name": "优化提示词",
      "prompt": "将需求转换为图像提示词：{{understand.response}}",
      "model": "gpt-5-nano"
    },
    {
      "id": "generate",
      "type": "tool",
      "name": "生成图像",
      "tool": "image_generation",
      "params": {
        "prompt": "{{optimize.response}}",
        "size": "1024x1024"
      }
    },
    {
      "id": "end",
      "type": "end"
    }
  ],
  "edges": [
    { "from": "start", "to": "understand" },
    { "from": "understand", "to": "optimize" },
    { "from": "optimize", "to": "generate" },
    { "from": "generate", "to": "end" }
  ]
}
```

---

## 三、关键简化设计

### 3.1 变量引用简化

#### 简单规则
```json
// 输入变量
"{{input.user_input}}"           // 从输入数据获取

// 节点输出（自动推断）
"{{understand.response}}"        // 从 understand 节点的 response 输出获取
"{{optimize.response}}"          // 从 optimize 节点的 response 输出获取

// 如果节点只有一个输出，可以省略字段名
"{{understand}}"                 // 等同于 {{understand.response}}
```

#### 自动推断规则
- **LLM 节点**：默认输出 `response`（字符串）
- **Tool 节点**：根据工具类型自动推断输出字段
- **条件节点**：输出 `result`（布尔值）

**优点**：
- ✅ 减少配置量
- ✅ 降低出错概率
- ✅ 更直观

---

### 3.2 节点配置简化

#### LLM 节点（最常用）
```json
{
  "id": "llm1",
  "type": "llm",
  "prompt": "请分析：{{input.user_input}}",  // 直接配置，不需要嵌套
  "model": "gpt-5-nano",                      // 可选，有默认值
  "temperature": 0.7                          // 可选
}
```

**简化点**：
- ✅ `prompt` 直接在节点级别，不需要 `config.prompt`
- ✅ 常用参数直接配置，不常用参数放在 `options` 中

#### Tool 节点
```json
{
  "id": "tool1",
  "type": "tool",
  "tool": "image_generation",                 // 工具名称
  "params": {                                  // 工具参数
    "prompt": "{{optimize.response}}",
    "size": "1024x1024"
  }
}
```

**简化点**：
- ✅ `tool` 直接配置，不需要 `config.tool_name`
- ✅ `params` 直接配置，不需要 `config.tool_params`

#### 条件节点（简化版）
```json
{
  "id": "check",
  "type": "condition",
  "if": "{{generate.image_url}}",             // 简单条件：存在且为真
  "then": "node_a",                            // 条件为真时执行
  "else": "node_b"                             // 条件为假时执行
}
```

**简化点**：
- ✅ 简单条件使用 `if/then/else`，不需要复杂的 `conditions` 数组
- ✅ 复杂条件可以后续扩展

---

### 3.3 边（连接）简化

#### 简单边
```json
{
  "edges": [
    { "from": "start", "to": "llm1" },         // 最简单的形式
    { "from": "llm1", "to": "end" }
  ]
}
```

#### 条件边（可选）
```json
{
  "edges": [
    { 
      "from": "check", 
      "to": "node_a",
      "when": "{{check.result}} === true"     // 条件表达式（可选）
    }
  ]
}
```

**简化点**：
- ✅ 使用 `from/to` 而非 `source/target`
- ✅ 条件使用 `when` 而非 `condition`
- ✅ 大部分情况下不需要条件，保持简单

---

## 四、错误处理和验证

### 4.1 友好的错误提示

#### 配置验证错误示例
```json
// 错误配置
{
  "nodes": [
    {
      "id": "llm1",
      "type": "llm"
      // 缺少 prompt
    }
  ]
}
```

**错误提示**：
```
❌ 配置错误：节点 "llm1" 缺少必需字段 "prompt"
💡 修复建议：LLM 节点必须包含 prompt 字段
   示例：{ "id": "llm1", "type": "llm", "prompt": "你的提示词" }
```

#### 变量引用错误
```json
{
  "prompt": "{{unknown_node.response}}"
}
```

**错误提示**：
```
❌ 变量引用错误：节点 "unknown_node" 不存在
💡 可用节点：start, llm1, end
💡 修复建议：检查节点 ID 是否正确，或先创建该节点
```

#### 边连接错误
```json
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

### 4.2 验证时机

#### 保存时验证（基础验证）
- ✅ 必需字段检查
- ✅ 节点 ID 唯一性
- ✅ 边连接的节点是否存在
- ✅ 是否有 start 和 end 节点

#### 执行时验证（完整验证）
- ✅ 变量引用是否存在
- ✅ 数据类型是否匹配
- ✅ 工具参数是否正确

---

## 五、节点类型简化设计

### 5.1 核心节点（必须支持）

#### 1. start - 开始节点
```json
{
  "id": "start",
  "type": "start"
}
```
**最简配置**：只需要 id 和 type

#### 2. llm - LLM 节点
```json
{
  "id": "llm1",
  "type": "llm",
  "prompt": "请分析：{{input.user_input}}",
  "model": "gpt-5-nano"  // 可选，有默认值
}
```
**必需字段**：id, type, prompt
**可选字段**：model, temperature, max_tokens

#### 3. tool - 工具节点
```json
{
  "id": "tool1",
  "type": "tool",
  "tool": "image_generation",
  "params": {
    "prompt": "{{llm1.response}}"
  }
}
```
**必需字段**：id, type, tool, params

#### 4. end - 结束节点
```json
{
  "id": "end",
  "type": "end"
}
```
**最简配置**：只需要 id 和 type

---

### 5.2 扩展节点（可选，后续添加）

#### condition - 条件节点（简化版）
```json
{
  "id": "check",
  "type": "condition",
  "if": "{{tool1.image_url}}",
  "then": "node_a",
  "else": "node_b"
}
```

#### variable - 变量节点（简化版）
```json
{
  "id": "var1",
  "type": "variable",
  "set": {
    "formatted_prompt": "优化后的提示词：{{llm1.response}}"
  }
}
```

---

## 六、配置示例对比

### Dify.ai YAML（复杂，易错）
```yaml
nodes:
  - id: llm1
    type: llm
    data:
      title: LLM节点
      type: llm
      model:
        provider: openai
        name: gpt-4
      prompt_template:
        - variable: user_input
          type: string
        - text: |
            请分析：{{#user_input#}}
      temperature: 0.7
      context:
        enabled: false
    position:
      x: 100
      y: 100
```

**问题**：
- ❌ 缩进敏感，容易出错
- ❌ 嵌套深，配置复杂
- ❌ 错误提示不友好

---

### 我们的 JSON（简单，友好）
```json
{
  "id": "llm1",
  "type": "llm",
  "prompt": "请分析：{{input.user_input}}",
  "model": "gpt-5-nano",
  "temperature": 0.7
}
```

**优点**：
- ✅ 扁平结构，易于理解
- ✅ 必需字段少
- ✅ 错误提示清晰

---

## 七、配置验证和错误处理

### 7.1 验证规则（简单明确）

#### 必需字段检查
```typescript
// LLM 节点必需字段
const requiredFields = {
  llm: ['id', 'type', 'prompt'],
  tool: ['id', 'type', 'tool', 'params'],
  condition: ['id', 'type', 'if', 'then', 'else']
};
```

#### 变量引用检查
```typescript
// 检查变量引用是否存在
function validateVariableReference(ref: string, availableNodes: string[]): boolean {
  // {{input.xxx}} - 总是有效
  // {{node_id.xxx}} - 检查 node_id 是否存在
  // {{node_id}} - 检查 node_id 是否存在
}
```

#### 边连接检查
```typescript
// 检查边的连接是否有效
function validateEdge(edge: Edge, nodeIds: string[]): boolean {
  return nodeIds.includes(edge.from) && nodeIds.includes(edge.to);
}
```

---

### 7.2 友好的错误消息

#### 错误消息格式
```
❌ [错误类型]：[具体错误]
💡 [修复建议]
📝 [示例代码]
```

#### 示例
```
❌ 配置错误：节点 "llm1" 缺少必需字段 "prompt"
💡 LLM 节点必须包含 prompt 字段来定义提示词
📝 示例：
   {
     "id": "llm1",
     "type": "llm",
     "prompt": "你的提示词内容"
   }
```

---

## 八、渐进式复杂度

### Level 1: 基础工作流（最简单）
```json
{
  "id": "simple",
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "llm1", "type": "llm", "prompt": "{{input.text}}" },
    { "id": "end", "type": "end" }
  ],
  "edges": [
    { "from": "start", "to": "llm1" },
    { "from": "llm1", "to": "end" }
  ]
}
```

### Level 2: 多步骤工作流
```json
{
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "step1", "type": "llm", "prompt": "..." },
    { "id": "step2", "type": "llm", "prompt": "{{step1.response}}" },
    { "id": "end", "type": "end" }
  ],
  "edges": [
    { "from": "start", "to": "step1" },
    { "from": "step1", "to": "step2" },
    { "from": "step2", "to": "end" }
  ]
}
```

### Level 3: 带工具的工作流
```json
{
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "llm1", "type": "llm", "prompt": "..." },
    { "id": "tool1", "type": "tool", "tool": "image_generation", "params": {...} },
    { "id": "end", "type": "end" }
  ]
}
```

### Level 4: 带条件的工作流（高级）
```json
{
  "nodes": [
    { "id": "check", "type": "condition", "if": "...", "then": "...", "else": "..." }
  ]
}
```

---

## 九、配置模板和示例

### 9.1 内置模板

#### 模板 1：简单对话
```json
{
  "id": "simple_chat",
  "name": "简单对话",
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
```

#### 模板 2：图像生成
```json
{
  "id": "image_generation",
  "name": "图像生成",
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "optimize", "type": "llm", "prompt": "优化提示词：{{input.user_input}}" },
    { "id": "generate", "type": "tool", "tool": "image_generation", "params": { "prompt": "{{optimize.response}}" } },
    { "id": "end", "type": "end" }
  ],
  "edges": [
    { "from": "start", "to": "optimize" },
    { "from": "optimize", "to": "generate" },
    { "from": "generate", "to": "end" }
  ]
}
```

---

## 十、关键设计决策

### ✅ 已确认的设计

1. **使用 JSON 而非 YAML**
   - ✅ 避免缩进错误
   - ✅ 更好的工具支持
   - ✅ 更清晰的错误提示

2. **扁平化配置**
   - ✅ 减少嵌套层级
   - ✅ 常用字段直接配置
   - ✅ 可选字段放在 `options` 中

3. **自动推断**
   - ✅ 节点输出自动推断
   - ✅ 变量引用简化
   - ✅ 减少配置量

4. **友好的错误提示**
   - ✅ 清晰的错误消息
   - ✅ 修复建议
   - ✅ 示例代码

5. **渐进式复杂度**
   - ✅ 基础功能简单
   - ✅ 高级功能可选
   - ✅ 逐步学习

---

## 十一、待讨论的问题

1. **变量引用语法**
   - 当前：`{{node_id.response}}` 或 `{{node_id}}`
   - 是否需要支持：`{{node_id.output_field}}`？

2. **条件节点复杂度**
   - 简单版：`if/then/else`
   - 是否需要支持：多条件、复杂表达式？

3. **工具参数配置**
   - 当前：`params` 对象
   - 是否需要支持：参数模板、动态参数？

4. **错误处理策略**
   - 默认：停止执行
   - 是否需要支持：继续执行、重试、回退？

5. **配置验证时机**
   - 保存时：基础验证
   - 执行时：完整验证
   - 是否需要：实时验证（编辑时）？

---

## 十二、下一步

1. **确认配置格式**：讨论并确认最终的 JSON 配置格式
2. **设计验证器**：实现友好的配置验证和错误提示
3. **实现解析器**：将 JSON 配置转换为 LangGraph 工作流
4. **创建示例**：提供多个配置示例供参考

---

**请讨论以上设计，特别是待讨论的问题，确认后开始实现。**
