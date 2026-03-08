# Embedding 模块

## 概述

Embedding 模块提供统一的文本向量化接口，支持多个 provider（DeerAPI、OpenAI、Azure 等）和多种 embedding 模型。

## 架构设计

### Provider 模式

采用 Provider 模式，支持多种 embedding 服务提供商：

```
EmbeddingService (统一接口)
    ↓
EmbeddingProviderFactory (管理多个 provider)
    ↓
EmbeddingProvider (接口)
    ├── DeerEmbeddingProvider (DeerAPI)
    ├── OpenAIEmbeddingProvider (未来)
    └── AzureEmbeddingProvider (未来)
```

### 目录结构

```
embedding/
├── types.ts              # EmbeddingProvider 接口定义
├── factory.ts            # EmbeddingProviderFactory
├── service.ts            # EmbeddingService（统一接口）
├── providers/           # 各种 Provider 实现
│   ├── deer.provider.ts # DeerAPI Provider
│   └── index.ts
└── index.ts             # 模块导出
```

## 使用方式

### 1. 使用 EmbeddingService（推荐）

```typescript
import { EmbeddingService } from '@mxmai/mxmcgi/core/knowledge';

// 使用默认 provider（从环境变量 EMBEDDING_PROVIDER 读取，默认 'deer'）
const embeddingService = EmbeddingService.fromEnv();

// 生成单个文本的 embedding
const embedding = await embeddingService.embedQuery('文本内容');

// 批量生成 embedding
const embeddings = await embeddingService.embedBatch(['文本1', '文本2']);

// 指定 provider 和模型
const embedding2 = await embeddingService.embedQuery(
  '文本内容',
  'text-embedding-3-large',
  'deer'
);
```

### 2. 使用 EmbeddingProviderFactory

```typescript
import { embeddingProviderFactory } from '@mxmai/mxmcgi/core/knowledge/embedding';

// 使用默认 provider
const provider = embeddingProviderFactory.get();

// 指定 provider
const deerProvider = embeddingProviderFactory.get('deer');

// 根据模型自动选择 provider
const provider2 = embeddingProviderFactory.getProviderForModel('text-embedding-3-small');

// 直接生成 embedding
const result = await embeddingProviderFactory.embed({
  input: '文本内容',
  model: 'text-embedding-3-small',
});
```

### 3. 直接使用 Provider

```typescript
import { DeerEmbeddingProvider } from '@mxmai/mxmcgi/core/knowledge/embedding';

const provider = DeerEmbeddingProvider.fromEnv();
const result = await provider.embed({
  input: '文本内容',
  model: 'text-embedding-3-small',
});
```

## 配置

### 环境变量

```bash
# Embedding Provider 配置
EMBEDDING_PROVIDER=deer  # 默认 provider（deer | openai | azure）

# 默认模型
EMBEDDING_MODEL=text-embedding-3-small

# DeerAPI 配置（如果使用 deer provider）
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=sk-xxxxx
DEERAPI_GROUP=default  # 可选，渠道分组
```

## 支持的 Provider

### DeerEmbeddingProvider

**支持的模型**：
- `text-embedding-3-small`（1536 维，默认）
- `text-embedding-3-large`（3072 维）

**配置**：
```typescript
const provider = DeerEmbeddingProvider.fromEnv('text-embedding-3-small');
```

### 未来支持的 Provider

- **OpenAIEmbeddingProvider**：直接调用 OpenAI API
- **AzureEmbeddingProvider**：调用 Azure OpenAI Service
- **CustomEmbeddingProvider**：自定义 provider

## 扩展新的 Provider

### 1. 实现 EmbeddingProvider 接口

```typescript
// providers/openai.provider.ts
import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResponse, EmbeddingProviderType } from '../types';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider: EmbeddingProviderType = 'openai';
  readonly name = 'OpenAI Embedding';

  private readonly supportedModels: string[] = [
    'text-embedding-3-small',
    'text-embedding-3-large',
  ];

  supportsModel(modelName: string): boolean {
    return this.supportedModels.includes(modelName);
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // 实现 OpenAI API 调用
    // ...
  }
}
```

### 2. 在 Factory 中注册

```typescript
// factory.ts
import { OpenAIEmbeddingProvider } from './providers/openai.provider';

this.providerInitializers.set('openai', () => {
  return new OpenAIEmbeddingProvider();
});
```

### 3. 导出 Provider

```typescript
// providers/index.ts
export * from './deer.provider';
export * from './openai.provider';
```

## 最佳实践

1. **使用 EmbeddingService**：推荐使用 `EmbeddingService`，它提供了统一的接口
2. **批量处理**：使用 `embedBatch` 方法批量生成，自动分批处理
3. **模型选择**：
   - `text-embedding-3-small`：速度快，成本低，适合大多数场景
   - `text-embedding-3-large`：质量更高，但成本也更高
4. **Provider 选择**：通过环境变量 `EMBEDDING_PROVIDER` 配置默认 provider

## 错误处理

所有 Provider 都实现了统一的错误处理：

```typescript
try {
  const embedding = await embeddingService.embedQuery('文本内容');
} catch (error) {
  // 处理错误
  console.error('Embedding 生成失败:', error);
}
```

## 性能优化

1. **批量处理**：使用 `embedBatch` 方法，自动分批处理大量文本
2. **Provider 缓存**：Factory 会缓存已初始化的 provider，避免重复创建
3. **延迟初始化**：Provider 采用延迟初始化，只有在使用时才创建

