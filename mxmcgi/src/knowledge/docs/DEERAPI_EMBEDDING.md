# DeerAPI Embedding 接口对接说明

## 概述

知识库模块使用 DeerAPI 的 embedding 接口生成文本向量。DeerAPI 支持 OpenAI 兼容的 `/v1/embeddings` 接口。

## 支持的模型

根据 DeerAPI 文档，支持的 embedding 模型包括：

- `text-embedding-3-small`（默认，1536 维）
- `text-embedding-3-large`（3072 维）

## 配置

### 环境变量

```bash
# DeerAPI 基础配置
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=sk-xxxxx

# 可选：渠道分组（从 DeerAPI 控制台获取）
DEERAPI_GROUP=default  # 或 "官方原价"、"企业" 等

# 可选：默认 embedding 模型
EMBEDDING_MODEL=text-embedding-3-small
```

### 渠道分组说明

DeerAPI 支持多个渠道分组，不同分组可能有不同的价格：

- `default`：通用分组，基本所有模型都走这个分组（推荐）
- `官方原价`：官方原价渠道
- `企业`：企业渠道
- 其他自定义分组

**注意**：如果遇到 "所有令牌分组 default 下对于模型 XXX 均无可用渠道" 的错误，需要：
1. 在 DeerAPI 控制台配置分组
2. 设置 `DEERAPI_GROUP` 环境变量为你的分组名称

## 使用方式

### 1. 在 EmbeddingService 中使用

```typescript
import { EmbeddingService } from '@mxmai/mxmcgi/core/knowledge/embedding';

// 从环境变量创建（自动使用 DEERAPI_GROUP）
const embeddingService = EmbeddingService.fromEnv();

// 生成单个文本的 embedding
const embedding = await embeddingService.embedQuery('文本内容');

// 批量生成 embedding
const embeddings = await embeddingService.embedBatch(['文本1', '文本2']);
```

### 2. 直接使用 DeerAPIClient

```typescript
import { DeerAPIClient } from '@mxmai/mxmcgi/core/utils/deerapi-client';

const client = DeerAPIClient.fromEnv();

// 调用 embeddings 接口
const result = await client.embeddings({
  input: '文本内容',
  model: 'text-embedding-3-small',
});

// result.data[0].embedding 包含向量数组
```

## 实现细节

### DeerAPIClient.embeddings()

```typescript
async embeddings(request: {
  input: string | string[];
  model?: string;
}): Promise<EmbeddingResponse>
```

**特点**：
- 支持单个文本或文本数组
- 自动使用配置的 `group` 参数
- 兼容 OpenAI embeddings API 格式

### EmbeddingService

```typescript
class EmbeddingService {
  // 使用 DeerAPIClient 调用 DeerAPI
  async embed(input: string | string[]): Promise<EmbeddingResponse>
  
  // 生成单个文本的 embedding
  async embedQuery(text: string): Promise<number[]>
  
  // 批量生成（自动分批处理）
  async embedBatch(texts: string[], batchSize?: number): Promise<number[][]>
}
```

## API 请求示例

### 请求

```http
POST https://api.deerapi.com/v1/embeddings?group=default
Authorization: sk-xxxxx
Content-Type: application/json

{
  "input": "文本内容",
  "model": "text-embedding-3-small"
}
```

### 响应

```json
{
  "data": [
    {
      "embedding": [0.1, 0.2, 0.3, ...],  // 1536 维向量
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
```

## 价格参考

根据 DeerAPI 定价页面（以 `text-embedding-3-large` 为例）：

- **default 分组**：$0.13 / M Tokens（输入和输出）
- **官方原价分组**：$0.26 / M Tokens（输入和输出）

**注意**：实际价格以 DeerAPI 控制台显示为准。

## 错误处理

### 常见错误

1. **"所有令牌分组 default 下对于模型 XXX 均无可用渠道"**
   - 解决：设置 `DEERAPI_GROUP` 环境变量为有效的分组名称

2. **"DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置"**
   - 解决：确保环境变量已正确配置

3. **401 Unauthorized**
   - 解决：检查 `DEERAPI_API_KEY` 是否正确

## 最佳实践

1. **使用 default 分组**：除非有特殊需求，建议使用 `default` 分组
2. **批量处理**：使用 `embedBatch` 方法批量生成，自动分批处理
3. **模型选择**：
   - `text-embedding-3-small`：速度快，成本低，适合大多数场景
   - `text-embedding-3-large`：质量更高，但成本也更高
4. **错误重试**：在生产环境中，建议添加重试机制

## 与知识库集成

知识库模块在以下场景自动调用 embedding 接口：

1. **上传文件时**：自动为每个 chunk 生成 embedding
2. **搜索知识库时**：为查询文本生成 embedding 进行向量检索

无需手动调用，系统会自动处理。

