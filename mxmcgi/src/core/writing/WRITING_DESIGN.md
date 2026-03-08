# Writing 模块设计文档

## 1. 设计目标

### 1.1 核心定位
- **基础写作生成模块**：专注于简单的文本生成和文档存储
- **扩展 text 模块**：复用 text 的 LLM 能力，增加格式化和存储功能
- **区别于复杂系统**：不与 Deep Agent 或 LangGraph 的复杂工作流竞争，专注于单次生成任务

### 1.2 核心功能
1. **智能模型选择**：系统自动选择适合的模型（大纲生成 vs 段落写作）
2. **文本生成**：调用 text 模块的 LLM 接口生成内容
3. **知识库集成**：支持调用知识库检索相关内容作为写作参考
4. **格式转换**：将生成的文本转换为 Markdown、TXT、PDF 格式
5. **文档存储**：将生成的文档存储到 MinIO（参考 graph/video 模块）
6. **文档读取**：支持从 MinIO 读取已存储的 Markdown/TXT 文档
7. **任务追踪**：除了使用传统stream文本输出，也要支持统一的 CGI 任务系统进行异步处理

## 2. 架构设计

### 2.1 模块结构

```
mxmcgi/src/core/writing/
├── index.ts                    # 模块导出
├── writing-service.ts           # 核心服务：文本生成 + 格式转换 + 存储
├── document-formatter.ts        # 文档格式化器（Markdown/TXT/PDF）
├── model-selector.ts           # 模型选择器（根据 taskType 自动选择）
├── writing-task.ts             # 异步任务处理（类似 knowledge-task.ts）
└── WRITING_DESIGN.md           # 设计文档
```

### 2.2 与现有模块的关系

```
┌─────────────┐
│   Gateway   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│         Writing Route                │
│  POST /writing/:modelName            │
└──────┬──────────────────────────────┘
       │
       ├──► 创建 CGI 任务 (type: 'writing')
       │
       ▼
┌─────────────────────────────────────┐
│      Writing Service                 │
│  ┌──────────────────────────────┐   │
│  │ 1. 调用 Text 模块生成文本     │   │
│  │ 2. 格式化文档 (Markdown/TXT) │   │
│  │ 3. 转换为 PDF (可选)          │   │
│  │ 4. 存储到 MinIO                │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
       │
       ├──► Text Module (LLM 生成)
       ├──► Document Formatter (格式转换)
       └──► MinIO Storage (文档存储)
```

## 3. 接口设计

### 3.1 API 接口

#### 3.1.1 生成文档（异步任务）

```http
POST /api/v1/writing/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "写一篇关于人工智能的文章",
  "taskType": "outline",  // "outline" | "paragraph" | "full" - 任务类型（系统自动选择模型）
  "outputFormat": "markdown",  // "markdown" | "txt" | "pdf"
  "title": "AI 技术发展",        // 可选，文档标题
  "metadata": {                 // 可选，文档元数据
    "author": "用户A",
    "tags": ["AI", "技术"]
  },
  "previousTaskId": "task_xxx",  // 可选，引用之前的任务（用于改写/润色）
  "previousContent": "...",      // 可选，直接传递之前的文本（用于改写/润色）
  "operation": "generate",        // 可选，"generate" | "rewrite" | "polish"
  "knowledgeBase": {             // 可选，知识库集成
    "knowledgeBaseId": "kb_xxx", // 知识库 ID
    "query": "人工智能的发展历史", // 搜索问题
    "searchType": "hybrid",       // "vector" | "keyword" | "hybrid"（默认 hybrid）
    "limit": 5                    // 返回的相关文档数量（默认 5）
  },
  "storeToMinio": true,         // 是否存储到 MinIO（默认 true）
  "storageConfig": {            // 可选，自定义存储配置
    "bucket": "user-documents",
    "pathTemplate": "{userId}/writing/{timestamp}-{randomId}.{ext}"
  },
  // ... 其他 LLM 参数（temperature, max_tokens 等）
}
```

#### 3.1.4 口播稿（voice-scripts）输出格式说明

- voice-scripts 类型：默认输出为纯文本（txt），不使用任何 Markdown 语法。
- 若需要为 TTS 增强“精确停顿/换气”，可在请求中传入：
  - writing_type: "voice-scripts"
  - format: "tts"

TTS 精确停顿标签：
- 格式：<#x#>
- x = 停顿秒数（0.01～99.99，最多两位小数）
- 约束：必须放在两个可发音文本之间；不能在开头/结尾；不能连续多个标签

示例（text 字段直接可用）：
你好，<#0.8#>今天天气真不错啊，<#1.5#>我们出去走走吧？

**注意**：
- 不再需要用户指定 `:modelName`，系统根据 `taskType` 自动选择模型
- `taskType` 说明：
  - `outline`: 制定写作大纲（使用逻辑性强的模型，如 `claude-4.5-sonnet` 或 `gemini-3-pro`）
  - `paragraph`: 段落写作（使用流畅性强的模型，如 `gpt-5-nano` 或 `gemini-2-5-flash`）
  - `full`: 完整文章生成（先大纲后段落，或使用综合能力强的模型）

**响应：**
```json
{
  "success": true,
  "data": {
    "taskId": "task_xxx",
    "status": "pending"
  }
}
```

#### 3.1.2 读取 MinIO 文档

```http
GET /api/v1/writing/document
Content-Type: application/json
Authorization: Bearer <token>

Query Parameters:
  bucket: string (必需) - MinIO 存储桶名称
  key: string (必需) - 文件键（路径）
```

**响应：**
```json
{
  "success": true,
  "data": {
    "content": "# 文档内容\n\n这是从 MinIO 读取的文档...",
    "format": "markdown",  // "markdown" | "txt"
    "metadata": {
      "contentType": "text/markdown",
      "size": 1234,
      "lastModified": "2024-01-01T00:00:00Z"
    }
  }
}
```

#### 3.1.3 查询任务状态

```http
GET /api/v1/cgi-tasks/:taskId
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "task_xxx",
    "type": "writing",
    "status": "completed",
    "progress": {
      "progress": 100,
      "logs": [
        "开始生成文本...",
        "文本生成完成",
        "格式化文档...",
        "文档已存储到 MinIO"
      ]
    },
    "result": {
      "mediaUrls": [],
      "storageInfo": {
        "keys": ["user-123/writing/1234567890-abc123.md"],
        "bucket": "user-documents",
        "urls": ["https://minio.example.com/user-documents/..."]
      },
      "metadata": {
        "format": "markdown",
        "title": "AI 技术发展",
        "wordCount": 1500,
        "fileSize": 4500
      }
    }
  }
}
```

### 3.2 核心接口定义

```typescript
// writing-service.ts
export interface WritingRequest {
  prompt: string;
  taskType?: 'outline' | 'paragraph' | 'full'; // 任务类型（系统自动选择模型）
  outputFormat?: 'markdown' | 'txt' | 'pdf';
  title?: string;
  metadata?: Record<string, any>;
  
  // 上下文记忆（用于改写和润色）
  previousTaskId?: string;        // 可选：引用之前的任务 ID，自动获取原文
  previousContent?: string;         // 可选：直接传递之前的文本内容
  operation?: 'generate' | 'rewrite' | 'polish'; // 操作类型：生成/改写/润色
  
  // 知识库集成
  knowledgeBase?: {
    knowledgeBaseId: string;      // 知识库 ID
    query: string;                 // 搜索问题
    searchType?: 'vector' | 'keyword' | 'hybrid'; // 搜索类型（默认 hybrid）
    limit?: number;                // 返回的相关文档数量（默认 5）
  };
  
  // LLM 参数
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  // ... 其他 LLM 参数
}

// 模型选择配置
export interface ModelSelectionConfig {
  outline: string[];    // 大纲生成模型列表（按优先级排序）
  paragraph: string[];  // 段落写作模型列表（按优先级排序）
  full: string[];       // 完整文章生成模型列表（按优先级排序）
}

export interface WritingResult {
  text: string;                    // 生成的原始文本
  formattedContent: string;         // 格式化后的内容
  format: 'markdown' | 'txt' | 'pdf';
  storageInfo?: {
    key: string;
    bucket: string;
    url: string;
  };
  metadata: {
    title?: string;
    wordCount: number;
    fileSize: number;
    [key: string]: any;
  };
}

// document-formatter.ts
export interface DocumentFormatter {
  formatToMarkdown(text: string, title?: string, metadata?: Record<string, any>): string;
  formatToTxt(text: string, title?: string, metadata?: Record<string, any>): string;
  formatToPdf(text: string, title?: string, metadata?: Record<string, any>): Promise<Buffer>;
}
```

## 4. 实现细节

### 4.1 工作流程

```
1. 用户请求 → POST /writing/generate
   ↓
2. 系统根据 taskType 自动选择模型
   ↓
3. 如果提供了 knowledgeBase，先搜索知识库获取相关内容
   ↓
4. 构建增强的 prompt（包含知识库内容）
   ↓
5. 创建 CGI 任务 (type: 'writing')
   ↓
6. 立即返回 taskId
   ↓
7. 后台异步执行：
   a. 调用 Text 模块生成文本（使用选定的模型）
   b. 根据 outputFormat 格式化文档
   c. 存储到 MinIO
   d. 更新任务状态和结果
   ↓
8. 用户通过 GET /cgi-tasks/:taskId 查询结果
```

### 4.2 模型选择逻辑

```typescript
// 默认模型配置（按优先级排序）
const MODEL_SELECTION: ModelSelectionConfig = {
  outline: [
    'claude-4.5-sonnet',  // 逻辑性强，结构化能力好
    'gemini-3-pro',       // 综合能力强
    'gpt-5-2'            // 备选
  ],
  paragraph: [
    'gpt-5-nano',        // 流畅性强，速度快
    'gemini-2-5-flash',  // 快速响应
    'qwen3-30b'          // 备选
  ],
  full: [
    'claude-4.5-sonnet', // 综合能力最强
    'gemini-3-pro',      // 备选
    'gpt-5-2'           // 备选
  ]
};

// 模型选择函数
function selectModel(taskType: 'outline' | 'paragraph' | 'full'): string {
  const candidates = MODEL_SELECTION[taskType];
  // 遍历候选模型，选择第一个可用的（通过 providerFactory 检查）
  for (const model of candidates) {
    if (isModelAvailable(model)) {
      return model;
    }
  }
  // 如果都不可用，使用默认模型
  return candidates[0];
}
```

### 4.3 知识库集成流程

```typescript
async function enhancePromptWithKnowledge(
  prompt: string,
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    searchType?: 'vector' | 'keyword' | 'hybrid';
    limit?: number;
  }
): Promise<string> {
  if (!knowledgeBase) {
    return prompt; // 无知识库，直接返回原 prompt
  }

  // 1. 搜索知识库
  const knowledgeService = new KnowledgeService();
  const searchResults = await knowledgeService.searchById({
    knowledgeBaseId: knowledgeBase.knowledgeBaseId,
    query: knowledgeBase.query,
    searchType: knowledgeBase.searchType || 'hybrid',
    limit: knowledgeBase.limit || 5,
  });

  // 2. 构建知识库上下文
  const knowledgeContext = searchResults
    .map((result, index) => {
      const content = 'content' in result ? result.content : result.content;
      return `[参考 ${index + 1}] ${content}`;
    })
    .join('\n\n');

  // 3. 增强 prompt
  return `基于以下知识库内容进行写作：

${knowledgeContext}

---
写作要求：
${prompt}`;
}
```

### 4.2 文档格式化

#### Markdown 格式
```markdown
# {title}

{metadata 信息（如果有）}

---

{生成的文本内容}
```

#### TXT 格式
```
{title}

{metadata 信息（如果有）}

---

{生成的文本内容}
```

#### PDF 格式
- 使用 `pdfkit` 或 `puppeteer` 生成 PDF
- 包含标题、元数据和正文
- 支持基本样式（字体、段落间距等）

### 4.3 存储策略

- **默认存储路径**：`{userId}/writing/{timestamp}-{randomId}.{ext}`
- **Bucket**：`user-documents`（或通过环境变量配置）
- **文件命名**：如果提供了 `title`，可以作为文件名的一部分
- **元数据**：在 MinIO 的 metadata 中存储文档信息（title, wordCount, format 等）

### 4.4 与 Writing 模型列表的集成

```typescript
// writing-service.ts
import { MODEL_MAP } from '../../routes/writing';

async function generateText(
  modelName: string,
  params: any,
  provider?: ProviderType
): Promise<string> {
  const model = MODEL_MAP[modelName];
  if (!model) {
    throw new Error(`Model ${modelName} not found`);
  }
  
  const result = await model.generate({
    ...params,
    outputFormat: 'json', // 强制使用 JSON 格式获取完整文本
  });
  
  return result.text || '';
}
```

## 5. 上下文记忆设计（改写和润色）

### 5.1 设计原则
- **不引入 LangChain Memory**：保持模块简洁，避免额外依赖
- **通过参数传递记忆**：简单直接，灵活可控
- **支持两种方式**：
  1. `previousTaskId`：自动从任务系统获取之前的生成内容
  2. `previousContent`：手动传递之前的文本内容

### 5.2 实现方案

#### 方案 A：通过 previousTaskId 自动获取（推荐）
```typescript
// 用户请求改写
POST /api/v1/writing/:modelName
{
  "prompt": "将这篇文章改写得更加生动有趣",
  "previousTaskId": "task_abc123",  // 引用之前的任务
  "operation": "rewrite"
}

// 系统自动处理：
// 1. 从任务系统获取 previousTaskId 的结果
// 2. 提取生成的文本内容
// 3. 将原文和改写指令组合成新的 prompt
// 4. 调用 LLM 生成改写后的内容
```

#### 方案 B：通过 previousContent 手动传递
```typescript
// 用户请求润色
POST /api/v1/writing/:modelName
{
  "prompt": "润色这篇文章，使其更加专业",
  "previousContent": "这是之前生成的文章内容...",
  "operation": "polish"
}

// 系统直接使用 previousContent，无需查询任务系统
```

### 5.3 Prompt 构建逻辑

```typescript
function buildPromptWithContext(
  prompt: string,
  previousContent?: string,
  operation?: 'generate' | 'rewrite' | 'polish'
): string {
  if (!previousContent) {
    return prompt; // 无上下文，直接返回原 prompt
  }

  const operationInstructions = {
    rewrite: '请基于以下原文进行改写：',
    polish: '请对以下文章进行润色，保持原意不变：',
    generate: '请参考以下内容：',
  };

  const instruction = operationInstructions[operation || 'generate'];
  
  return `${instruction}

原文：
${previousContent}

---
${prompt}`;
}
```

### 5.4 为什么不用 LangChain Memory？

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **参数传递** | ✅ 简单直接<br>✅ 无额外依赖<br>✅ 灵活可控<br>✅ 符合基础模块定位 | ❌ 需要手动管理上下文 | 基础写作模块 |
| **LangChain Memory** | ✅ 专业的记忆管理<br>✅ 支持多种记忆类型 | ❌ 增加复杂度<br>❌ 引入额外依赖<br>❌ 可能过度设计 | 复杂 Agent 系统 |

**结论**：Writing 模块作为基础生成模块，应该保持简洁。改写和润色是常见的单次操作，通过参数传递上下文即可满足需求。复杂的多轮对话和状态管理应该交给 Deep Agent / LangGraph 等复杂系统。

## 6. 与复杂系统的区分

### 6.1 Writing 模块（基础生成）
- ✅ 单次生成任务
- ✅ 简单的提示词输入
- ✅ 直接格式化和存储
- ✅ 支持改写/润色（通过参数传递上下文）
- ✅ 无复杂工作流
- ✅ 无多轮对话管理
- ✅ 无外部工具调用

### 6.2 Deep Agent / LangGraph（复杂系统）
- ❌ 多步骤工作流
- ❌ 多轮对话和上下文管理（使用 LangChain Memory）
- ❌ 外部工具和 API 调用
- ❌ 条件分支和循环
- ❌ 复杂的状态管理

## 7. 技术栈

- **文本生成**：复用 `text` 模块的 LLM 接口
- **模型选择**：根据 `taskType` 自动选择最适合的模型（无需用户指定）
- **知识库集成**：使用 `KnowledgeService.searchById()` 检索相关内容
- **任务管理**：使用现有的 `TaskExecutor` 和 `TaskManager`
- **上下文获取**：通过 `TaskManager.getTask()` 获取之前的任务结果
- **文档读取**：使用 `RepositoryFactory.createStorageRepository().downloadFile()` 从 MinIO 读取文档
- **文档格式化**：
  - Markdown/TXT：字符串处理
  - PDF：`pdfkit` 或 `puppeteer`
- **存储**：使用 `RepositoryFactory.createStorageRepository()` 存储到 MinIO
- **记忆管理**：**不引入 LangChain Memory**，通过参数传递上下文

## 8. 文件结构

```
mxmcgi/src/
├── core/
│   └── writing/
│       ├── index.ts
│       ├── writing-service.ts
│       ├── document-formatter.ts
│       ├── writing-task.ts
│       └── WRITING_DESIGN.md
└── routes/
    └── writing.ts
```

## 9. 后续扩展（可选）

- 支持模板系统（预设的文档模板）
- 支持批量生成（一次生成多个文档）
- 支持文档版本管理
- 支持文档编辑和重新生成

## 10. 使用示例

### 10.1 生成新文章（带知识库）
```bash
POST /api/v1/writing/generate
{
  "prompt": "写一篇关于人工智能发展的文章，约1000字",
  "taskType": "full",
  "outputFormat": "markdown",
  "title": "AI 技术发展",
  "knowledgeBase": {
    "knowledgeBaseId": "kb_abc123",
    "query": "人工智能的发展历史和最新进展",
    "searchType": "hybrid",
    "limit": 5
  },
  "storeToMinio": true
}
```

### 10.2 制定写作大纲
```bash
POST /api/v1/writing/generate
{
  "prompt": "制定一篇关于机器学习的技术文章大纲",
  "taskType": "outline",
  "outputFormat": "markdown",
  "title": "机器学习技术文章大纲",
  "knowledgeBase": {
    "knowledgeBaseId": "kb_abc123",
    "query": "机器学习的核心概念和应用",
    "limit": 3
  }
}
```

### 10.3 段落写作
```bash
POST /api/v1/writing/generate
{
  "prompt": "写一段关于深度学习的介绍，约300字",
  "taskType": "paragraph",
  "outputFormat": "markdown"
}
```

### 10.4 改写文章（通过 previousTaskId）
```bash
POST /api/v1/writing/generate
{
  "prompt": "根据大纲完成这篇口播新闻稿的写作",
  "outlines":[{uid:'111',},['b1','b2']],
  "taskType": "paragraph",
  "previous_content": “文字少的时候用string”，
  "previous_task":"内容多的时候用taskid",
#   输出统一是string,这里的storage_form是用于存储到minio的文件格式
  "storage_form": "markdown", 
  "storeToMinio": true,
  "metadata":{},
  "knowledgeBase": [{
    "knowledgeBaseId": "kb_abc123",
    "query": "机器学习的核心概念和应用",
    "limit": 3,
    "relate"
  }]
}
```

### 10.5 读取 MinIO 文档
```bash
GET /api/v1/writing/document?bucket=user-documents&key=user-123/writing/1234567890-abc123.md
```

### 10.6 润色文章（通过 previousContent）
```bash
POST /api/v1/writing/generate
{
  "prompt": "润色这篇文章，使其更加专业和流畅",
  "taskType": "paragraph",
  "previousContent": "这是之前生成的文章内容...",
  "operation": "polish",
  "outputFormat": "markdown",
  "storeToMinio": true
}
```

## 11. 注意事项

1. **保持简洁**：专注于基础功能，避免过度设计
2. **复用现有**：充分利用 text 模块和任务系统
3. **模型选择**：系统自动选择模型，用户无需关心底层实现
4. **知识库集成**：知识库内容作为上下文增强 prompt，不改变核心生成逻辑
5. **存储优化**：大文档自动存储到 MinIO，避免 base64
6. **错误处理**：完善的错误处理和任务状态更新
7. **文档读取**：读取 MinIO 文档时需要进行权限校验（只能读取自己的文档）

