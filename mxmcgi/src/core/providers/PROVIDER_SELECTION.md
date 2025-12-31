# Provider 智能选择机制

## 概述

mxmcgi 实现了智能的 Provider 选择机制，可以根据环境变量配置和模型支持情况自动选择最合适的 Provider。

## 功能特性

1. **默认 Provider 配置**：通过环境变量 `DEFAULT_PROVIDER` 设置默认提供商
2. **自动 Provider 选择**：如果模型只有一个提供商支持，自动使用该提供商
3. **智能降级**：如果默认提供商不可用，自动尝试其他提供商
4. **统一接口**：同名模型的调用和返回格式完全统一

## 配置

### 环境变量

在 `.env` 文件中设置：

```bash
# 设置默认提供商（可选值：replicate, ppio, deer, deerapi）
DEFAULT_PROVIDER=deerapi
```

**注意**：
- `deerapi` 会自动映射为 `deer`
- 如果不设置，默认使用 `replicate`（向后兼容）

## 选择逻辑

`ProviderFactory.getProviderForModel()` 方法的选择逻辑如下：

### 1. 指定 Provider（优先级最高）

如果调用时明确指定了 `provider` 参数：

```typescript
const provider = providerFactory.getProviderForModel('nano-banana', 'deer');
```

- 如果指定的 Provider 支持该模型，直接使用
- 如果指定的 Provider 不支持，会发出警告并继续自动选择

### 2. 单一 Provider 支持（自动选择）

如果模型只有一个 Provider 支持，自动使用该 Provider：

```typescript
// 例如：ideogram-v2a 只有 replicate 支持
const provider = providerFactory.getProviderForModel('ideogram-v2a');
// 自动使用 replicate
```

### 3. 多个 Provider 支持（使用默认 Provider）

如果多个 Provider 支持同一模型，优先使用 `DEFAULT_PROVIDER`：

```typescript
// 例如：nano-banana 被 replicate, ppio, deer 都支持
// 如果 DEFAULT_PROVIDER=deerapi，则使用 deer
const provider = providerFactory.getProviderForModel('nano-banana');
// 使用 deer（因为 DEFAULT_PROVIDER=deerapi）
```

### 4. 降级机制

如果默认 Provider 不可用（初始化失败或环境变量未配置），会按顺序尝试其他 Provider：

1. 默认 Provider
2. 其他 Provider（按注册顺序）

## 模型支持情况

### 图片生成模型

| 模型名称 | Replicate | PPIO | Deer |
|---------|-----------|------|------|
| nano-banana | ✅ | ✅ | ✅ |
| flux-fast | ✅ | ❌ | ✅ |
| flux-kontext-fast | ✅ | ❌ | ✅ |
| flux-2-flex | ❌ | ❌ | ✅ |
| flux-2-pro | ❌ | ❌ | ✅ |
| ideogram-v2a | ✅ | ❌ | ❌ |
| recraft-crisp-upscale | ✅ | ❌ | ❌ |
| seedream-4 | ✅ | ❌ | ❌ |

### 文本生成模型

| 模型名称 | Replicate | PPIO | Deer |
|---------|-----------|------|------|
| gpt-5-nano | ✅ | ❌ | ✅ |
| claude-4.5-sonnet | ✅ | ❌ | ✅ |
| deepseek-r1 | ✅ | ❌ | ✅ |
| gemini-2.5-flash | ✅ | ❌ | ✅ |
| gemini-3-pro | ✅ | ❌ | ❌ |

## 使用示例

### 示例 1：使用默认 Provider

```typescript
import { providerFactory } from './core/providers';

// 环境变量：DEFAULT_PROVIDER=deerapi
const provider = providerFactory.getProviderForModel('nano-banana');
// 自动使用 deer provider
```

### 示例 2：明确指定 Provider

```typescript
// 即使设置了 DEFAULT_PROVIDER，也可以明确指定使用其他 Provider
const provider = providerFactory.getProviderForModel('nano-banana', 'replicate');
// 使用 replicate provider
```

### 示例 3：单一 Provider 支持的模型

```typescript
// ideogram-v2a 只有 replicate 支持
const provider = providerFactory.getProviderForModel('ideogram-v2a');
// 自动使用 replicate，即使 DEFAULT_PROVIDER=deerapi
```

### 示例 4：在 Graph/Text 模块中使用

```typescript
// 在 graph/nano-banana.ts 中
export async function generate(params: NanoBananaParams, provider?: ProviderType) {
  const modelProvider = providerFactory.getProviderForModel('nano-banana', provider);
  // 如果 provider 未指定，会根据 DEFAULT_PROVIDER 和模型支持情况自动选择
  const result = await modelProvider.generate('nano-banana', generateParams);
  return result;
}
```

## API 接口

### ProviderFactory 方法

#### `getProviderForModel(modelName: string, preferredProvider?: ProviderType): ModelProvider`

获取支持指定模型的 Provider。

**参数**：
- `modelName`: 模型名称
- `preferredProvider`: 首选的 Provider（可选）

**返回**：支持该模型的 `ModelProvider` 实例

**异常**：如果没有找到支持该模型的 Provider，抛出错误

#### `getDefaultProvider(): ProviderType`

获取当前配置的默认 Provider。

#### `getSupportedProviders(modelName: string): ProviderType[]`

获取支持指定模型的所有 Provider 列表。

## 统一接口保证

所有 Provider 都实现了 `ModelProvider` 接口，确保：

1. **调用接口统一**：所有 Provider 的 `generate()` 方法签名相同
2. **返回格式统一**：所有 Provider 返回 `GenerateResult` 格式
3. **参数格式统一**：所有 Provider 接受相同的 `GenerateParams` 参数

这意味着，无论使用哪个 Provider，调用方式和返回格式都是一致的。

## 调试

### 查看 Provider 选择日志

Provider 选择过程会输出日志：

```
✅ 模型 "ideogram-v2a" 只有一个提供商支持，自动使用: replicate
✅ 使用默认提供商 "deer" 调用模型 "nano-banana"
⚠️  Provider "replicate" 不支持模型 "nano-banana"，将自动选择其他提供商
```

### 环境变量调试

设置 `DEBUG_ENV=true` 可以查看环境变量加载情况。

## 注意事项

1. **Provider 初始化**：Provider 采用延迟初始化，只有在使用时才会创建实例
2. **错误处理**：如果 Provider 初始化失败，会自动尝试其他 Provider
3. **向后兼容**：如果不设置 `DEFAULT_PROVIDER`，默认使用 `replicate`，保持向后兼容
4. **动态发现**：如果模型不在预定义的映射表中，会动态检查所有 Provider

## 未来扩展

当添加新的 Provider 时：

1. 实现 `ModelProvider` 接口
2. 在 `ProviderFactory` 中注册
3. 更新 `buildModelProviderMap()` 函数中的模型列表
4. 系统会自动支持新的 Provider 和模型
