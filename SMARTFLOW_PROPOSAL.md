# SMARTFLOW 设计方案

## 一、概述

**Smartflow** 是一个专注于 **AI 内容生成输出**的工作流引擎，为 mxmai 平台提供灵活、强大的流水线编排能力。与 Dify.ai 等通用工作流平台不同，Smartflow 专注于生成多种类型的输出（文本、图片、视频、音频、混合内容），并提供简洁、用户友好的 JSON 配置方式。

## 二、核心能力

- **Smartflow 定义与管理**：支持 JSON 格式的工作流定义，扁平化配置
- **多类型输出支持**：text、image、video、sound、embedding
- **任务执行与追踪**：完整的执行链记录和节点输出追踪
- **节点类型丰富**：start、model、tools、formatter、recall、condition、end
- **模型集成**：通过 Gateway 调用 mxmcgi 服务
- **工具执行器**：统一的工具执行接口，支持搜索、爬虫等
- **知识库召回**：支持向量、关键词、混合检索

## 三、数据模型

### 3.1 Smartflow 定义

```typescript
interface Smartflow {
  id: string;
  name: string;
  schema: SmartflowSchema;
  description?: string;
  category?: string;
  status?: 'active' | 'inactive' | 'draft';
  author_id?: string;
  is_public?: boolean;
}
```

### 3.2 SmartflowSchema

```typescript
interface SmartflowSchema {
  nodes: SmartflowNode[];
  edges: SmartflowEdge[];
  version?: string;
  variables?: Record<string, any>;
  settings?: {
    timeout?: number;
    retry_count?: number;
    error_handling?: 'stop' | 'continue' | 'retry';
  };
}
```

## 四、节点类型

| 节点类型 | 说明 | 必需 |
|---------|------|------|
| `start` | 开始节点，定义输入和预期输出 | ✅ |
| `model` | 模型节点，调用 AI 模型 | - |
| `tools` | 工具节点，执行搜索/爬虫等 | - |
| `formatter` | 格式化节点，Prompt 模板 | - |
| `recall` | 召回节点，知识库检索 | - |
| `condition` | 条件节点，分支逻辑 | - |
| `end` | 结束节点，验证输出 | ✅ |

## 五、变量系统

使用 `{{scope.field}}` 语法：

- `{{input.xxx}}` - 用户输入
- `{{nodeId.field}}` - 节点输出
- `{{variables.xxx}}` - 全局变量

## 六、API 接口

### Smartflow CRUD

- `GET /api/v1/smartflows` - 获取列表
- `GET /api/v1/smartflows/:id` - 获取详情
- `POST /api/v1/smartflows` - 创建
- `PUT /api/v1/smartflows/:id` - 更新
- `DELETE /api/v1/smartflows/:id` - 删除
- `POST /api/v1/smartflows/:id/execute` - 执行

### Task 管理

- `GET /api/v1/smartflow-tasks` - 任务列表
- `GET /api/v1/smartflow-tasks/:id` - 任务详情

## 七、实现状态

✅ 已完成：
- 核心数据模型
- 变量解析器
- 节点执行器（start/model/formatter/condition/tools/end）
- 执行引擎
- REST API
- 内存仓库（开发/测试用）
- 预定义工作流（摄影分析 V2）

待实现：
- Supabase 仓库（生产环境）
- Loop 循环节点
- Recall 召回节点（专业实现）
- SSE 流式输出
- 代码沙箱（自定义工具）
