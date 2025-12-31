# DeerAPI Provider 实现文档

## 一、概述

DeerAPI Provider 支持通过 DeerAPI 平台调用各种 AI 模型，包括图片生成和文本生成。

## 二、支持的模型

### 2.1 图片生成模型

| 模型名称 | DeerAPI 模型标识符 | 价格 | 说明 |
|---------|------------------|------|------|
| nano-banana | nano-banana | - | Google Gemini 3 Pro Image Preview，支持图片生成和编辑 |
| flux-2-flex | black-forest-labs/flux-2-flex | $0.06/次 | Flux 2 灵活版本 |
| flux-2-pro | black-forest-labs/flux-2-pro | $0.03/次 | Flux 2 专业版本 |
| flux-fast | black-forest-labs/flux-1.1-pro | - | 快速图片生成（兼容） |
| flux-kontext-fast | black-forest-labs/flux-kontext-pro | - | 快速图片编辑（兼容） |

### 2.2 文本生成模型

| 模型名称 | DeerAPI 模型标识符 | 说明 |
|---------|------------------|------|
| deepseek-r1 | deepseek-r1 | DeepSeek R1 模型 |
| gemini-2.5-flash | gemini-2.5-flash | Google Gemini 2.5 Flash |
| claude-4.5-sonnet | claude-4.5-sonnet | Anthropic Claude 4.5 Sonnet |
| gpt-5-nano | gpt-5-nano | OpenAI GPT-5 Nano |

## 三、配置

### 3.1 环境变量

```bash
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=sk-xxxxx
DEERAPI_GROUP=your_group_name  # 可选，用于指定令牌分组（某些模型需要）
```

**注意**：如果遇到 "所有令牌分组 default 下对于模型 XXX 均无可用渠道" 的错误，需要：
1. 在 DeerAPI 控制台配置分组
2. 设置 `DEERAPI_GROUP` 环境变量为你的分组名称
3. 或者在请求参数中传递 `group` 参数

### 3.2 获取 API Key

访问 https://api.deerapi.com/pricing 获取 API Key。

## 四、API 格式

DeerAPI 支持 **Replicate 格式**的 API 调用：

- **图片生成端点**: `/v1/replicate/predictions`
- **模型前缀**: `black-forest-labs/`（用于 Flux 系列模型）
- **请求格式**: 兼容 Replicate API 格式

## 五、使用示例

### 5.1 图片生成

```typescript
import { providerFactory } from './core/providers';

const provider = providerFactory.getProviderForModel('nano-banana', 'deer');

const result = await provider.generate('nano-banana', {
  prompt: 'A beautiful landscape',
  parameters: {
    aspect_ratio: '16:9',
  },
});

console.log(result.mediaUrls); // ['https://...']
```

### 5.2 使用 Flux 模型

```typescript
const provider = providerFactory.getProviderForModel('flux-2-pro', 'deer');

const result = await provider.generate('flux-2-pro', {
  prompt: 'A futuristic city',
  parameters: {
    aspect_ratio: '16:9',
  },
});

console.log(result.mediaUrls);
```

### 5.3 文本生成

```typescript
const provider = providerFactory.getProviderForModel('gpt-5-nano', 'deer');

const result = await provider.generate('gpt-5-nano', {
  prompt: 'Write a story about...',
  parameters: {
    temperature: 0.7,
    max_tokens: 1000,
  },
});

// 文本结果在 metadata 中或通过类型断言访问
console.log((result as any).text);
```

## 六、实现细节

### 6.1 API 端点

DeerAPI 使用 Replicate 兼容的 API：

- **创建预测**: `POST /v1/replicate/predictions`
- **查询预测**: `GET /v1/replicate/predictions/:id`

### 6.2 轮询机制

图片生成是异步的，需要轮询获取结果：

1. 创建预测请求，返回预测 ID
2. 轮询预测状态，直到 `status === 'succeeded'`
3. 提取 `output` 字段中的图片 URL

### 6.3 进度流

支持进度流监控：

```typescript
const result = await provider.generate('nano-banana', {
  prompt: '...',
  enableProgress: true,
});

if (result.progress) {
  for await (const event of result.progress) {
    console.log(`Status: ${event.status}, Progress: ${event.progress}%`);
    if (event.logs) {
      console.log('Logs:', event.logs);
    }
  }
}
```

## 七、特殊处理

### 7.1 nano-banana 模型

- 使用 `image_input` 参数而不是 `image_urls` 或 `image_base64s`
- 不支持 `image_size` 参数，只支持 `aspect_ratio`
- 支持多图输入（数组格式）

### 7.2 Flux 模型

- 使用 Replicate 格式，模型前缀为 `black-forest-labs/`
- 支持标准的 Replicate 参数格式

## 八、错误处理

常见错误：

1. **认证失败**: 检查 `DEERAPI_API_KEY` 是否正确
2. **模型不支持**: 确认模型名称是否正确
3. **API 端点错误**: 检查 `DEERAPI_BASE_URL` 是否正确
4. **超时**: 图片生成可能需要较长时间，默认最多等待 2 分钟

## 九、注意事项

1. **API 端点**: DeerAPI 的实际 API 端点可能需要根据官方文档调整
2. **模型映射**: 某些模型可能需要不同的映射方式
3. **价格**: 不同模型的价格不同，使用前请查看定价页面
4. **速率限制**: 注意 API 的速率限制

## 十、待完善

1. **API 端点验证**: 需要根据实际 API 文档验证端点路径
2. **错误处理优化**: 根据实际 API 响应优化错误处理
3. **更多模型支持**: 根据 DeerAPI 支持的模型列表添加更多模型
