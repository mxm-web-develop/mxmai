# SmartFlow 功能方案文档

> **版本**: v1.1  
> **日期**: 2026-04-03  
> **更新说明**: 新增第13章「v2业务线自动化生成与优化」及第14章「其他业务线扩展示例」  
> **状态**: 待评审  

---

## 1. 项目概述

### 1.1 背景

当前系统的 `text scope`（文本处理单元）承担了所有基于大语言模型的文本处理需求，包括对话、写作、推理等。但随着业务场景的多元化，单一的文本处理模式已无法满足灵活组合、可复用、可扩展的业务需求。

例如：
- 用户需要一个 "先搜索，再思考，最后格式化输出" 的复杂流程
- 需要将 "think"（推理）、"search"（搜索）、"plan"（规划）、"format"（格式化）等功能自由组合
- 不同业务场景需要不同的默认组合，但同时支持用户自定义
- 需要能够接入第三方应用功能（如地图、数据库查询、API调用等）

### 1.2 目标

**SmartFlow** 是一个可配置、可组合、可扩展的文本处理流程框架：

1. **功能模块化**: 将文本处理能力拆分为独立的业务功能单元（Think、Search、Plan、Format 等）
2. **流程可编排**: 支持通过配置文件或 API 自由组合功能模块，形成处理流程
3. **双向数据流**: 支持上游结果流向下游，下游也可回调上游
4. **扩展性强**: 不仅限于文本模型，可接入任意第三方应用功能
5. **开箱即用**: 提供常用业务场景的默认流程配置

### 1.3 适用范围

- AI 对话增强（先推理再回答）
- 复杂任务处理（搜索 → 思考 → 规划 → 执行 → 格式化）
- 多步骤内容生成（构思 → 写作 → 审核 → 格式化）
- 第三方服务集成（LLM + 外部 API + 数据库等）

---

## 2. 核心概念

### 2.1 名词定义

| 名词 | 定义 |
|------|------|
| **Scope** | 文本处理的作用域，类似于 `writing scope`，但更细分 |
| **Business Function（业务功能）** | 独立的功能模块，如 Think、Search、Plan、Format |
| **Flow（流程）** | 由多个业务功能按顺序或条件组成的完整处理链路 |
| **Step（步骤）** | Flow 中的单个执行单元 |
| **Connector（连接器）** | 连接两个 Step 的数据传递通道 |
| **Extension（扩展）** | 接入第三方应用功能的适配层 |

### 2.2 业务功能类型

| 功能标识 | 名称 | 说明 | 内置/扩展 |
|----------|------|------|------------|
| `think` | 思考推理 | 调用 LLM 进行深度推理、反思、分析 | 内置 |
| `search` | 信息搜索 | 接入搜索引擎或知识库进行检索 | 扩展 |
| `plan` | 任务规划 | 调用 LLM 生成任务步骤或行动计划 | 内置 |
| `format` | 格式化输出 | 按指定格式（JSON/Markdown/HTML等）整理输出 | 内置 |
| `analyze` | 数据分析 | 分析结构化数据并生成结论 | 扩展 |
| `execute` | 命令执行 | 执行外部命令或 API 调用 | 扩展 |
| `memory` | 记忆存储 | 读写持久化存储（记忆、上下文） | 扩展 |

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      SmartFlow Engine                        │
├─────────────────────────────────────────────────────────────┤
│  Flow Executor                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Step 1  →  Step 2  →  Step 3  →  Step 4  →  ...       │ │
│  │  (Think)    (Search)    (Plan)     (Format)            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Connector (数据传递通道)                     │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Business Function Registry (业务功能注册表)                    │
│  ┌──────────┬──────────┬──────────┬──────────┐               │
│  │  Think   │  Search  │   Plan  │  Format  │  ...         │
│  └──────────┴──────────┴──────────┴──────────┘               │
├─────────────────────────────────────────────────────────────┤
│  Extension Adapter (扩展适配层)                               │
│  ┌──────────┬──────────┬──────────┬──────────┐               │
│  │  Webhook │ Database │   API    │  File    │  ...         │
│  └──────────┴──────────┴──────────┴──────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 模块职责

| 模块 | 职责 |
|------|------|
| **FlowExecutor** | 流程执行引擎，负责解析流程定义、调度步骤、处理异常 |
| **BusinessFunction** | 业务功能的抽象基类，定义标准接口 |
| **Connector** | 数据连接器，负责步骤间的数据传递和转换 |
| **ExtensionAdapter** | 扩展适配器，将外部服务转换为标准 Function 接口 |
| **FlowRegistry** | 流程注册表，管理所有可用流程定义 |
| **ContextManager** | 上下文管理器，维护整个 Flow 的执行状态和数据 |

### 3.3 核心接口设计

#### 3.3.1 BusinessFunction 基类

```typescript
interface BusinessFunctionConfig {
  /** 功能唯一标识 */
  id: string;
  /** 功能类型 */
  type: 'think' | 'search' | 'plan' | 'format' | 'write' | 'analyze' | 'execute' | 'memory' | 'custom';
  /** 功能名称（人类可读） */
  name: string;
  /** 功能描述 */
  description: string;
  /** 输入模式 */
  inputSchema: JSONSchema;
  /** 输出模式 */
  outputSchema: JSONSchema;
  /** 是否内置 */
  builtIn: boolean;
  /** 扩展类型（仅非内置功能） */
  adapterType?: 'webhook' | 'api' | 'database' | 'file' | 'custom';
}

interface BusinessFunctionContext {
  /** 当前步骤 ID */
  stepId: string;
  /** 流程实例 ID */
  flowId: string;
  /** 上一步的输出数据 */
  previousOutput?: any;
  /** 流程全局上下文 */
  flowContext: Record<string, any>;
  /** 用户配置参数 */
  config: Record<string, any>;
}

interface BusinessFunctionResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 元数据 */
  metadata?: {
    costUsd?: number;
    latencyMs?: number;
    model?: string;
    [key: string]: any;
  };
}

interface BusinessFunction {
  /** 执行功能 */
  execute(input: any, context: BusinessFunctionContext): Promise<BusinessFunctionResult>;
  
  /** 验证输入 */
  validateInput?(input: any): Promise<{ valid: boolean; errors?: string[] }>;
  
  /** 后处理 */
  postProcess?(output: any, context: BusinessFunctionContext): Promise<BusinessFunctionResult>;
}
```

#### 3.3.2 Flow 定义格式

```typescript
interface FlowDefinition {
  /** 流程唯一标识 */
  id: string;
  /** 流程名称 */
  name: string;
  /** 流程版本 */
  version: string;
  /** 流程描述 */
  description?: string;
  /** 流程分类 */
  category: 'reasoning' | 'generation' | 'analysis' | 'custom';
  /** 步骤列表 */
  steps: FlowStep[];
  /** 流程级别配置 */
  config?: {
    /** 超时时间（毫秒） */
    timeout?: number;
    /** 重试次数 */
    retryCount?: number;
    /** 是否启用缓存 */
    enableCache?: boolean;
  };
  /** 默认输入映射 */
  inputMapping?: Record<string, string>;
  /** 默认输出映射 */
  outputMapping?: Record<string, string>;
}

interface FlowStep {
  /** 步骤 ID（唯一） */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 功能类型 */
  functionType: string;
  /** 功能配置 */
  functionConfig: Record<string, any>;
  /** 输入映射（从上游何处获取输入） */
  inputFrom: {
    /** 数据来源：'input' | 'previous' | 'flowContext' | 'constant' */
    source: 'input' | 'previous' | 'flowContext' | 'constant';
    /** 来源键名 */
    key?: string;
    /** 常量值（当 source=constant 时） */
    value?: any;
  };
  /** 条件执行（可选） */
  condition?: {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'exists' | 'notExists';
    value: any;
  };
  /** 步骤配置 */
  config?: {
    /** 超时时间 */
    timeout?: number;
    /** 错误处理策略 */
    onError?: 'stop' | 'skip' | 'fallback';
    /**  fallback 步骤 ID */
    fallbackStepId?: string;
  };
}
```

---

## 4. 内置业务功能详解

### 4.1 Think（思考推理）

**功能描述**: 调用 LLM 进行深度推理、反思、分析。

**配置参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 指定模型，默认使用配置默认值 |
| `promptTemplate` | string | 是 | 思考引导模板 |
| `temperature` | number | 否 | 温度参数，默认 0.7 |
| `maxTokens` | number | 否 | 最大 token 数 |

**输入**: 任意问题或待分析内容  
**输出**: 推理过程和结论

**使用示例**:
```json
{
  "functionType": "think",
  "functionConfig": {
    "model": "deepseek-reasoner",
    "promptTemplate": "请仔细分析以下问题，从多个角度进行推理：\n{{input}}\n\n请先给出推理过程，再给出结论。",
    "temperature": 0.7,
    "maxTokens": 2000
  }
}
```

### 4.2 Search（信息搜索）

**功能描述**: 接入搜索引擎或知识库进行检索。

**配置参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `source` | string | 是 | 搜索源：'web' | 'knowledge' | 'database' |
| `queryTemplate` | string | 否 | 查询模板 |
| `maxResults` | number | 否 | 最大结果数，默认 5 |
| `reRank` | boolean | 否 | 是否重排序 |

**输入**: 查询字符串或结构化查询  
**输出**: 搜索结果列表

### 4.3 Plan（任务规划）

**功能描述**: 调用 LLM 生成任务步骤或行动计划。

**配置参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 指定模型 |
| `planningType` | string | 否 | 规划类型：'sequential' | 'hierarchical' | 'conditional' |
| `stepCount` | number | 否 | 预估步骤数 |

**输入**: 目标描述  
**输出**: 分解后的任务步骤列表

### 4.4 Format（格式化输出）

**功能描述**: 按指定格式整理输出内容。

**配置参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `outputFormat` | string | 是 | 输出格式：'json' | 'markdown' | 'html' | 'xml' | 'custom' |
| `schema` | object | 否 | JSON Schema（当 format=json 时） |
| `template` | string | 否 | 自定义模板（当 format=custom 时） |
| `includeMetadata` | boolean | 否 | 是否包含元数据 |

**输入**: 任意内容  
**输出**: 按指定格式整理后的内容

### 4.5 Write（文本写作）

**功能描述**: 调用 LLM 进行文本生成或改写。

**配置参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 指定模型 |
| `writingType` | string | 否 | 写作类型：'generate' | 'rewrite' | 'summarize' | 'expand' |
| `style` | string | 否 | 写作风格 |
| `tone` | string | 否 | 语气 |

**输入**: 写作指令或原文（改写时）  
**输出**: 生成的文本

---

## 5. 扩展机制

### 5.1 Extension Adapter 架构

```
External Service → Extension Adapter → BusinessFunction Interface
```

### 5.2 内置扩展类型

#### 5.2.1 Webhook Adapter

用于调用外部 Webhook 或 HTTP API。

```typescript
interface WebhookAdapterConfig {
  /** Webhook URL */
  url: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体模板 */
  bodyTemplate?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retryCount?: number;
}
```

#### 5.2.2 Database Adapter

用于执行数据库查询。

```typescript
interface DatabaseAdapterConfig {
  /** 连接池名称 */
  poolName: string;
  /** SQL 模板 */
  sqlTemplate: string;
  /** 参数映射 */
  paramsMapping?: Record<string, string>;
}
```

#### 5.2.3 API Adapter

用于调用内部微服务 API。

```typescript
interface APIAdapterConfig {
  /** 服务名称 */
  service: string;
  /** API 路径 */
  path: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** 请求参数映射 */
  paramsMapping?: Record<string, string>;
}
```

### 5.3 自定义扩展开发

开发者可通过实现 `BusinessFunction` 接口来创建自定义功能：

```typescript
class MyCustomFunction implements BusinessFunction {
  readonly config: BusinessFunctionConfig = {
    id: 'my-custom-function',
    type: 'custom',
    name: '我的自定义功能',
    description: '这是一个自定义功能',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    builtIn: false,
    adapterType: 'custom'
  };

  async execute(input: any, context: BusinessFunctionContext): Promise<BusinessFunctionResult> {
    // 自定义逻辑
    return {
      success: true,
      data: { /* ... */ }
    };
  }
}
```

---

## 6. 流程配置示例

### 6.1 复杂推理流程

```json
{
  "id": "complex-reasoning",
  "name": "复杂推理流程",
  "version": "1.0.0",
  "category": "reasoning",
  "steps": [
    {
      "id": "step-1",
      "name": "搜索相关信息",
      "functionType": "search",
      "functionConfig": {
        "source": "web",
        "maxResults": 5
      },
      "inputFrom": {
        "source": "input",
        "key": "query"
      }
    },
    {
      "id": "step-2",
      "name": "深度思考分析",
      "functionType": "think",
      "functionConfig": {
        "model": "deepseek-reasoner",
        "promptTemplate": "基于以下搜索结果，请进行深入分析：\n{{searchResults}}\n\n原始问题：{{input}}\n\n请给出详细分析。"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data.results"
      },
      "condition": {
        "field": "searchResults",
        "operator": "exists"
      }
    },
    {
      "id": "step-3",
      "name": "生成行动计划",
      "functionType": "plan",
      "functionConfig": {
        "planningType": "sequential"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data.conclusion"
      }
    },
    {
      "id": "step-4",
      "name": "格式化输出",
      "functionType": "format",
      "functionConfig": {
        "outputFormat": "markdown",
        "includeMetadata": true
      },
      "inputFrom": {
        "source": "previous",
        "key": "data"
      }
    }
  ]
}
```

### 6.2 内容生成流程

```json
{
  "id": "content-generation",
  "name": "内容生成流程",
  "version": "1.0.0",
  "category": "generation",
  "steps": [
    {
      "id": "step-1",
      "name": "构思大纲",
      "functionType": "think",
      "functionConfig": {
        "promptTemplate": "请为以下主题生成文章大纲：\n{{input}}"
      },
      "inputFrom": {
        "source": "input",
        "key": "topic"
      }
    },
    {
      "id": "step-2",
      "name": "撰写正文",
      "functionType": "write",
      "functionConfig": {
        "writingType": "generate",
        "style": "professional",
        "tone": "informative"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data.outline"
      }
    },
    {
      "id": "step-3",
      "name": "格式化输出",
      "functionType": "format",
      "functionConfig": {
        "outputFormat": "markdown"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data.content"
      }
    }
  ]
}
```

---

## 7. API 设计

### 7.1 Flow 管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/smartflow/flows` | 创建流程 |
| `GET` | `/api/v1/smartflow/flows` | 列表查询 |
| `GET` | `/api/v1/smartflow/flows/:flowId` | 获取详情 |
| `PUT` | `/api/v1/smartflow/flows/:flowId` | 更新流程 |
| `DELETE` | `/api/v1/smartflow/flows/:flowId` | 删除流程 |
| `POST` | `/api/v1/smartflow/flows/:flowId/copy` | 复制流程 |

### 7.2 Flow 执行 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/smartflow/execute` | 执行流程 |
| `GET` | `/api/v1/smartflow/executions/:executionId` | 查询执行状态 |
| `POST` | `/api/v1/smartflow/executions/:executionId/cancel` | 取消执行 |

### 7.3 Function 管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/smartflow/functions` | 列表查询（内置+扩展） |
| `POST` | `/api/v1/smartflow/functions` | 注册自定义 Function |
| `DELETE` | `/api/v1/smartflow/functions/:functionId` | 删除自定义 Function |

### 7.4 执行请求示例

```json
POST /api/v1/smartflow/execute
{
  "flowId": "complex-reasoning",
  "input": {
    "query": "如何提高团队协作效率？"
  },
  "config": {
    "timeout": 60000,
    "enableCache": true
  }
}
```

### 7.5 执行响应示例

```json
{
  "executionId": "exec-uuid-xxx",
  "status": "completed",
  "result": {
    "data": {
      "formattedOutput": "## 分析报告\n\n### 1. 问题背景\n\n### 2. 分析过程\n\n### 3. 建议方案\n"
    }
  },
  "metadata": {
    "totalSteps": 4,
    "completedSteps": 4,
    "totalLatencyMs": 12500,
    "totalCostUsd": 0.035
  },
  "steps": [
    { "stepId": "step-1", "status": "completed", "latencyMs": 2100 },
    { "stepId": "step-2", "status": "completed", "latencyMs": 5800 },
    { "stepId": "step-3", "status": "completed", "latencyMs": 2200 },
    { "stepId": "step-4", "status": "completed", "latencyMs": 2400 }
  ]
}
```

---

## 8. 数据模型

### 8.1 Flow 实体

```typescript
interface FlowEntity {
  id: string;
  name: string;
  version: string;
  description?: string;
  category: string;
  definition: FlowDefinition;
  isSystem: boolean;       // 是否系统内置
  isPublic: boolean;        // 是否公开（用户可见）
  ownerId?: string;         // 拥有者 ID
  createdAt: Date;
  updatedAt: Date;
}
```

### 8.2 Execution 实体

```typescript
interface ExecutionEntity {
  id: string;
  flowId: string;
  userId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  stepResults: StepResult[];
  metadata: {
    totalLatencyMs: number;
    totalCostUsd: number;
    startedAt: Date;
    completedAt?: Date;
  };
  createdAt: Date;
}

interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  input: any;
  output?: any;
  error?: string;
  latencyMs: number;
  costUsd?: number;
}
```

### 8.3 Function 注册实体

```typescript
interface FunctionEntity {
  id: string;
  name: string;
  type: string;
  adapterType?: string;
  config: BusinessFunctionConfig;
  isSystem: boolean;
  ownerId?: string;
  createdAt: Date;
}
```

---

## 9. 实现计划

### Phase 1: 核心框架（预计 2 周）

| 任务 | 说明 | 预估时间 |
|------|------|----------|
| T1.1 | 设计并实现 FlowExecutor 核心引擎 | 3 天 |
| T1.2 | 实现 BusinessFunction 基类和注册机制 | 2 天 |
| T1.3 | 实现 ContextManager 上下文管理 | 1 天 |
| T1.4 | 实现 Connector 数据传递机制 | 1 天 |
| T1.5 | 单元测试和代码优化 | 2 天 |
| T1.6 | 编写核心模块 API 文档 | 1 天 |

### Phase 2: 内置功能开发（预计 1.5 周）

| 任务 | 说明 | 预估时间 |
|------|------|----------|
| T2.1 | 实现 Think 功能 | 1 天 |
| T2.2 | 实现 Search 功能（接入搜索服务） | 1.5 天 |
| T2.3 | 实现 Plan 功能 | 1 天 |
| T2.4 | 实现 Format 功能 | 0.5 天 |
| T2.5 | 实现 Write 功能 | 1 天 |
| T2.6 | 集成现有 `runBasicText` 接口 | 0.5 天 |

### Phase 3: 扩展机制（预计 1 周）

| 任务 | 说明 | 预估时间 |
|------|------|----------|
| T3.1 | 实现 Webhook Adapter | 1 天 |
| T3.2 | 实现 Database Adapter | 1 天 |
| T3.3 | 实现 API Adapter | 1 天 |
| T3.4 | 设计并实现自定义 Function SDK | 1.5 天 |
| T3.5 | 扩展管理 API 开发 | 0.5 天 |

### Phase 4: Flow 管理与执行 API（预计 1.5 周）

| 任务 | 说明 | 预估时间 |
|------|------|----------|
| T4.1 | Flow CRUD API 开发 | 2 天 |
| T4.2 | Flow 执行 API 开发 | 2 天 |
| T4.3 | 执行状态查询与取消功能 | 1 天 |
| T4.4 | Flow 导入/导出功能 | 1 天 |

### Phase 5: 默认流程配置（预计 0.5 周）

| 任务 | 说明 | 预估时间 |
|------|------|----------|
| T5.1 | 预置常用业务流程 | 0.5 天 |

### Phase 6: 测试与上线准备（预计 1 周）

| 任务 | 说明 | 预估时间 |
|------|------|----------|
| T6.1 | 集成测试 | 2 天 |
| T6.2 | 性能测试 | 1 天 |
| T6.3 | 文档完善 | 1 天 |
| T6.4 | 部署与监控配置 | 1 天 |

---

## 10. 风险评估

| 风险 | 影响 | 概率 | 预案 |
|------|------|------|------|
| LLM 调用延迟影响整体流程体验 | 中 | 中 | 增加分步骤超时控制，支持异步执行模式 |
| 复杂流程配置易用性差 | 高 | 中 | 提供可视化 Flow 编辑器和预设模板 |
| 扩展机制安全风险 | 高 | 低 | 严格校验 Webhook URL，实施沙箱隔离 |
| 数据传递格式不统一 | 低 | 中 | 定义标准数据Schema，提供转换工具 |

---

## 11. 后续优化方向

1. **可视化 Flow 编辑器**: Web UI 拖拽式流程编排
2. **Flow 市场**: 用户可分享和发现优秀流程
3. **Flow 调试器**: 单步执行、状态查看、输入输出回放
4. **智能推荐**: 根据输入内容智能推荐合适的 Flow
5. **多语言支持**: Flow 描述和错误信息的国际化
6. **A/B 测试**: 支持 Flow 的流量分配测试

---

## 13. v2 业务线自动化生成与优化

### 13.1 背景与问题

当前 v2 业务流程采用「硬编码 Prompt + Schema」模式：

```
用户输入 → 固定 Prompt 模板 → LLM 处理 → 固定 Schema 解析 → 输出
```

**存在的问题**：

| 问题 | 影响 |
|------|------|
| Prompt 依赖人工经验 | 效果上限受限于 prompt 工程师能力 |
| 缺乏真实参考 | 生成的风格可能与用户预期不符 |
| 难以适配个性化需求 | 同一业务线无法满足不同用户的细微偏好 |
| 优化周期长 | 每次调优需要人工反复测试 |
| 无法自适应 | 用户风格变化时需要重新设计 prompt |

### 13.2 SmartFlow 如何解决

SmartFlow 通过「**智能分析 → 流程生成 → 效果优化**」三层架构，实现 v2 业务线的自动化生成与持续优化：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SmartFlow Business Optimizer                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│  │   业务理解    │ →  │   流程生成    │ →  │   效果优化   │             │
│  │  (Analyze)   │    │  (Generate)  │    │ (Optimize)   │             │
│  └──────────────┘    └──────────────┘    └──────────────┘             │
│         ↑                   ↑                   ↑                     │
│         │                   │                   │                     │
│         ▼                   ▼                   ▼                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│  │  风格数据库   │    │  流程模板库   │    │  反馈闭环    │             │
│  │  (Style DB)  │    │ (Flow Tmpl)  │    │ (Feedback)  │             │
│  └──────────────┘    └──────────────┘    └──────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.3 核心能力

#### 13.3.1 智能业务理解（Analyze）

SmartFlow 内置业务分析引擎，能够：

1. **解析用户意图**: 从用户输入中提取关键业务参数
2. **关联知识图谱**: 连接真实世界的风格、摄影师、作品数据库
3. **生成分析报告**: 输出结构化的风格特征描述

#### 13.3.2 自动化流程生成（Generate）

基于业务分析结果，自动生成定制化 SmartFlow：

1. **选择合适的业务功能组合**
2. **生成优化的 Prompt 模板**
3. **配置参数映射和转换规则**
4. **设置质量门禁和验收标准**

#### 13.3.3 持续效果优化（Optimize）

通过反馈闭环持续优化效果：

1. **收集用户反馈**: 评分、修改意见、使用数据
2. **分析效果差距**: 对比预期与实际输出
3. **调整流程参数**: Prompt、模型、权重等
4. **A/B 测试验证**: 验证优化效果

### 13.4 摄影业务线优化示例

#### 13.4.1 当前 v2 摄影业务流程（问题版本）

```
用户输入：
{
  "style": "日系小清新",
  "lens": "85mm f/1.4",
  "effect": "柔焦、逆光",
  "color": "低饱和、淡雅"
}

当前处理方式：
1. 直接用固定 Prompt 填充参数
2. "请生成一张日系小清新风格的摄影作品，使用85mm f/1.4镜头效果..."
3. 输出可能与真实日系摄影风格差距较大
```

**问题**：
- 「日系小清新」是一个模糊概念，不同人理解不同
- 缺乏对真实日系摄影师风格的研究
- 生成的图片可能缺乏真实的风格细节

#### 13.4.2 SmartFlow 优化后的摄影业务流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                  SmartFlow 摄影业务优化流程                           │
└─────────────────────────────────────────────────────────────────────┘

步骤 1: 风格理解与分析
┌─────────────────────────────────────────────────────────────────────┐
│ 输入：{ style: "日系小清新", lens: "85mm f/1.4", effect: "柔焦、逆光" } │
│                                                                     │
│ 业务功能：Think + Search                                              │
│                                                                     │
│ 执行：                                                                │
│ 1. Search("日系小清新摄影师 代表作品 风格特征")                        │
│ 2. Search("日系小清新 摄影构图 用光 色彩特点")                          │
│ 3. Think("分析搜索结果，提取风格关键特征")                             │
│                                                                     │
│ 输出：                                                                │
│ {                                                                      │
│   "styleFeatures": {                                                  │
│     "photographers": ["滨田英明", "川内伦子", "森山大道(早期)"],        │
│     "lighting": "柔和自然光，避免强烈直射，偏好阴天或窗边光",           │
│     "composition": "留白大量负空间，中心构图较少",                     │
│     "color": "低饱和度，灰色调主导，局部高饱和点缀",                    │
│     "mood": "宁静、治愈、日常诗意",                                   │
│     "characteristics": ["颗粒感", "略微过曝", "淡对比度"]              │
│   },                                                                  │
│   "lensAnalysis": {                                                   │
│     "focalLength": "85mm",                                            │
│     "effect": "柔和的背景虚化，突出人物或主体",                        │
│     "shootingDistance": "半身至特写"                                  │
│   }                                                                   │
│ }                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
步骤 2: 作品参考检索
┌─────────────────────────────────────────────────────────────────────┐
│ 业务功能：Search + Think                                               │
│                                                                     │
│ 执行：                                                                │
│ 1. Search("滨田英明 代表作品集")                                      │
│ 2. Search("日系小清新 摄影作品 集锦 高清")                              │
│ 3. Think("从作品中提取可复现的风格要素")                              │
│                                                                     │
│ 输出：                                                                │
│ {                                                                      │
│   "referenceWorks": [                                                  │
│     {                                                                  │
│       "title": "滨田英明《Haru和Mina》",                               │
│       "keyElements": ["儿童日常", "自然光", "高明度", "低饱和"]        │
│     },                                                                │
│     {                                                                  │
│       "title": "川内伦子《Ryula》",                                    │
│       "keyElements": ["日常物品特写", "轻微过曝", "静谧氛围"]          │
│     }                                                                 │
│   ],                                                                  │
│   "actionablePrompts": [                                              │
│     "使用自然柔光，避免强烈阴影",                                       │
│     "增加画面留白，约占30-40%",                                        │
│     "饱和度降低15-20%，提高明度",                                      │
│     "轻微的颗粒感处理",                                                │
│     "85mm f/1.4 营造柔和虚化背景"                                      │
│   ]                                                                   │
│ }                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
步骤 3: 生成增强版 Prompt
┌─────────────────────────────────────────────────────────────────────┐
│ 业务功能：Think + Format                                               │
│                                                                     │
│ 执行：                                                                │
│ Think("将风格分析结果转化为图像生成 Prompt")                           │
│ Format("输出标准化 Prompt 格式")                                       │
│                                                                     │
│ 输出：                                                                │
│ {                                                                      │
│   "enhancedPrompt": "Japanese light (shōshō) style photograph,      │
│     soft natural window lighting, slightly overexposed,              │
│     desaturated pastel colors with gray undertones,                   │
│     ample negative space (30-40% of frame),                           │
│     85mm f/1.4 lens shallow depth of field, soft bokeh background,    │
│     serene and contemplative mood, subtle film grain texture,         │
│     everyday scene with poetic stillness,                            │
│     shot on 35mm film aesthetic,                                     │
│     high key exposure with soft contrast"                             │
│ }                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
步骤 4: 图像生成
┌─────────────────────────────────────────────────────────────────────┐
│ 业务功能：Write (图像生成)                                             │
│                                                                     │
│ 执行：                                                                │
│ 使用增强后的 Prompt 调用图像生成模型                                    │
│                                                                     │
│ 输出：                                                                │
│ {                                                                      │
│   "imageUrl": "https://...",                                          │
│   "metadata": {                                                        │
│     "prompt": "enhancedPrompt",                                        │
│     "styleSource": ["滨田英明", "川内伦子"],                           │
│     "generationParams": { ... }                                       │
│   }                                                                   │
│ }                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
步骤 5: 效果追踪与优化（异步）
┌─────────────────────────────────────────────────────────────────────┐
│ 业务功能：Memory + Analyze                                             │
│                                                                     │
│ 执行：                                                                │
│ 1. Memory("记录本次生成的用户反馈评分")                                │
│ 2. Analyze("对比风格参考与实际输出，优化下次 Prompt")                   │
│                                                                     │
│ 输出：                                                                │
│ {                                                                      │
│   "feedbackLoop": {                                                   │
│     "userRating": 4.5/5,                                              │
│     "styleMatchScore": 0.92,                                          │
│     "optimizationSuggestion": "下次可增加'儿童'元素..."               │
│   }                                                                   │
│ }                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 13.4.3 效果对比

| 维度 | 当前 v2 流程 | SmartFlow 优化后 |
|------|-------------|------------------|
| Prompt 质量 | 依赖人工编写，风格模糊 | 基于真实摄影师/作品分析，细节丰富 |
| 风格准确性 | 约 60-70% 匹配度 | 目标 90%+ 匹配度 |
| 用户满意度 | 需多次调整 | 一次生成质量更高 |
| 优化成本 | 人工反复测试 | 自动反馈闭环 |
| 扩展性 | 难以适配新风格 | 可快速接入新风格库 |

### 13.5 自动化生成流程配置示例

以下是一个自动生成的摄影业务 SmartFlow 完整配置：

```json
{
  "id": "photography-style-generation",
  "name": "摄影风格智能生成流程",
  "version": "2.0.0",
  "category": "business-v2",
  "autoGenerated": true,
  "description": "基于用户风格描述，自动检索参考作品并生成增强 Prompt",
  
  "steps": [
    {
      "id": "step-1",
      "name": "解析用户风格输入",
      "functionType": "think",
      "functionConfig": {
        "model": "glm-4-plus",
        "promptTemplate": "从用户的摄影风格描述中提取关键参数：\n输入：{{input}}\n\n请结构化输出：\n1. 风格类型（如有）\n2. 镜头参数\n3. 效果描述\n4. 色彩倾向\n5. 氛围关键词"
      },
      "inputFrom": {
        "source": "input",
        "key": "userDescription"
      }
    },
    {
      "id": "step-2",
      "name": "检索风格摄影师与作品",
      "functionType": "search",
      "functionConfig": {
        "source": "knowledge", 
        "maxResults": 5,
        "searchType": "styleReference"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data.styleType"
      }
    },
    {
      "id": "step-3",
      "name": "深度风格分析",
      "functionType": "think",
      "functionConfig": {
        "model": "deepseek-reasoner",
        "promptTemplate": "基于搜索到的摄影师和作品，分析并提取可复现的风格要素：\n\n摄影师：{{photographers}}\n代表作品：{{works}}\n用户原始描述：{{userInput}}\n\n请输出：\n1. 光线特点（类型、方向、强度）\n2. 构图特点（留白、构图法、视角）\n3. 色彩特点（饱和度、色调、明度）\n4. 氛围关键词\n5. 技术参数建议"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data"
      }
    },
    {
      "id": "step-4",
      "name": "生成增强 Prompt",
      "functionType": "think",
      "functionConfig": {
        "model": "glm-4-plus",
        "promptTemplate": "将风格分析结果转化为图像生成 Prompt：\n\n风格分析：{{styleAnalysis}}\n镜头参数：{{lensParams}}\n用户效果要求：{{effects}}\n\n要求：\n1. 使用英文 Prompt\n2. 包含摄影术语\n3. 保留核心风格要素\n4. 添加技术参数（焦距、光圈等）"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data"
      }
    },
    {
      "id": "step-5",
      "name": "格式化 Prompt 输出",
      "functionType": "format",
      "functionConfig": {
        "outputFormat": "json",
        "schema": {
          "type": "object",
          "properties": {
            "enhancedPrompt": { "type": "string" },
            "negativePrompt": { "type": "string" },
            "generationParams": {
              "type": "object",
              "properties": {
                "steps": { "type": "number" },
                "guidanceScale": { "type": "number" },
                "seed": { "type": "number" }
              }
            }
          }
        }
      },
      "inputFrom": {
        "source": "previous",
        "key": "data.generatedPrompt"
      }
    },
    {
      "id": "step-6",
      "name": "记录生成上下文",
      "functionType": "memory",
      "functionConfig": {
        "operation": "store",
        "collection": "generationHistory",
        "ttl": "30d"
      },
      "inputFrom": {
        "source": "previous",
        "key": "data"
      }
    }
  ],
  
  "outputMapping": {
    "finalPrompt": "step-5.output.enhancedPrompt",
    "negativePrompt": "step-5.output.negativePrompt",
    "styleSource": "step-3.data.photographers"
  }
}
```

### 13.6 通用 v2 业务线生成框架

SmartFlow 提供通用的 v2 业务线生成模板，可适配不同行业：

```typescript
interface BusinessFlowGeneratorConfig {
  /** 业务类型 */
  businessType: 'photography' | 'writing' | 'design' | 'music' | 'video';
  
  /** 用户输入字段 */
  inputFields: {
    name: string;
    type: 'string' | 'select' | 'multiSelect';
    options?: string[];  // 如果是 select 类型
    required: boolean;
  }[];
  
  /** 风格参考数据源 */
  styleReferenceSource: {
    type: 'database' | 'api' | 'web';
    endpoint: string;
    queryTemplate: string;
  };
  
  /** Prompt 生成配置 */
  promptGeneration: {
    baseTemplate: string;
    styleInjections: string[];
    technicalParams: string[];
  };
  
  /** 质量门禁 */
  qualityGates: {
    minStyleMatchScore: number;
    requireHumanReview: boolean;
    autoRetryOnFailure: boolean;
  };
}

/**
 * 通用 v2 业务线生成器
 * 
 * 输入：业务配置（输入字段、风格库、Prompt模板）
 * 输出：完整的 SmartFlow 配置
 */
async function generateBusinessFlow(
  config: BusinessFlowGeneratorConfig
): Promise<FlowDefinition> {
  // 1. 解析用户输入 → 结构化参数
  // 2. 检索风格参考 → 真实案例数据
  // 3. 分析风格要素 → 可复现特征
  // 4. 生成增强 Prompt → 结合技术与艺术
  // 5. 配置质量门禁 → 确保输出质量
  // 6. 返回完整 Flow 配置
}
```

### 13.7 反馈优化闭环

```
┌─────────────────────────────────────────────────────────────────────┐
│                      效果优化反馈闭环                                 │
└─────────────────────────────────────────────────────────────────────┘

     ┌───────────────┐
     │   用户输入     │
     │ (风格描述)     │
     └───────┬───────┘
             │
             ▼
     ┌───────────────┐     ┌───────────────┐
     │   流程生成     │────→│   图像生成     │
     └───────────────┘     └───────┬───────┘
                                   │
                                   ▼
                           ┌───────────────┐
                           │   用户反馈     │
                           │ (评分/修改)    │
                           └───────┬───────┘
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
               ▼                   ▼                   ▼
     ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
     │  高分处理     │     │  中分优化     │     │  低分重做     │
     │  (记录成功)   │     │  (分析原因)   │     │  (从头开始)   │
     └───────┬───────┘     └───────┬───────┘     └───────────────┘
             │                   │
             ▼                   ▼
     ┌───────────────┐     ┌───────────────┐
     │  加入成功案例库 │     │  优化 Prompt  │
     │  (正向强化)    │     │  (针对性调整)  │
     └───────────────┘     └───────────────┘
             │                   │
             └─────────┬─────────┘
                       │
                       ▼
             ┌───────────────┐
             │  更新 Flow    │
             │  参数配置     │
             └───────────────┘
```

### 13.8 效果衡量指标

| 指标 | 定义 | 目标值 |
|------|------|--------|
| **Style Match Score** | 生成结果与目标风格的匹配度（0-1） | ≥ 0.90 |
| **User Satisfaction Rate** | 用户满意度评分（1-5） | ≥ 4.5 |
| **One-shot Success Rate** | 一次生成成功率（无需修改） | ≥ 80% |
| **Optimization Cycles** | 从首次生成到满意所需的平均调整次数 | ≤ 2 |
| **Flow Reuse Rate** | 流程复用率（相似输入使用已有流程） | ≥ 70% |

---

## 14. 其他业务线扩展示例

### 14.1 写作业务线

**当前 v2**：用户选择「小说/文案/诗歌」→ 固定 Prompt → 生成

**SmartFlow 优化**：
1. 分析目标读者群体和用途
2. 检索同类型优秀作品（可商用）
3. 提取风格要素（叙事节奏、用词风格、结构）
4. 生成增强 Prompt，结合写作技巧
5. 反馈优化，迭代改进

### 14.2 设计业务线

**当前 v2**：用户选择「Logo/海报/UI」→ 固定 Prompt → 生成

**SmartFlow 优化**：
1. 分析品牌调性和设计需求
2. 检索同行业优秀设计案例
3. 提取设计要素（配色、排版、字体、构图）
4. 生成专业级 Design Prompt
5. 支持多版本对比和选择

### 14.3 音乐业务线

**当前 v2**：用户选择「风格/ BPM/ 乐器」→ 固定 Prompt → 生成

**SmartFlow 优化**：
1. 分析目标音乐风格和情绪
2. 检索同类型音乐作品特征
3. 提取音乐要素（和声、节奏、配器）
4. 生成专业级 Music Prompt
5. 支持风格迁移和混合

---

## 12. 附录

### 12.1 术语表

| 术语 | 英文 | 说明 |
|------|------|------|
| 流程编排 | Flow Orchestration | 将多个功能模块按逻辑组合的技术 |
| 业务功能 | Business Function | 具有独立业务意义的功能单元 |
| 函数调用 | Function Calling | LLM 调用外部函数的能力 |

### 12.2 参考资料

- [LangChain Expressions Language](https://python.langchain.com/docs/concepts/langchain_expression_language/)
- [Azure Logic Apps](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-overview)
- [AWS Step Functions](https://aws.amazon.com/step-functions/)

---

**文档作者**: SmartFlow PM Team  
**联系方式**: 待定
