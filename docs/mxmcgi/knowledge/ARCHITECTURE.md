# Embedding 模块架构设计

## 设计目标

1. **支持多种 Provider**：DeerAPI、OpenAI、Azure 等
2. **支持多种模型**：text-embedding-3-small、text-embedding-3-large 等
3. **统一接口**：无论使用哪个 provider，调用方式一致
4. **易于扩展**：添加新的 provider 只需实现接口

## 架构层次

```
┌─────────────────────────────────────┐
│   EmbeddingService (统一接口)        │
│   - embedQuery()                     │
│   - embed()                          │
│   - embedBatch()                     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   EmbeddingProviderFactory           │
│   - get()                            │
│   - getProviderForModel()            │
│   - embed()                          │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼──────┐
│   Provider  │  │  Provider  │
│  Interface  │  │  Interface  │
└──────┬──────┘  └─────┬──────┘
       │                │
┌──────▼──────┐  ┌─────▼──────┐
│   Deer      │  │  OpenAI    │
│  Provider   │  │  Provider  │
└─────────────┘  └────────────┘
```

## 核心组件

### 1. EmbeddingProvider 接口

所有 provider 必须实现的接口：

```typescript
interface EmbeddingProvider {
  readonly provider: EmbeddingProviderType;
  readonly name: string;
  supportsModel(modelName: string): boolean;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
```

### 2. EmbeddingProviderFactory

管理多个 provider，提供：
- 自动选择 provider
- 根据模型选择 provider
- 延迟初始化
- Provider 缓存

### 3. EmbeddingService

统一的 embedding 服务接口，提供：
- `embedQuery()`：生成单个文本的 embedding
- `embed()`：批量生成 embedding
- `embedBatch()`：大量文本批量处理

## 扩展新 Provider

### 步骤 1：实现 Provider

```typescript
// providers/openai.provider.ts
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider: EmbeddingProviderType = 'openai';
  readonly name = 'OpenAI Embedding';

  supportsModel(modelName: string): boolean {
    return ['text-embedding-3-small', 'text-embedding-3-large'].includes(modelName);
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // 实现 OpenAI API 调用
  }
}
```

### 步骤 2：在 Factory 中注册

```typescript
// factory.ts
this.providerInitializers.set('openai', () => {
  return new OpenAIEmbeddingProvider();
});
```

### 步骤 3：更新类型定义

```typescript
// types.ts
export type EmbeddingProviderType = 'deer' | 'openai' | 'azure' | 'custom';
```

## 配置优先级

1. **方法参数**：`embedQuery(text, model, provider)` 中的参数优先级最高
2. **服务实例配置**：`EmbeddingService.fromEnv(model, provider)`
3. **环境变量**：`EMBEDDING_PROVIDER`、`EMBEDDING_MODEL`
4. **默认值**：`deer` provider，`text-embedding-3-small` 模型

## 使用示例

### 基本使用

```typescript
const service = EmbeddingService.fromEnv();
const embedding = await service.embedQuery('文本内容');
```

### 指定 Provider 和模型

```typescript
const service = EmbeddingService.fromEnv('text-embedding-3-large', 'deer');
const embedding = await service.embedQuery('文本内容');
```

### 动态选择 Provider

```typescript
const factory = embeddingProviderFactory;
const provider = factory.getProviderForModel('text-embedding-3-small', 'openai');
const result = await provider.embed({ input: '文本内容' });
```

## 优势

1. **解耦**：业务代码不依赖具体的 provider 实现
2. **灵活**：可以轻松切换 provider
3. **可扩展**：添加新 provider 只需实现接口
4. **统一**：所有 provider 使用相同的接口和返回格式

