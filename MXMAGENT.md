# mxmagent - Smartflow 工作流引擎

## 一、定位与核心能力

`mxmagent` 是一个**专注于输出**的工作流引擎，用于编排和执行复杂的 AI 任务流程。与 Dify.ai 等通用工作流平台不同，`mxmagent` 专注于生成多种类型的输出（文本、图片、视频、音频、混合内容），并提供简洁、用户友好的 JSON 配置方式。

### 核心能力

- **Smartflow 定义与管理**：支持 JSON 格式的工作流定义，扁平化配置，用户友好
- **多类型输出支持**：支持 text、image、video、sound、embedding 等多种输出类型
- **任务执行与追踪**：每次执行 Smartflow 都会创建一个 Task（执行实例），记录完整执行链和每个节点的输出
- **节点类型丰富**：支持 start、model、tools、formatter、recall、condition、end 等 7 种节点类型（loop 节点正在设计中）
- **模型集成**：通过 Gateway 调用 `mxmcgi` 服务，支持所有 mxm 生态的模型
- **工具执行器**：统一的工具执行接口，支持内置工具和用户自定义工具
- **知识库召回**：支持从多个知识库召回内容，支持向量、关键词、混合检索

### 设计原则

1. **专注于输出**：不是另一个 Dify.ai 克隆，而是专注于生成高质量的输出内容
2. **JSON 配置**：使用 JSON 而非 YAML，避免缩进错误，更易维护
3. **用户友好**：扁平化配置，自动推断，减少配置量
4. **可扩展性**：支持用户自定义工具、知识库扩展、Prompt 模板等

---

## 二、数据模型

### 2.1 Smartflow 定义表

```sql
CREATE TABLE smartflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  schema JSONB NOT NULL,              -- Smartflow 的 JSON Schema（包含 nodes 和 edges）
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, draft
  author_id UUID,                    -- 创建者 ID
  is_public BOOLEAN DEFAULT false,   -- 是否公开
  tags TEXT[],
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 Smartflow 执行表（Task）

```sql
CREATE TABLE smartflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartflow_id UUID REFERENCES smartflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  conversation_id UUID,               -- 关联的对话 ID（可选）
  status VARCHAR(20) DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  input JSONB,                       -- 用户输入（从 start 节点的 input 处理而来）
  output JSONB,                      -- 最终输出（从 end 节点生成）
  flow_chain JSONB,                  -- 执行链，记录每个节点的执行情况
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.3 flow_chain 数据结构

`flow_chain` 是一个 JSONB 数组，记录每个节点的执行情况：

```json
[
  {
    "node_id": "start",
    "node_type": "start",
    "status": "completed",
    "output": { "input": {...}, "expected_outputs": [...] },
    "duration_ms": 5,
    "timestamp": "2025-12-12T08:00:00Z"
  },
  {
    "node_id": "model1",
    "node_type": "model",
    "status": "completed",
    "output": { "text": "生成的文本内容" },
    "duration_ms": 1234,
    "timestamp": "2025-12-12T08:00:01Z"
  }
]
```

---

## 三、节点类型详解

Smartflow 支持 **7 种节点类型**，用于构建完整的工作流：

| 节点类型 | 说明 | 必需 | 数量限制 |
|---------|------|------|---------|
| `start` | 开始节点，定义输入和预期输出 | ✅ 必需 | 每个工作流只能有 1 个 |
| `model` | 模型节点，调用 AI 模型生成内容 | - | 可多个 |
| `tools` | 工具节点，执行各种工具（搜索、爬虫等） | - | 可多个 |
| `formatter` | 格式化节点，应用 Prompt 模板和格式转换 | - | 可多个 |
| `recall` | 召回节点，从知识库检索内容 | - | 可多个 |
| `condition` | 条件节点，实现分支逻辑 | - | 可多个 |
| `loop` | 循环节点，对数组进行迭代处理 | - | 可多个（设计中） |
| `end` | 结束节点，验证并生成最终输出 | ✅ 必需 | 每个工作流只能有 1 个 |

### 3.1 Start 节点

开始节点，定义工作流的输入和预期输出。**每个 Smartflow 必须有且仅有一个 start 节点**。

**配置字段**：
- `id` (必需): 节点 ID，建议使用 `"start"`
- `type` (必需): 节点类型，固定为 `"start"`
- `input` (可选): 用户输入参数定义数组
  - 支持类型：`text`, `file`, `image`, `video`, `audio`, `json`, `url`
  - 每个输入项包含：`name`（参数名）、`type`（类型）、`description`（描述，可选）
- `trigger_words` (可选): 触发词列表，用于匹配用户意图
- `expected_outputs` (必需): 预期输出定义数组
  - 每个输出项包含：`type`（text/image/video/sound/embedding）、`name`（输出名称）、`required`（是否必需）
- `smartflow_name` (可选): Smartflow 链的名字

**功能**：
- 接收并处理用户输入
- 检查触发词（如果配置）
- 初始化执行上下文，设置 `expected_outputs`
- 为后续节点提供 `{{input.xxx}}` 变量

**配置示例**：
```json
{
  "id": "start",
  "type": "start",
  "input": [
    {
      "name": "topic",
      "type": "text",
      "description": "文章主题"
    },
    {
      "name": "style",
      "type": "text",
      "description": "写作风格"
    }
  ],
  "trigger_words": ["写文章", "生成文章"],
  "expected_outputs": [
    {
      "type": "text",
      "name": "result",
      "required": true
    }
  ],
  "smartflow_name": "文本生成工作流"
}
```

**输出格式**：
```json
{
  "input": {
    "topic": "用户输入的主题",
    "style": "用户输入的风格"
  },
  "expected_outputs": [
    { "type": "text", "name": "result", "required": true }
  ]
}
```

### 3.2 Model 节点

模型节点，调用 AI 模型生成内容。**可多个，支持串联或并联**。

**配置字段**：
- `id` (必需): 节点 ID，唯一标识
- `type` (必需): 节点类型，固定为 `"model"`
- `model_type` (必需): 模型类型
  - `text`: 文本生成（如 GPT、Claude）
  - `image`: 图片生成（如 DALL-E、Midjourney）
  - `video`: 视频生成（待实现）
  - `sound`: 音频生成（待实现）
  - `embedding`: 向量生成（用于语义搜索）
- `model` (必需): 具体模型名称（从 mxmcgi 支持的模型中选择）
  - 文本模型：`gpt-5-nano`, `gpt-4`, `claude-3`, 等
  - 图片模型：`dall-e-3`, `nano-banana`, `midjourney`, 等
  - 向量模型：`text-embedding-ada-002`, 等
- `prompt` (必需): 提示词，支持变量引用
  - `{{input.xxx}}`: 引用 start 节点的输入
  - `{{nodeId.field}}`: 引用上游节点的输出字段
- `params` (可选): 模型特定参数
  - 文本模型：`temperature`, `max_tokens`, `top_p`, 等
  - 图片模型：`aspect_ratio`, `quality`, `size`, 等
  - 向量模型：`dimensions`, 等

**功能**：
- 通过 Gateway 调用 `mxmcgi` 的相应 API
- 支持文本生成、图片生成、视频生成、音频生成、向量生成
- 自动处理 Gateway 响应格式
- 输出结果可供下游节点引用

**配置示例（文本生成）**：
```json
{
  "id": "model1",
  "type": "model",
  "model_type": "text",
  "model": "gpt-5-nano",
  "prompt": "生成一篇关于 {{input.topic}} 的文章，风格为 {{input.style}}",
  "params": {
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

**配置示例（图片生成）**：
```json
{
  "id": "image_gen",
  "type": "model",
  "model_type": "image",
  "model": "dall-e-3",
  "prompt": "{{formatter1.output}}",
  "params": {
    "aspect_ratio": "16:9",
    "quality": "hd"
  }
}
```

**输出格式**：
- 文本模型：`{ "text": "生成的文本内容" }`
- 图片模型：`{ "image": "base64编码", "image_url": "图片URL" }`
- 向量模型：`{ "embedding": [0.1, 0.2, ...] }`

### 3.3 Tools 节点

工具节点，统一的工具执行器。**可多个，用于执行各种外部工具**。

**配置字段**：
- `id` (必需): 节点 ID，唯一标识
- `type` (必需): 节点类型，固定为 `"tools"`
- `tool_type` (必需): 工具类型
  - `web_search`: 网络搜索（如 Google、Bing）
  - `web_scraper`: 网页爬虫，抓取网页内容
  - `http_request`: HTTP 请求，调用外部 API
  - `custom`: 用户自定义工具（需要代码沙箱，待实现）
- `tool_params` (必需): 工具参数（支持变量引用）
  - `web_search`: `{ "query": "搜索关键词", "max_results": 10 }`
  - `web_scraper`: `{ "url": "目标URL", "selectors": {...} }`
  - `http_request`: `{ "url": "API地址", "method": "GET/POST", "headers": {...}, "body": {...} }`
  - `custom`: `{ "code": "...", "language": "python/javascript" }`
- `custom_code` (可选): 用户自定义代码（仅当 `tool_type='custom'` 时使用）
- `custom_language` (可选): 代码语言（`python` 或 `javascript`）

**功能**：
- 执行内置工具（web_search, web_scraper, http_request）
- 执行用户自定义工具（需要代码沙箱，待实现）
- 统一的工具接口，确保输出格式一致
- 输出结果可供下游节点引用

**配置示例（网络搜索）**：
```json
{
  "id": "search1",
  "type": "tools",
  "tool_type": "web_search",
  "tool_params": {
    "query": "{{input.topic}} 最新资讯",
    "max_results": 5
  }
}
```

**配置示例（网页爬虫）**：
```json
{
  "id": "scraper1",
  "type": "tools",
  "tool_type": "web_scraper",
  "tool_params": {
    "url": "{{input.url}}",
    "selectors": {
      "title": "h1",
      "content": ".article-content"
    }
  }
}
```

**配置示例（HTTP 请求）**：
```json
{
  "id": "api_call",
  "type": "tools",
  "tool_type": "http_request",
  "tool_params": {
    "url": "https://api.example.com/data",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{input.token}}"
    },
    "body": {
      "query": "{{model1.text}}"
    }
  }
}
```

**输出格式**：
- `web_search`: `{ "results": [{ "title": "...", "url": "...", "snippet": "..." }] }`
- `web_scraper`: `{ "content": "...", "data": {...} }`
- `http_request`: `{ "status": 200, "data": {...} }`

### 3.4 Formatter 节点

格式化节点，用于 Prompt 模板应用和格式转换。**可多个，常用于优化 prompt 或转换数据格式**。

**配置字段**：
- `id` (必需): 节点 ID，唯一标识
- `type` (必需): 节点类型，固定为 `"formatter"`
- `template` (可选): Prompt 模板名称或自定义模板内容
  - 模板名称：如 `"nano-banana-photography"`（从模板库加载）
  - 自定义模板：直接提供模板字符串，支持变量引用
- `format_prompt` (可选): 格式化提示词，指导模型如何格式化内容
- `reference_nodes` (可选): 参考节点 ID 列表，指定要格式化的上游节点
- `output_format` (可选): 输出格式
  - `json`: JSON 格式
  - `text`: 纯文本
  - `markdown`: Markdown 格式
  - `html`: HTML 格式
  - `prompt`: 优化后的 prompt（常用于图片生成）
- `formatter_model` (可选): 使用的模型，默认使用快速模型如 `gpt-5-nano`

**功能**：
- 应用 Prompt 模板（如 nano-banana 摄影生图 prompt）
- 将上游节点的数据转换为指定格式
- 使用文本模型进行内容改写和格式化
- 优化 prompt 质量，提高生成效果

**配置示例（应用模板）**：
```json
{
  "id": "formatter1",
  "type": "formatter",
  "template": "nano-banana-photography",
  "reference_nodes": ["model1"],
  "output_format": "prompt",
  "formatter_model": "gpt-5-nano"
}
```

**配置示例（自定义格式化）**：
```json
{
  "id": "formatter1",
  "type": "formatter",
  "format_prompt": "将以下内容改写为专业的摄影 prompt，包含构图、光线、风格等细节：{{model1.text}}",
  "output_format": "text",
  "formatter_model": "gpt-5-nano"
}
```

**配置示例（数据转换）**：
```json
{
  "id": "formatter1",
  "type": "formatter",
  "format_prompt": "将以下数据转换为 JSON 格式：{{tools1.data}}",
  "output_format": "json",
  "formatter_model": "gpt-5-nano"
}
```

**输出格式**：
- `{ "output": "格式化后的内容" }`
- 根据 `output_format` 不同，内容格式会相应变化

### 3.5 Recall 节点

召回节点，从知识库召回内容。**可多个，用于从不同知识库检索信息**。

**配置字段**：
- `id` (必需): 节点 ID，唯一标识
- `type` (必需): 节点类型，固定为 `"recall"`
- `knowledge_base` (必需): 知识库名称
  - 内置知识库：如 `"general_kb"`, `"tech_kb"`
  - 用户自定义知识库：用户创建的知识库名称
- `query` (必需): 查询内容（支持变量引用）
  - 可以是文本查询：`"{{input.topic}}"`
  - 可以是向量查询：`{{model1.embedding}}`
- `recall_params` (可选): 检索参数
  - `top_k`: 返回最相关的 K 条结果（默认 5）
  - `similarity_threshold`: 相似度阈值（0-1，默认 0.7）
  - `search_type`: 检索类型
    - `vector`: 向量检索（语义搜索）
    - `keyword`: 关键词检索
    - `hybrid`: 混合检索（向量 + 关键词）

**功能**：
- 从内置或用户自定义知识库召回内容
- 支持向量检索、关键词检索、混合检索
- 返回相关文档片段
- 支持多知识库并行检索

**配置示例（向量检索）**：
```json
{
  "id": "recall1",
  "type": "recall",
  "knowledge_base": "tech_kb",
  "query": "{{input.question}}",
  "recall_params": {
    "top_k": 5,
    "similarity_threshold": 0.7,
    "search_type": "vector"
  }
}
```

**配置示例（混合检索）**：
```json
{
  "id": "recall1",
  "type": "recall",
  "knowledge_base": "general_kb",
  "query": "{{model1.text}}",
  "recall_params": {
    "top_k": 10,
    "search_type": "hybrid"
  }
}
```

**输出格式**：
```json
{
  "content": "检索到的文档内容",
  "count": 5,
  "results": [
    {
      "text": "文档片段1",
      "score": 0.95,
      "metadata": {...}
    },
    ...
  ]
}
```

### 3.6 Condition 节点

条件节点，支持复杂的分支逻辑。**可多个，用于实现工作流的分支和条件执行**。

**配置字段**：
- `id` (必需): 节点 ID，唯一标识
- `type` (必需): 节点类型，固定为 `"condition"`
- `if` (必需): if 条件表达式
  - 支持变量引用：`{{nodeId.field}}`
  - 支持比较运算符：`>`, `<`, `>=`, `<=`, `==`, `!=`
  - 支持逻辑运算符：`&&`, `||`, `!`
  - 示例：`"{{recall1.count}} > 0"`, `"{{model1.text.length}} > 100"`
- `then` (必需): 条件为真时的目标节点 ID
- `else_if` (可选): else if 条件数组（支持多个）
  - 每个元素包含：`condition`（条件表达式）和 `then`（目标节点 ID）
- `else` (可选): else 分支的目标节点 ID（当所有条件都不满足时）

**功能**：
- 评估条件表达式（支持变量引用）
- 根据条件结果路由到不同的节点
- 支持复杂的 if/else if/else 逻辑
- 实现动态工作流分支

**配置示例（简单 if/else）**：
```json
{
  "id": "condition1",
  "type": "condition",
  "if": "{{recall1.count}} > 0",
  "then": "model1",
  "else": "model2"
}
```

**配置示例（复杂 if/else if/else）**：
```json
{
  "id": "condition1",
  "type": "condition",
  "if": "{{input.score}} >= 90",
  "then": "model_excellent",
  "else_if": [
    {
      "condition": "{{input.score}} >= 70",
      "then": "model_good"
    },
    {
      "condition": "{{input.score}} >= 60",
      "then": "model_pass"
    }
  ],
  "else": "model_fail"
}
```

**配置示例（字符串判断）**：
```json
{
  "id": "condition1",
  "type": "condition",
  "if": "{{input.type}} == 'image'",
  "then": "image_model",
  "else": "text_model"
}
```

**输出格式**：
- 条件节点本身不产生内容输出，只负责路由
- 下游节点可以通过 `{{condition1.output}}` 引用条件判断的结果（true/false）

### 3.7 End 节点

结束节点，验证输出并生成最终结果。**每个 Smartflow 必须有且仅有一个 end 节点**。

**配置字段**：
- `id` (必需): 节点 ID，建议使用 `"end"`
- `type` (必需): 节点类型，固定为 `"end"`
- `output_mapping` (必需): 输出映射（将节点输出映射到最终输出）
  - 格式：`{ "输出名称": "节点ID.字段名" }`
  - 示例：`{ "result": "model1.text", "cover_image": "image_gen.image_url" }`
  - 支持变量引用：`{ "result": "{{model1.text}}" }`
- `nullable_outputs` (可选): 允许置空的输出名称列表
  - 如果某个输出在 `start` 节点的 `expected_outputs` 中标记为 `required: false`，可以在这里声明允许为空
  - 示例：`["optional_image", "optional_audio"]`
- `validate_outputs` (可选): 是否验证输出（默认 `true`）
  - `true`: 严格验证输出是否符合 `start` 节点的 `expected_outputs`
  - `false`: 不验证，直接输出（不推荐）

**功能**：
- 验证输出是否符合 `start` 节点的 `expected_outputs`
- 应用输出映射，生成最终输出
- 支持多个资源输出，某些输出可以为空
- 生成最终的 Task 输出结果

**配置示例（单输出）**：
```json
{
  "id": "end",
  "type": "end",
  "output_mapping": {
    "result": "model1.text"
  },
  "validate_outputs": true
}
```

**配置示例（多输出）**：
```json
{
  "id": "end",
  "type": "end",
  "output_mapping": {
    "article": "model1.text",
    "cover_image": "image_gen.image_url",
    "summary": "formatter1.output"
  },
  "nullable_outputs": ["cover_image"],
  "validate_outputs": true
}
```

**配置示例（条件输出）**：
```json
{
  "id": "end",
  "type": "end",
  "output_mapping": {
    "result": "{{condition1.output}}"
  }
}
```

**输出格式**：
最终输出会写入 Task 的 `output` 字段，格式如下：
```json
{
  "result": "最终输出的文本内容",
  "cover_image": "https://example.com/image.jpg",
  "summary": "摘要内容"
}
```

**验证规则**：
1. 检查所有 `required: true` 的输出是否都存在
2. 检查输出类型是否匹配（text/image/video/sound/embedding）
3. 如果验证失败，Task 状态会变为 `failed`

---

## 四、变量系统

Smartflow 支持变量引用，使用 `{{scope.field}}` 语法：

- `{{input.xxx}}`: 引用用户输入（从 start 节点的 input 获取）
- `{{nodeId.field}}`: 引用上游节点的输出

**示例**：
```json
{
  "prompt": "生成关于 {{input.topic}} 的文章，参考 {{recall1.content}}"
}
```

**变量引用规则**：
- 文本模型输出：`{{nodeId.text}}`
- 图片模型输出：`{{nodeId.image_urls}}` 或 `{{nodeId.mediaUrls}}`
- Formatter 输出：`{{nodeId.formatted}}`（格式化后的内容）或 `{{nodeId.original}}`（原始数据）

**完整示例**：参考 `SMARTFLOW_EXAMPLE_IMAGE_GENERATION.md`，包含文本模型 → formatter → 图片生成的完整工作流。

---

## 五、API 接口

### 基础路径

- **直接访问**: `http://localhost:4004/api/v1`
- **通过 Gateway**: `http://localhost:3000/api/v1`（推荐，需要认证）

### Smartflow 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/smartflows` | 获取 Smartflow 列表 | ❌ |
| GET | `/smartflows/:id` | 获取单个 Smartflow | ❌ |
| POST | `/smartflows` | 创建 Smartflow | ✅ |
| PUT | `/smartflows/:id` | 更新 Smartflow | ✅ |
| DELETE | `/smartflows/:id` | 删除 Smartflow | ✅ |
| POST | `/smartflows/:id/execute` | 执行 Smartflow | ✅ |

### Task 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/smartflow-tasks` | 获取 Task 列表 | ✅ |
| GET | `/smartflow-tasks/:id` | 获取单个 Task 详情 | ✅ |

**注意**：通过 Gateway 访问时，Task 接口使用 `/api/v1/smartflow-tasks`，避免与 `mxmnotify` 的 `/api/v1/tasks` 冲突。

### Prompt 模板接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/prompt-templates` | 获取模板列表 | ❌ |
| GET | `/prompt-templates/:id` | 获取单个模板详情 | ❌ |
| GET | `/prompt-templates/name/:name` | 根据名称获取模板 | ❌ |
| POST | `/prompt-templates` | 创建模板 | ✅ |
| PUT | `/prompt-templates/:id` | 更新模板 | ✅ |
| DELETE | `/prompt-templates/:id` | 删除模板 | ✅ |

**基础路径**：
- **通过 Gateway**: `http://localhost:3000/api/v1/prompt-templates`（推荐）
- **直接访问**: `http://localhost:4004/api/v1/prompt-templates`

### 5.0 Prompt 模板管理 API

#### 5.0.1 获取模板列表

```bash
GET /api/v1/prompt-templates
```

**查询参数**：
- `userId` (可选): 用户 ID，获取该用户创建的模板
- `public` (可选): `true`，只获取公开的模板
- `category` (可选): 分类，按分类筛选（如 `image`, `text`, `formatter`）
- `limit` (可选): 返回数量限制，默认 50
- `offset` (可选): 偏移量，默认 0

**示例 1：获取所有公开的模板**
```bash
GET /api/v1/prompt-templates?public=true
```

**示例 2：获取指定用户的模板**
```bash
GET /api/v1/prompt-templates?userId=user-123
```

**示例 3：按分类获取模板**
```bash
GET /api/v1/prompt-templates?category=image
```

**示例 4：获取所有模板（包括公开和私有的）**
```bash
GET /api/v1/prompt-templates
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "nano-banana-photo-prompt",
      "name": "nano-banana-photo-prompt",
      "display_name": "Nano Banana 摄影生图 Prompt",
      "description": "专业摄影风格提示词模板，适用于 Nano Banana 模型",
      "template": "专业摄影风格提示词：\n主题：{{theme}}\n风格：{{style}}\n细节：{{details}}\n质量要求：{{quality}}",
      "variables": ["theme", "style", "details", "quality"],
      "category": "image",
      "author_id": null,
      "is_public": true,
      "usage_count": 0,
      "created_at": "2025-01-15T12:00:00Z",
      "updated_at": "2025-01-15T12:00:00Z"
    }
  ],
  "count": 1
}
```

#### 5.0.2 获取单个模板详情

```bash
GET /api/v1/prompt-templates/:id
```

**示例**：
```bash
GET /api/v1/prompt-templates/nano-banana-photo-prompt
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "nano-banana-photo-prompt",
    "name": "nano-banana-photo-prompt",
    "display_name": "Nano Banana 摄影生图 Prompt",
    "description": "专业摄影风格提示词模板，适用于 Nano Banana 模型",
    "template": "专业摄影风格提示词：\n主题：{{theme}}\n风格：{{style}}\n细节：{{details}}\n质量要求：{{quality}}",
    "variables": ["theme", "style", "details", "quality"],
    "category": "image",
    "author_id": null,
    "is_public": true,
    "usage_count": 0,
    "created_at": "2025-01-15T12:00:00Z",
    "updated_at": "2025-01-15T12:00:00Z"
  }
}
```

#### 5.0.3 根据名称获取模板

```bash
GET /api/v1/prompt-templates/name/:name
```

**示例**：
```bash
GET /api/v1/prompt-templates/name/nano-banana-photo-prompt
```

**响应**：同 5.0.2

#### 5.0.4 创建模板

```bash
POST /api/v1/prompt-templates
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体**：
```json
{
  "name": "my-custom-template",
  "display_name": "我的自定义模板",
  "description": "这是一个自定义的 Prompt 模板",
  "template": "请根据以下信息生成内容：\n主题：{{topic}}\n风格：{{style}}\n长度：{{length}}",
  "variables": ["topic", "style", "length"],
  "category": "text",
  "author_id": "user-123",
  "is_public": false
}
```

**字段说明**：
- `name` (必需): 模板名称，唯一标识，用于在 formatter 节点中引用
- `display_name` (必需): 显示名称，用于 UI 展示
- `template` (必需): 模板内容，支持变量占位符 `{{variable}}`
- `variables` (可选): 模板变量列表，用于验证和提示
- `category` (可选): 分类，如 `image`, `text`, `formatter`
- `author_id` (可选): 创建者用户 ID
- `is_public` (可选): 是否公开，`true` 表示所有用户都可以访问，默认 `false`
- `description` (可选): 模板描述

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "template-1234567890-abc123",
    "name": "my-custom-template",
    "display_name": "我的自定义模板",
    "description": "这是一个自定义的 Prompt 模板",
    "template": "请根据以下信息生成内容：\n主题：{{topic}}\n风格：{{style}}\n长度：{{length}}",
    "variables": ["topic", "style", "length"],
    "category": "text",
    "author_id": "user-123",
    "is_public": false,
    "usage_count": 0,
    "created_at": "2025-01-15T12:00:00Z",
    "updated_at": "2025-01-15T12:00:00Z"
  }
}
```

#### 5.0.5 更新模板

```bash
PUT /api/v1/prompt-templates/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体**：
```json
{
  "display_name": "更新后的模板名称",
  "description": "更新后的描述",
  "template": "更新后的模板内容：{{new_variable}}",
  "variables": ["new_variable"],
  "category": "formatter",
  "is_public": true
}
```

**字段说明**：
- 所有字段都是可选的，只更新提供的字段
- `name` 字段不能更新（模板名称是唯一标识）

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "template-1234567890-abc123",
    "name": "my-custom-template",
    "display_name": "更新后的模板名称",
    "description": "更新后的描述",
    "template": "更新后的模板内容：{{new_variable}}",
    "variables": ["new_variable"],
    "category": "formatter",
    "author_id": "user-123",
    "is_public": true,
    "usage_count": 0,
    "created_at": "2025-01-15T12:00:00Z",
    "updated_at": "2025-01-15T12:30:00Z"
  }
}
```

#### 5.0.6 删除模板

```bash
DELETE /api/v1/prompt-templates/:id
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

#### 5.0.7 在 Formatter 节点中使用模板

创建模板后，可以在 Smartflow 的 formatter 节点中通过 `template` 字段引用：

```json
{
  "id": "formatter1",
  "type": "formatter",
  "template": "nano-banana-photo-prompt",
  "format_prompt": "可选：额外的格式化提示",
  "reference_nodes": ["model1"],
  "output_format": "prompt",
  "formatter_model": "gpt-5-nano"
}
```

**模板加载优先级**：
1. 首先从内置模板库查找（`BUILTIN_TEMPLATES`）
2. 如果内置模板不存在，从数据库加载（通过 `name` 字段查找）
3. 如果数据库模板也不存在，将 `template` 字段作为自定义模板内容使用

**注意**：
- 使用数据库模板时，每次使用会自动增加 `usage_count` 计数
- 模板必须存在且可访问（公开模板或用户自己的模板）

### 5.1 创建 Smartflow

```bash
POST /api/v1/smartflows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "简单文本生成工作流",
  "description": "生成文本内容",
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
        ]
      },
      {
        "id": "model1",
        "type": "model",
        "model_type": "text",
        "model": "gpt-5-nano",
        "prompt": "生成关于 {{input.topic}} 的文章"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "result": "model1.text"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "model1" },
      { "from": "model1", "to": "end" }
    ]
  },
  "status": "active",
  "is_public": true  // 设置为 true 创建公开的智能链，所有用户都可以访问
}
```

**重要说明**：
- `author_id` **不需要**在请求 body 中提供
- 系统会从认证 token 中自动获取用户 ID 作为 `author_id`
- Gateway 会解析 Bearer token，并通过 `x-user-id` header 转发用户 ID 到后端
- 如果 body 中提供了 `author_id`，系统会验证是否与 token 中的用户 ID 一致，防止伪造
```

**字段说明**：
- `name` (必需): 工作流名称
- `schema` (必需): 工作流定义（节点和边）
- `description` (可选): 工作流描述
- `status` (可选): 状态，可选值：`active`、`inactive`、`draft`，默认 `draft`
- `author_id` (可选): 创建者用户 ID
- `is_public` (可选): 是否公开，`true` 表示所有用户都可以访问，`false` 表示仅创建者可见，默认 `false`
- `category` (可选): 分类标签
- `tags` (可选): 标签数组
- `icon` (可选): 图标 URL
- `version` (可选): 版本号，默认 `1.0.0`

**创建公开智能链示例**：

```bash
POST /api/v1/smartflows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "公开的图片生成工作流",
  "description": "所有人都可以使用的图片生成工作流",
  "schema": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "expected_outputs": [
          {
            "type": "image",
            "name": "result",
            "required": true
          }
        ]
      },
      {
        "id": "model1",
        "type": "model",
        "model_type": "image",
        "model": "dall-e-3",
        "prompt": "{{input.prompt}}"
      },
      {
        "id": "end",
        "type": "end",
        "output_mapping": {
          "result": "model1.image"
        }
      }
    ],
    "edges": [
      { "from": "start", "to": "model1" },
      { "from": "model1", "to": "end" }
    ]
  },
  "status": "active",
  "is_public": true,  // 关键：设置为 true 创建公开智能链
  "category": "image-generation",
  "tags": ["image", "generation", "public"]
}
```

### 5.2 查询 Smartflow（GET）

#### 5.2.1 获取所有 Smartflow

```bash
GET /api/v1/smartflows
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "smartflow-123",
      "name": "简单文本生成工作流",
      "description": "生成文本内容",
      "is_public": false,
      "status": "active",
      "author_id": "user-123",
      "schema": { ... },
      "created_at": "2025-12-12T08:00:00Z"
    }
  ],
  "count": 1
}
```

#### 5.2.2 获取公开的 Smartflow

```bash
GET /api/v1/smartflows?public=true
```

**查询参数**：
- `public=true`: 只获取公开的智能链（`is_public=true`）
- `limit` (可选): 返回数量限制，默认 50
- `offset` (可选): 偏移量，默认 0

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "public-flow-1",
      "name": "公开的图片生成工作流",
      "description": "所有人都可以使用的图片生成工作流",
      "is_public": true,  // 标记为公开
      "status": "active",
      "schema": { ... }
    }
  ],
  "count": 1
}
```

#### 5.2.3 获取指定用户的 Smartflow

```bash
GET /api/v1/smartflows?userId=user-123
```

**查询参数**：
- `userId`: 用户 ID，获取该用户创建的所有智能链
- `limit` (可选): 返回数量限制
- `offset` (可选): 偏移量

#### 5.2.4 获取单个 Smartflow 详情

```bash
GET /api/v1/smartflows/:id
```

**示例**：
```bash
GET /api/v1/smartflows/smartflow-123
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "smartflow-123",
    "name": "简单文本生成工作流",
    "description": "生成文本内容",
    "is_public": false,
    "status": "active",
    "author_id": "user-123",
    "schema": {
      "nodes": [ ... ],
      "edges": [ ... ]
    },
    "created_at": "2025-12-12T08:00:00Z",
    "updated_at": "2025-12-12T08:00:00Z"
  }
}
```

**注意**：
- GET 请求**不需要认证**，可以直接访问
- 通过 `?public=true` 可以筛选出所有公开的智能链
- 通过 `?userId=xxx` 可以获取指定用户创建的智能链
- 不传任何参数时，默认返回所有智能链（包括公开和私有的）

### 5.3 执行 Smartflow

```bash
POST /api/v1/smartflows/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-123",
  "input": [
    {
      "content": "人工智能",
      "type": "text",
      "name": "topic"
    }
  ],
  "conversationId": "conv-123"  // 可选
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "execution-123",
    "smartflow_id": "smartflow-123",
    "user_id": "user-123",
    "status": "running",
    "input": [...],
    "flow_chain": [...],
    "created_at": "2025-12-12T08:00:00Z"
  }
}
```

### 5.3 查询 Task 详情

```bash
GET /api/v1/smartflow-tasks/:id
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "execution-123",
    "smartflow_id": "smartflow-123",
    "user_id": "user-123",
    "status": "completed",
    "input": {...},
    "output": {
      "result": "生成的文本内容"
    },
    "flow_chain": [
      {
        "node_id": "start",
        "node_type": "start",
        "status": "completed",
        "output": {...},
        "duration_ms": 5,
        "timestamp": "2025-12-12T08:00:00Z"
      },
      {
        "node_id": "model1",
        "node_type": "model",
        "status": "completed",
        "output": {
          "text": "生成的文本内容"
        },
        "duration_ms": 1234,
        "timestamp": "2025-12-12T08:00:01Z"
      }
    ],
    "started_at": "2025-12-12T08:00:00Z",
    "completed_at": "2025-12-12T08:00:02Z"
  }
}
```

---

## 六、与其他服务的协作

### 6.1 mxmcgi（生成服务）

- **调用方式**：通过 Gateway 的 HTTP 接口，不直接引用代码
- **API 路径**：
  - 文本生成：`/api/v1/cgi/text/:modelName`
  - 图片生成：`/api/v1/cgi/image/:modelName`
  - 视频生成：`/api/v1/cgi/video/:modelName`（待实现）
  - 音频生成：`/api/v1/cgi/sound/:modelName`（待实现）
  - 向量生成：`/api/v1/cgi/embedding/:modelName`（待实现）

- **认证**：通过 Gateway 的 API Key 认证

### 6.2 mxmdata（数据层）

- **Repository 接口**：
  - `ISmartflowRepository`: Smartflow 定义的 CRUD
  - `ISmartflowExecutionRepository`: Task 的 CRUD 和状态管理

- **数据存储**：使用 Supabase/PostgreSQL，Smartflow schema 和 flow_chain 存储在 JSONB 字段中

### 6.3 mxmnotify（通知服务）

- **集成方式**：Task 状态变更时，可发布通知事件（待实现）

### 6.4 mxmauth（认证服务）

- **认证方式**：通过 Gateway 的 JWT 认证中间件
- **用户信息**：从 JWT token 中获取 `userId`

---

## 七、配置示例

### 7.1 简单文本生成

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "expected_outputs": [
        { "type": "text", "name": "result", "required": true }
      ]
    },
    {
      "id": "model1",
      "type": "model",
      "model_type": "text",
      "model": "gpt-5-nano",
      "prompt": "生成关于 {{input.topic}} 的文章"
    },
    {
      "id": "end",
      "type": "end",
      "output_mapping": {
        "result": "model1.text"
      }
    }
  ],
  "edges": [
    { "from": "start", "to": "model1" },
    { "from": "model1", "to": "end" }
  ]
}
```

### 7.2 图片生成（使用 Prompt 模板）

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "expected_outputs": [
        { "type": "image", "name": "cover_image", "required": true }
      ]
    },
    {
      "id": "formatter1",
      "type": "formatter",
      "template": "nano-banana-photo-prompt",
      "format_prompt": "将用户输入转换为专业的摄影生图 prompt",
      "reference_nodes": [],
      "formatter_model": "gpt-5-nano"
    },
    {
      "id": "model1",
      "type": "model",
      "model_type": "image",
      "model": "nano-banana",
      "prompt": "{{formatter1.output}}"
    },
    {
      "id": "end",
      "type": "end",
      "output_mapping": {
        "cover_image": "model1.image_url"
      }
    }
  ],
  "edges": [
    { "from": "start", "to": "formatter1" },
    { "from": "formatter1", "to": "model1" },
    { "from": "model1", "to": "end" }
  ]
}
```

### 7.3 带条件分支的工作流

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "expected_outputs": [
        { "type": "text", "name": "result", "required": true }
      ]
    },
    {
      "id": "recall1",
      "type": "recall",
      "knowledge_base": "general",
      "query": "{{input.query}}"
    },
    {
      "id": "condition1",
      "type": "condition",
      "if": "{{recall1.count}} > 0",
      "then": "model1",
      "else": "model2"
    },
    {
      "id": "model1",
      "type": "model",
      "model_type": "text",
      "model": "gpt-5-nano",
      "prompt": "基于知识库内容回答：{{recall1.content}}"
    },
    {
      "id": "model2",
      "type": "model",
      "model_type": "text",
      "model": "gpt-5-nano",
      "prompt": "直接回答：{{input.query}}"
    },
    {
      "id": "end",
      "type": "end",
      "output_mapping": {
        "result": "{{condition1.output}}"
      }
    }
  ],
  "edges": [
    { "from": "start", "to": "recall1" },
    { "from": "recall1", "to": "condition1" },
    { "from": "condition1", "to": "model1", "when": "{{recall1.count}} > 0" },
    { "from": "condition1", "to": "model2", "when": "{{recall1.count}} <= 0" },
    { "from": "model1", "to": "end" },
    { "from": "model2", "to": "end" }
  ]
}
```

---

## 八、实现要点

### 8.1 执行引擎

- **SmartflowEngine**: 核心执行引擎，负责解析 Schema、构建节点图、执行节点、管理状态
- **节点执行器**: 每种节点类型都有对应的执行器（StartExecutor, ModelExecutor, ToolsExecutor 等）
- **变量解析**: VariableResolver 负责解析 `{{variable}}` 表达式
- **状态持久化**: 每个节点执行后，更新 `smartflow_executions` 表的 `flow_chain` 字段

### 8.2 模型注册表

- **ModelRegistry**: 集中管理所有 mxmcgi 支持的模型
- **模型信息**: 包括显示名称、类型、支持的提供商、默认参数等
- **模型验证**: 执行前验证模型名称和类型是否匹配

### 8.3 Prompt 模板系统

- **内置模板**: 提供常用模板（如 nano-banana-photo-prompt）
- **模板填充**: 支持变量替换
- **模板管理**: 可扩展，支持用户自定义模板

### 8.4 知识库系统

- **内置知识库**: 提供通用、技术等知识库
- **检索类型**: 支持向量、关键词、混合检索
- **可扩展**: 支持用户自定义知识库（待实现）

### 8.5 HTTP 客户端

- **http-client.ts**: 统一管理所有对 mxmcgi 的 HTTP 调用
- **Gateway 集成**: 所有调用都通过 Gateway，使用 API Key 认证
- **错误处理**: 统一的错误处理和重试机制

---

## 九、开发与部署

### 9.1 本地开发

```bash
# 启动所有服务（包括 mxmagent）
pnpm run dev:all

# 单独启动 mxmagent
pnpm run dev:mxmagent
```

### 9.2 环境变量

**mxmagent/.env**:
```bash
PORT=4004
GATEWAY_URL=http://localhost:3000
GATEWAY_API_KEY=your_api_key
```

### 9.3 数据初始化

确保 Supabase 中已创建 `smartflows` 和 `smartflow_executions` 表（参考 `mxmdata/src/database/schemas/mxmagent_final.sql`）。

---

## 十、未来规划

1. **代码沙箱**: 支持用户自定义工具（Python/JavaScript）
2. **自然语言工具**: 支持通过自然语言描述生成工具代码
3. **知识库扩展**: 支持用户创建和管理自己的知识库
4. **流式输出**: 支持 SSE 流式返回执行进度和中间结果
5. **模板市场**: 提供 Prompt 模板市场，用户可以分享和下载模板
6. **工作流版本控制**: 支持工作流版本管理和回滚
7. **执行优化**: 支持节点并行执行、缓存、重试等优化策略

---

## 十一、相关文档

- [API 文档](./mxmagent/src/routes/API_DOCUMENTATION.md)
- [Postman 集合](./mxmagent/src/routes/POSTMAN_COLLECTION.md)
- [配置示例](./mxmagent/src/core/smartflow/CONFIG_EXAMPLES_NEW.md)
- [实现总结](./mxmagent/src/core/smartflow/IMPLEMENTATION_SUMMARY.md)
- [**完整工作流示例：文本优化 + 图片生成**](./mxmagent/SMARTFLOW_EXAMPLE_IMAGE_GENERATION.md) ⭐
- [**Loop 节点设计文档**](./mxmagent/src/core/smartflow/LOOP_NODE_DESIGN.md) 🔄
- [**PPT Slide 生成智能链示例**](./mxmagent/src/core/smartflow/examples/PPT_SLIDE_GENERATION_README.md) 📊
