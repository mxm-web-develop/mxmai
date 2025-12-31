# Smartflow 架构设计讨论文档

## 一、设计目标

### 核心需求
1. **可扩展性**：支持新增节点类型，无需修改核心代码
2. **可配置性**：用户可以通过 JSON 直接配置整个 Smartflow
3. **灵活性**：支持复杂的节点连接、条件分支、循环等
4. **可维护性**：清晰的架构，易于理解和维护

### 参考：Dify.ai Workflow
- 可视化工作流编辑器
- 丰富的节点类型（LLM、工具、条件、代码等）
- 变量系统和数据流
- 工作流模板和版本管理

---

## 二、核心架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────┐
│  用户层（JSON 配置 / 可视化编辑器）    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Smartflow 定义层（Schema）          │
│  - SmartflowSchema (JSON)           │
│  - 节点定义、边定义、变量定义         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Smartflow 引擎层（Execution Engine） │
│  - Schema 解析器                     │
│  - 节点执行器（Node Executor）       │
│  - 变量系统（Variable System）       │
│  - 状态管理（State Management）      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  LangGraph 集成层                    │
│  - 动态构建 StateGraph               │
│  - 节点函数生成                      │
│  - 边和路由逻辑                      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  执行层（Runtime）                   │
│  - LLM 调用（通过 mxmcgi）           │
│  - 工具调用（通过 mxmcgi）           │
│  - 外部服务调用                      │
└─────────────────────────────────────┘
```

---

## 三、关键设计问题讨论

### 3.1 Schema 设计 - 如何支持灵活配置？

#### 方案 A：严格的 JSON Schema 验证
**优点**：
- 类型安全，配置错误可以提前发现
- IDE 支持自动补全和验证
- 清晰的配置规范

**缺点**：
- 需要维护复杂的 JSON Schema
- 扩展节点类型需要更新 Schema

#### 方案 B：宽松的配置 + 运行时验证
**优点**：
- 配置灵活，易于扩展
- 支持自定义节点类型
- 配置更简洁

**缺点**：
- 运行时才能发现错误
- 需要完善的错误提示

#### 推荐方案：混合方案
- **核心字段**：严格验证（id, type, name 等）
- **config 字段**：宽松验证，由节点执行器自行验证
- **扩展字段**：支持 `[key: string]: any`，允许自定义配置

---

### 3.2 节点类型扩展机制

#### 问题：如何支持新增节点类型？

#### 方案 A：插件式节点注册
```typescript
// 节点注册表
const NodeRegistry = {
  'llm': LLMNodeExecutor,
  'tool': ToolNodeExecutor,
  'condition': ConditionNodeExecutor,
  // ... 可以动态注册
};

// 新增节点类型
NodeRegistry.register('custom_node', CustomNodeExecutor);
```

**优点**：
- 易于扩展
- 支持第三方节点
- 核心代码不需要修改

**缺点**：
- 需要统一的节点接口
- 节点间依赖管理

#### 方案 B：配置文件定义节点
```json
{
  "node_types": {
    "llm": {
      "executor": "LLMNodeExecutor",
      "config_schema": { ... },
      "inputs": ["prompt", "model"],
      "outputs": ["response"]
    }
  }
}
```

**优点**：
- 配置驱动，无需代码
- 易于版本管理

**缺点**：
- 复杂节点仍需代码实现
- 配置和代码可能不同步

#### 推荐方案：混合方案
- **基础节点**：代码实现（llm, tool, condition 等）
- **自定义节点**：通过配置 + 代码模板生成
- **扩展节点**：插件机制，支持动态加载

---

### 3.3 变量系统设计

#### 问题：如何实现节点间的数据传递？

#### 方案 A：全局变量表
```typescript
// 执行时的变量上下文
const context = {
  input: { user_input: "..." },
  step1_understand: { understanding: "..." },
  step2_process: { result: "..." }
};

// 变量引用：{{step1_understand.understanding}}
```

**优点**：
- 简单直观
- 易于调试

**缺点**：
- 变量名冲突
- 作用域不清晰

#### 方案 B：命名空间变量
```typescript
// 节点输出自动命名空间化
const context = {
  input: { ... },
  nodes: {
    step1_understand: { understanding: "..." },
    step2_process: { result: "..." }
  }
};

// 变量引用：{{nodes.step1_understand.understanding}}
```

**优点**：
- 避免命名冲突
- 作用域清晰

**缺点**：
- 引用路径较长

#### 推荐方案：简化命名空间
- **输入变量**：`{{input.xxx}}`
- **节点输出**：`{{node_id.output_var}}` 或 `{{node_id}}`（自动展开所有输出）
- **全局变量**：`{{vars.xxx}}`

---

### 3.4 条件分支和循环

#### 问题：如何支持复杂控制流？

#### 方案 A：条件边（Conditional Edge）
```json
{
  "edges": [
    {
      "source": "condition_node",
      "target": "node_a",
      "condition": "{{condition_node.result}} === 'yes'"
    },
    {
      "source": "condition_node",
      "target": "node_b",
      "condition": "{{condition_node.result}} === 'no'"
    }
  ]
}
```

**优点**：
- 符合 Dify.ai 的设计
- 可视化友好

**缺点**：
- LangGraph 需要支持条件路由

#### 方案 B：条件节点 + 路由节点
```json
{
  "nodes": [
    {
      "id": "router",
      "type": "condition",
      "config": {
        "conditions": [
          { "value": "{{check.result}}", "operator": "eq", "target": "yes", "next": "node_a" },
          { "value": "{{check.result}}", "operator": "eq", "target": "no", "next": "node_b" }
        ]
      }
    }
  ]
}
```

**优点**：
- 更灵活
- 支持多条件

**缺点**：
- 配置复杂

#### 推荐方案：条件边 + 条件节点
- **简单条件**：使用条件边
- **复杂条件**：使用条件节点
- **循环**：通过条件边 + 状态判断实现（类似 LangGraph 的循环）

---

### 3.5 错误处理和重试

#### 问题：节点执行失败如何处理？

#### 方案 A：全局错误处理策略
```json
{
  "settings": {
    "error_handling": "stop" | "continue" | "retry",
    "retry_count": 3,
    "retry_delay": 1000
  }
}
```

**优点**：
- 统一配置
- 简单

**缺点**：
- 不够灵活

#### 方案 B：节点级错误处理
```json
{
  "nodes": [
    {
      "id": "critical_node",
      "error_handling": {
        "strategy": "retry",
        "retry_count": 5,
        "on_failure": "stop"
      }
    },
    {
      "id": "optional_node",
      "error_handling": {
        "strategy": "continue",
        "fallback_value": "default"
      }
    }
  ]
}
```

**优点**：
- 灵活，可针对不同节点配置

**缺点**：
- 配置复杂

#### 推荐方案：全局 + 节点级
- **全局默认**：在 settings 中配置
- **节点覆盖**：节点可以覆盖全局设置
- **错误节点**：支持错误处理节点（类似 try-catch）

---

### 3.6 工作流版本管理

#### 问题：如何管理工作流的版本和变更？

#### 方案 A：版本号 + 快照
```json
{
  "id": "testflow",
  "version": "1.2.3",
  "schema": { ... },
  "previous_versions": ["1.2.2", "1.2.1"]
}
```

**优点**：
- 简单
- 可以回滚

**缺点**：
- 需要存储多个版本

#### 方案 B：版本表 + 变更记录
```sql
-- smartflow_versions 表
-- 存储每个版本的完整 schema
-- 支持版本对比和回滚
```

**优点**：
- 完整的版本历史
- 支持版本对比

**缺点**：
- 存储开销大

#### 推荐方案：简化版本管理
- **版本号**：语义化版本（major.minor.patch）
- **版本存储**：只存储当前版本，历史版本可选存储
- **版本兼容**：支持向后兼容检查

---

## 四、JSON 配置格式设计

### 4.1 完整配置示例

```json
{
  "id": "image_generation_flow",
  "name": "图像生成工作流",
  "description": "理解用户意图 -> 优化提示词 -> 生成图像 -> 后处理",
  "version": "1.0.0",
  "schema": {
    "version": "1.0.0",
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "name": "开始",
        "position": { "x": 100, "y": 100 },
        "config": {}
      },
      {
        "id": "understand",
        "type": "llm",
        "name": "理解用户意图",
        "position": { "x": 300, "y": 100 },
        "config": {
          "model": "gpt-5-nano",
          "prompt": "分析用户输入，提取图像生成需求：\n\n{{input.user_input}}",
          "temperature": 0.7,
          "max_tokens": 500
        },
        "inputs": [
          { "variable": "user_input", "value": "{{input.user_input}}" }
        ],
        "outputs": [
          { "variable": "requirement", "type": "string" }
        ]
      },
      {
        "id": "optimize_prompt",
        "type": "llm",
        "name": "优化提示词",
        "position": { "x": 500, "y": 100 },
        "config": {
          "model": "gpt-5-nano",
          "prompt": "将以下需求转换为专业的图像生成提示词：\n\n{{understand.requirement}}",
          "temperature": 0.8
        },
        "inputs": [
          { "variable": "requirement", "source": "understand" }
        ],
        "outputs": [
          { "variable": "prompt", "type": "string" }
        ]
      },
      {
        "id": "generate_image",
        "type": "tool",
        "name": "生成图像",
        "position": { "x": 700, "y": 100 },
        "config": {
          "tool_name": "image_generation",
          "tool_params": {
            "model": "dall-e-3",
            "prompt": "{{optimize_prompt.prompt}}",
            "size": "1024x1024",
            "quality": "hd"
          }
        },
        "inputs": [
          { "variable": "prompt", "source": "optimize_prompt" }
        ],
        "outputs": [
          { "variable": "image_url", "type": "string" },
          { "variable": "image_id", "type": "string" }
        ],
        "error_handling": {
          "strategy": "retry",
          "retry_count": 3
        }
      },
      {
        "id": "check_quality",
        "type": "condition",
        "name": "质量检查",
        "position": { "x": 900, "y": 100 },
        "config": {
          "condition": "{{generate_image.image_url}} !== null"
        },
        "inputs": [
          { "variable": "image_url", "source": "generate_image" }
        ],
        "outputs": [
          { "variable": "passed", "type": "boolean" }
        ]
      },
      {
        "id": "end",
        "type": "end",
        "name": "结束",
        "position": { "x": 1100, "y": 100 },
        "config": {}
      }
    ],
    "edges": [
      { "id": "e1", "source": "start", "target": "understand" },
      { "id": "e2", "source": "understand", "target": "optimize_prompt" },
      { "id": "e3", "source": "optimize_prompt", "target": "generate_image" },
      { 
        "id": "e4", 
        "source": "generate_image", 
        "target": "check_quality",
        "type": "default"
      },
      { 
        "id": "e5", 
        "source": "check_quality", 
        "target": "end",
        "condition": "{{check_quality.passed}} === true"
      }
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

## 五、关键设计决策点

### 5.1 节点执行器设计

**问题**：如何设计节点执行器接口，支持扩展？

**方案讨论**：
```typescript
// 统一的节点执行器接口
interface INodeExecutor {
  // 验证节点配置
  validate(config: NodeConfig): boolean;
  
  // 执行节点
  execute(
    node: SmartflowNode, 
    context: ExecutionContext
  ): Promise<NodeOutput>;
  
  // 获取节点输出 Schema
  getOutputSchema(node: SmartflowNode): OutputSchema;
}
```

**关键点**：
- 统一的接口，易于扩展
- 支持异步执行
- 支持流式输出（可选）

---

### 5.2 变量解析系统

**问题**：如何解析和替换变量引用？

**方案讨论**：
```typescript
// 变量解析器
class VariableResolver {
  // 解析变量引用：{{node_id.output_var}}
  resolve(template: string, context: ExecutionContext): any;
  
  // 支持嵌套引用：{{node1.output}} + {{node2.output}}
  // 支持函数调用：{{format({{node1.output}}, 'json')}}
  // 支持条件表达式：{{if({{node1.result}}, 'yes', 'no')}}
}
```

**关键点**：
- 支持复杂表达式
- 性能优化（缓存解析结果）
- 错误处理（变量不存在时的处理）

---

### 5.3 工作流验证

**问题**：如何验证工作流配置的正确性？

**验证项**：
1. **结构验证**：
   - 必须有 start 和 end 节点
   - 所有边必须连接存在的节点
   - 不能有循环依赖（某些节点类型）

2. **配置验证**：
   - 节点配置是否符合节点类型要求
   - 变量引用是否存在
   - 数据类型是否匹配

3. **执行验证**：
   - 所有节点是否可达
   - 是否有死循环
   - 变量依赖链是否完整

---

### 5.4 性能优化

**问题**：如何优化工作流执行性能？

**优化点**：
1. **并行执行**：无依赖的节点并行执行
2. **缓存**：相同输入的节点结果缓存
3. **流式输出**：边执行边输出，不等待全部完成
4. **资源管理**：LLM 调用限流、连接池等

---

## 六、扩展性设计

### 6.1 节点类型扩展

**方案**：插件式注册 + 配置驱动

```typescript
// 节点注册表
class NodeRegistry {
  private executors: Map<string, INodeExecutor> = new Map();
  
  register(type: string, executor: INodeExecutor): void;
  get(type: string): INodeExecutor;
  list(): string[];
}

// 使用
registry.register('custom_node', new CustomNodeExecutor());
```

### 6.2 工具集成扩展

**方案**：工具适配器模式

```typescript
// 工具适配器接口
interface IToolAdapter {
  name: string;
  execute(params: Record<string, any>): Promise<any>;
}

// mxmcgi 工具适配器
class MXMCGIToolAdapter implements IToolAdapter {
  name = 'mxmcgi';
  async execute(params) {
    // 调用 mxmcgi 服务
  }
}
```

### 6.3 工作流模板扩展

**方案**：模板系统

```typescript
// 工作流模板
interface SmartflowTemplate {
  id: string;
  name: string;
  schema: SmartflowSchema;
  variables: Record<string, any>; // 模板变量
}

// 从模板创建
function createFromTemplate(
  template: SmartflowTemplate,
  variables: Record<string, any>
): Smartflow;
```

---

## 七、待讨论的关键问题

### 7.1 Schema 版本兼容性
- **问题**：如何保证不同版本 Schema 的兼容性？
- **选项**：
  - 版本迁移脚本
  - 向后兼容检查
  - 自动升级机制

### 7.2 工作流可视化
- **问题**：是否需要支持可视化编辑器？
- **选项**：
  - 前端可视化编辑器（类似 Dify.ai）
  - JSON 配置 + 可视化预览
  - 两者都支持

### 7.3 工作流调试
- **问题**：如何支持工作流调试？
- **选项**：
  - 执行日志和追踪
  - 断点调试
  - 变量查看器

### 7.4 工作流测试
- **问题**：如何测试工作流？
- **选项**：
  - 单元测试（单个节点）
  - 集成测试（完整工作流）
  - 模拟执行（不实际调用外部服务）

### 7.5 权限和访问控制
- **问题**：如何控制工作流的访问权限？
- **选项**：
  - 公开/私有工作流
  - 用户级权限
  - 组织级权限

---

## 八、建议的实现优先级

### Phase 1: 核心基础（MVP）
1. ✅ 数据模型定义
2. ✅ 数据库表结构
3. ⏳ 基础节点类型（start, llm, end）
4. ⏳ 简单的变量系统
5. ⏳ 基本的执行引擎

### Phase 2: 核心功能
1. ⏳ 更多节点类型（tool, condition）
2. ⏳ 完整的变量系统
3. ⏳ 错误处理和重试
4. ⏳ 流式输出
5. ⏳ 执行状态管理

### Phase 3: 高级功能
1. ⏳ 复杂控制流（循环、条件分支）
2. ⏳ 节点类型扩展机制
3. ⏳ 工作流模板系统
4. ⏳ 性能优化
5. ⏳ 调试和测试工具

### Phase 4: 用户体验
1. ⏳ 可视化编辑器
2. ⏳ 工作流市场/模板库
3. ⏳ 版本管理和回滚
4. ⏳ 权限和访问控制

---

## 九、需要确认的问题

1. **节点类型优先级**：哪些节点类型是必须的？哪些可以后续添加？
2. **变量系统复杂度**：是否需要支持函数调用、条件表达式等高级特性？
3. **错误处理策略**：默认的错误处理策略是什么？
4. **性能要求**：工作流的执行时间要求？是否需要支持长时间运行的工作流？
5. **扩展方式**：用户如何扩展节点类型？通过代码还是配置？
6. **可视化需求**：是否需要前端可视化编辑器？还是先支持 JSON 配置？
7. **版本管理**：是否需要完整的版本历史？还是简单的版本号即可？

---

请讨论以上问题，确认设计方向后再开始实现。
