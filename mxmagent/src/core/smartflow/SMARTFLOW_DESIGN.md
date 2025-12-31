# Smartflow 设计方案

## 一、概述

Smartflow 是模仿 Dify.ai 的 Workflow 功能，用于定义和执行复杂的工作流。通过 LangGraph 实现节点编排和执行。

## 二、核心概念

### 1. Smartflow（工作流模板）
- **定义**：工作流的模板，包含节点、边、配置等信息
- **存储**：`smartflows` 表
- **用途**：可被多次执行，每次执行创建一个 `smartflow_execution`

### 2. Smartflow Execution（工作流执行实例）
- **定义**：工作流的一次执行记录
- **存储**：`smartflow_executions` 表
- **用途**：记录执行状态、进度、输入输出、思维链等

### 3. Chatflow（对话流）
- **定义**：通过配置 `smartflow_id` 来触发工作流的对话
- **存储**：`conversations` 表（通过 `smartflow_id` 关联）
- **用途**：用户对话时自动触发对应的工作流

## 三、工作流节点类型

### 支持的节点类型

1. **start** - 开始节点
   - 工作流的入口点
   - 接收初始输入数据

2. **llm** - LLM 节点
   - 调用大模型生成内容
   - 配置：model, prompt, temperature, max_tokens

3. **tool** - 工具节点
   - 调用外部工具（如 mxmcgi 的图像生成、文本生成等）
   - 配置：tool_name, tool_params

4. **condition** - 条件判断节点
   - 根据条件决定执行路径
   - 配置：condition, conditions

5. **code** - 代码执行节点
   - 执行 Python 或 JavaScript 代码
   - 配置：code, language

6. **knowledge_retrieval** - 知识检索节点
   - 从向量数据库检索相关知识
   - 配置：query, top_k, collection

7. **template** - 模板节点
   - 提示词模板处理
   - 配置：template, variables

8. **variable** - 变量节点
   - 变量赋值和转换
   - 配置：variable, value, transform

9. **http_request** - HTTP 请求节点
   - 调用外部 API
   - 配置：url, method, headers, body

10. **end** - 结束节点
    - 工作流的出口点
    - 返回最终结果

## 四、数据流设计

### 节点间的数据传递

```typescript
// 节点输入可以引用其他节点的输出
{
  "inputs": [
    { 
      "variable": "user_input", 
      "value": "{{input.user_input}}"  // 引用输入数据
    },
    { 
      "variable": "understanding", 
      "source": "step1_understand"     // 引用其他节点的输出
    }
  ]
}
```

### 变量作用域

- **全局变量**：定义在 `schema.variables` 中，所有节点可访问
- **节点输入变量**：通过 `inputs` 定义，从其他节点或输入数据获取
- **节点输出变量**：通过 `outputs` 定义，供其他节点使用

## 五、执行流程

### 1. 工作流启动

```typescript
// 从对话触发
conversation.smartflow_id = 'testflow'
→ 创建 smartflow_execution
→ 启动 LangGraph 执行引擎
```

### 2. 节点执行

```typescript
// 每个节点执行时
1. 准备输入数据（从变量、其他节点获取）
2. 执行节点逻辑（LLM 调用、工具调用等）
3. 更新 flow_chain（记录执行状态）
4. 流式输出 SmartflowChunk
5. 更新节点输出变量
```

### 3. 状态管理

```typescript
// 执行状态流转
pending → running → completed/failed
```

### 4. 思维链记录

```typescript
// flow_chain 记录每个节点的执行情况
[
  {
    node_id: "step1_understand",
    node_name: "理解用户意图",
    state: "completed",
    input: {...},
    output: {...},
    timestamp: 1704067200000,
    duration: 1500
  }
]
```

## 六、与 Chat 的集成

### Chatflow 工作流程

```
用户发送消息
  ↓
ChatApp.sendMessage()
  ↓
检查 conversation.smartflow_id
  ↓
如果存在 smartflow_id
  ↓
创建 smartflow_execution
  ↓
执行 Smartflow
  ↓
流式输出 SmartflowChunk
  ↓
保存到 conversation.messages
```

### 数据关联

- `conversations.smartflow_id` → `smartflows.id`
- `smartflow_executions.conversation_id` → `conversations.id`
- `smartflow_executions.smartflow_id` → `smartflows.id`

## 七、API 设计（未来）

### Smartflow 管理 API

```
GET    /api/v1/smartflows              # 获取工作流列表
GET    /api/v1/smartflows/:id          # 获取工作流详情
POST   /api/v1/smartflows              # 创建工作流
PUT    /api/v1/smartflows/:id          # 更新工作流
DELETE /api/v1/smartflows/:id          # 删除工作流
```

### Smartflow 执行 API

```
POST   /api/v1/smartflows/:id/execute  # 执行工作流
GET    /api/v1/smartflow-executions/:id # 获取执行详情
GET    /api/v1/smartflow-executions     # 获取执行列表
```

## 八、实现优先级

### Phase 1: 基础功能
1. ✅ Smartflow 数据模型定义
2. ✅ 数据库表结构
3. ⏳ Smartflow Repository 接口和实现
4. ⏳ 基础节点类型（start, llm, end）

### Phase 2: 核心功能
1. ⏳ LangGraph 工作流引擎
2. ⏳ 节点执行器
3. ⏳ 变量系统
4. ⏳ 流式输出

### Phase 3: 高级功能
1. ⏳ 更多节点类型（tool, condition, code）
2. ⏳ 错误处理和重试
3. ⏳ 工作流可视化
4. ⏳ 工作流版本管理
