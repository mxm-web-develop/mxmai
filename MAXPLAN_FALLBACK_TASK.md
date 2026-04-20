# Task: mxmcgi 新增 maxplan provider + Fallback 机制

## 背景

mxmcgi 是 AI 内容生成 API 网关（Node.js/TypeScript），位于当前目录。

## 需求一：新增 maxplan provider（文本模型）

### 实现文件
- `mxmcgi/src/models/maxplan/provider.ts`（新建）

### Provider 规格
- **名称**: `maxplan`
- **API 入口**: `https://api.minimaxi.com`
- **认证**: Bearer Token，Key 名 `MAXPLAN_API_KEY`
- **支持模型**: `MiniMax-M2.7-highspeed`（文本生成）

### Chat Completion 调用
```
POST https://api.minimaxi.com/v1/text/chatcompletion_v2
Headers: Authorization: Bearer {MAXPLAN_API_KEY}
Body: {
  "model": "MiniMax-M2.7-highspeed",
  "messages": [{"role": "user", "content": "..."}]
}
```

### 需要修改的文件
1. `mxmcgi/src/models/provider-model-catalog.ts` — 添加 maxplan 的 model catalog 条目
2. `mxmcgi/src/core/providers/provider-keys.ts` — 添加 `maxplan: { single: 'MAXPLAN_API_KEY' }`
3. `mxmcgi/src/models/providers.ts`（或 `providers-registry.ts`）— 注册 MaxplanProvider
4. `mxmcgi/src/models/maxplan/provider.ts` — 新建，实现 ModelProvider 接口

### Provider 接口参考
参考 `mxmcgi/src/models/minimax/provider.ts`，实现以下接口：
```typescript
class MaxplanProvider implements ModelProvider {
  readonly provider: ProviderType = 'maxplan';
  readonly name = 'Maxplan';
  supportsModel(modelName: string): boolean;
  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult>;
  async getUsageSummary(window: string): Promise<ProviderUsageSummary>;
  async getBillingInfo(): Promise<ProviderBillingInfo>;
}
```

## 需求二：Fallback 机制

### 目标
当 provider 模型调用失败（401/403/429/500/503/超时）或返回"余额不足"/"quota exhausted"等关键词时，自动切换到配置的备用模型重试。

### 新建文件
- `mxmcgi/src/core/providers/fallback.ts`

### FallbackConfig 结构
```typescript
interface FallbackRule {
  provider: string;         // 原 provider，如 'maxplan'
  model: string;           // 原模型，如 'MiniMax-M2.7-highspeed'
  fallbackProvider: string; // 备用 provider，如 'openai'
  fallbackModel: string;     // 备用模型，如 'gpt-5-nano'
}
```

### Fallback 触发条件
1. HTTP 状态码：401、403、429、500、502、503、504
2. 响应 body 含：quota、exhausted、insufficient、balance、余额、限额、额度（不区分大小写）
3. 网络超时

### 集成方式
在 `mxmcgi/src/core/graph/run.ts`（或 `mxmcgi/src/models/run.ts`）的 `runByModelKey()` 函数中，调用前先检查 fallback 配置，失败后触发重试。

### 计费处理
Fallback 成功后，在 `GenerateResult.metadata` 中记录：
```typescript
{
  ...metadata,
  fallbackFrom: { provider: 'maxplan', model: 'MiniMax-M2.7-highspeed' }
}
```

### Fallback 配置示例
```typescript
export const FALLBACK_RULES: FallbackRule[] = [
  {
    provider: 'maxplan',
    model: 'MiniMax-M2.7-highspeed',
    fallbackProvider: 'openai',
    fallbackModel: 'gpt-5-nano',
  }
];
```

## 交付检查清单

- [ ] `mxmcgi/src/models/maxplan/provider.ts` 新建完成
- [ ] `provider-model-catalog.ts` 添加 maxplan 条目
- [ ] `provider-keys.ts` 添加 MAXPLAN_API_KEY
- [ ] `providers.ts`（或 registry）注册 MaxplanProvider
- [ ] `mxmcgi/src/core/providers/fallback.ts` 新建完成
- [ ] `run.ts` 集成 fallback 逻辑
- [ ] 类型检查通过：`pnpm --filter @mxmai/mxmcgi tsc --noEmit`

## 重要约束
- 不改变现有 provider 的行为
- fallback 只走一层，不链式 fallback（避免死循环）
- 计费归属以实际调用的 provider 为准
