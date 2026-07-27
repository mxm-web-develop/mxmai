# Core 模块说明

Core 模块提供了统一的模型接口，支持多个 provider（replicate、ppio、deer），默认使用 replicate。

## 目录结构

```
core/
├── providers/          # Provider 类型、工厂、keys、stats（实现已迁至 models/*/provider）
├── graph/             # 图生图配置与编排（graphconfigs、type、reference-image、graph-task、graph-service）
├── writing/           # 写作配置与服务（wtconfigs、writing-task、writing-service、model-selector）
└── video/             # 视频编排（video-service、videoconfigs）

模型实现已单轨迁至 src/models/，通过 registry + runByModelKey 调用。
```

## 使用方法

### 图片生成模型示例

#### 图生图（单轨：models/run）

```typescript
import { runByModelKey } from './models/run';

// 使用默认 provider
const result = await runByModelKey('graph', 'nano-banana', {
  prompt: 'A beautiful sunset',
  parameters: { aspect_ratio: '16:9', image_size: '2K' },
});
console.log(result.mediaUrls);

// 指定 provider
const result2 = await runByModelKey('graph', 'nano-banana', {
  prompt: 'A beautiful sunset',
  parameters: { aspect_ratio: '16:9' },
}, { providerOverride: 'deer' });
```

### 文本生成模型示例

#### 文本/写作（单轨：models/run）

```typescript
import { runByModelKey } from './models/run';

const result = await runByModelKey('writing', 'deepseek-r1', {
  prompt: 'Explain quantum computing',
  outputFormat: 'json',
  max_tokens: 1000,
  temperature: 0.7,
});
console.log((result as { text?: string }).text);
```

#### Gemini 2.5 Flash

```typescript
// 纯文本
const textResult = await runByModelKey('writing', 'gemini-2-5-flash', {
  prompt: 'What is AI?',
  outputFormat: 'json',
  temperature: 0.8,
});

// 多模态由同一 generate 支持，传相应 parameters 即可
const multiResult = await runByModelKey('writing', 'gemini-2-5-flash', {
  prompt: 'Describe this image',
  outputFormat: 'json',
  parameters: { image: '...' },
});
```

## Provider 说明

### Replicate (默认)

- **环境变量**: `REPLICATE_API_TOKEN`
- **支持模型**: 所有模型
- **获取 Token**: https://replicate.com/account/api-tokens

### PPIO

- **环境变量**: `PPIO_API_KEY`
- **支持模型**: 
  - nano-banana (Gemini 3 Pro Image Preview)
- **获取 API Key**: 联系 PPIO 获取

### Deer

- **环境变量**: `DEERAPI_API_KEY`, `DEERAPI_BASE_URL`
- **支持模型**: 
  - **图片生成**:
    - nano-banana (Google Gemini 3 Pro Image Preview)
    - flux-2-flex ($0.06/次)
    - flux-2-pro ($0.03/次)
    - flux-fast (兼容 flux-1.1-pro)
    - flux-kontext-fast (兼容 flux-kontext-pro)
  - **文本生成**:
  - deepseek-r1
  - gemini-2.5-flash
  - claude-4.5-sonnet
  - gpt-5-nano
- **API 格式**: 支持 Replicate 格式调用，模型前缀为 `black-forest-labs/`
- **获取 API Key**: https://api.deerapi.com

## Provider 选择逻辑

1. 如果用户指定了 `provider` 参数，使用指定的 provider
2. 如果指定的 provider 不支持该模型，抛出错误
3. 如果未指定 provider，默认使用 `replicate`
4. 如果 replicate 不可用，尝试其他可用的 provider

## 错误处理

如果 provider 不支持某个模型，会抛出明确的错误信息：

```typescript
try {
  await textToImage('...', { provider: 'ppio' });
} catch (error) {
  // Error: Provider "ppio" 不支持模型 "flux-kontext-fast"
}
```

## 模型列表

### 图片生成模型 (graph/)

| 文件名 | Replicate 模型 | PPIO | Deer | 说明 |
|--------|---------------|------|------|------|
| nano-banana | google/nano-banana-pro | ✅ | ✅ | 支持图片生成和编辑，多图理解 |
| flux-2-flex | black-forest-labs/flux-2-flex | ❌ | ✅ | Flux 2 灵活版本 ($0.06/次) |
| flux-2-pro | black-forest-labs/flux-2-pro | ❌ | ✅ | Flux 2 专业版本 ($0.03/次) |
| flux-kontext-fast | black-forest-labs/flux-kontext-pro | ❌ | ✅ | 快速图片编辑（兼容） |
| flux-fast | black-forest-labs/flux-1.1-pro | ❌ | ✅ | 快速图片生成（兼容） |
| ideogram-v2a | ideogram-ai/ideogram-v2 | ❌ | ❌ | 擅长生成包含文字的图片 |
| recraft-crisp-upscale | recraft-ai/recraft-crisp-upscale | ❌ | ❌ | 高质量图片放大 |

### 文本生成模型 (text/)

| 文件名 | Replicate 模型 | PPIO | Deer | 说明 |
|--------|---------------|------|------|------|
| deepseek-r1 | deepseek-ai/deepseek-r1 | ❌ | ✅ | 大语言模型，支持推理 |
| gemini-2.5-flash | google/gemini-2.0-flash-exp | ❌ | ✅ | 快速多模态模型 |
| claude-4.5-sonnet | anthropic/claude-3.5-sonnet | ❌ | ✅ | 对话模型 |
| gpt-5-nano | openai/gpt-4o-mini | ❌ | ✅ | 快速文本生成（使用 GPT-4o-mini 作为占位） |

## 注意事项

1. **文本模型返回格式**: 文本模型的输出在 `result.text` 中，同时为了兼容性也在 `result.mediaUrls[0]` 中
2. **图片模型返回格式**: 图片模型的输出在 `result.image_urls` 或 `result.mediaUrls` 中
3. **Provider 初始化**: Provider 在工厂初始化时自动创建，如果环境变量未设置会记录警告但不会阻止其他 provider 的使用
4. **错误处理**: 所有模型函数都会抛出明确的错误信息，包含模型名称和 provider 信息
