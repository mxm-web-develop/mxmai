# Core 模块说明

Core 模块提供统一模型接口。**文本 / 写作默认**：`maxplan` + `MiniMax-M3`（见 `mxmcgi/src/config/default-llm.ts`）。主图生通道为 **atlascloud**。

## 目录结构

```
core/
├── providers/          # Provider 类型、工厂、keys、stats（实现已迁至 models/*/provider）
├── graph/             # 图生图配置与编排
├── writing/           # 写作配置与服务
└── video/             # 视频编排

模型实现已单轨迁至 src/models/，通过 registry + runByModelKey 调用。
```

## 使用方法

### 图片生成（单轨：models/run）

```typescript
import { runByModelKey } from './models/run';

const result = await runByModelKey('graph', 'nano-banana', {
  prompt: 'A beautiful sunset',
  parameters: { aspect_ratio: '16:9', image_size: '2K' },
}, { providerOverride: 'atlascloud' });
console.log(result.mediaUrls);
```

### 文本 / 写作

```typescript
import { runByModelKey } from './models/run';

const result = await runByModelKey('writing', 'MiniMax-M3', {
  prompt: 'Explain quantum computing',
  outputFormat: 'json',
  max_tokens: 1000,
  temperature: 0.7,
}, { providerOverride: 'maxplan' });
console.log((result as { text?: string }).text);
```

## Provider（现行）

| Provider | 用途 |
|----------|------|
| **maxplan** | 文本 / 写作 / TTS / 音乐默认（`MiniMax-M3`） |
| **atlascloud** | 图生 / 视频主通道 |
| replicate / ppio / openrouter / qhai 等 | 仅 Admin 显式路由时使用 |

**deer / deerapi 已下架**，勿写入新业务 bundle。维护流程见 `.cursor/skills/mxmai_provider_maintain/SKILL.md`。

## Provider 选择逻辑

1. 业务 `*_scope_config` / bundle `routing` 优先
2. 文本 / 写作未指定时回退 `maxplan` / `MiniMax-M3`
3. 物理模型必须在 `provider_models` + `provider_pricing.platform_*` 可解析，否则估价失败
