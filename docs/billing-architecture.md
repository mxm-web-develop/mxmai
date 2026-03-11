# 计费系统架构文档

> 最后更新：2026-02-26
> 状态：核心链路已实现，部分路由预检待补齐

---

## 一、系统概述

平台采用**双层计费**模型：

| 层级 | 方向 | 货币单位 | 存储表 |
|------|------|----------|--------|
| Provider 成本层 | 平台 → 供应商 | USD | `provider_balances` |
| 用户收费层 | 用户 → 平台 | MXM-TOKEN | `wallets` / `wallet_transactions` |

两层定价**统一维护在 `provider_pricing` 表**，Admin 在一处同时管理成本与售价。

---

## 二、数据库表结构

### `provider_pricing`（核心定价表）

```sql
provider        VARCHAR(32)    -- deer / openai / replicate / minimax ...
scope           VARCHAR(32)    -- writing / graph / audio / video / text
model_key       VARCHAR(128)   -- gemini-2-5-flash / nano-banana / sora-2 ...
charge_mode     VARCHAR(32)    -- token_based / per_image / per_second_audio / per_second_video / per_request

-- 提供商成本字段（USD）
unit_price              NUMERIC(20,8)   -- 通用单价
input_unit_price        NUMERIC(20,8)   -- token_based: 每千输入 token 成本
output_unit_price       NUMERIC(20,8)   -- token_based: 每千输出 token 成本

-- 平台售价字段（MXM-TOKEN）—— 2026-02-26 新增
platform_unit_price         NUMERIC(20,8)  -- 通用单价
platform_input_unit_price   NUMERIC(20,8)  -- token_based: 每千输入 token 收取
platform_output_unit_price  NUMERIC(20,8)  -- token_based: 每千输出 token 收取
platform_min_charge         NUMERIC(20,8)  -- 最低扣费（0=不限）
```

> Migration 文件：`mxmdata/src/database/migrations/add_platform_pricing_to_provider_pricing.sql`

### `provider_usage_records`（Provider 调用审计）

记录每次模型调用的实际用量，字段包含：
`task_id / user_id / provider / scope / model_key / input_tokens / output_tokens / image_count / audio_seconds / video_seconds / request_count / raw_usage`

### `provider_balances`（Provider 账户余额）

Admin 手动录入各 Provider 的充值余额（USD），每次任务成功后自动扣减。

### `wallets` / `wallet_transactions`（用户钱包）

用户以 MXM-TOKEN 为单位的账户余额与流水。
`wallet_transactions.metadata` 中包含：
```json
{
  "provider": "deer",
  "modelKey": "nano-banana",
  "scope": "graph",
  "charge_mode": "per_image",
  "pricing_id": "...",
  "imageCount": 1,
  "tokensCharged": 50,
  "providerCostUsd": 0.04,   // 对应 provider 成本，用于 margin 分析
  "isAdmin": false
}
```

---

## 三、代码文件总览

### 核心服务

| 文件 | 职责 |
|------|------|
| `mxmcgi/src/core/billing/billing-service.ts` | 用户 MXM-TOKEN 扣费主入口 |
| `mxmcgi/src/core/usage/usage-service.ts` | 记录 provider_usage_records + 扣 provider 余额 |
| `mxmcgi/src/core/balance/provider-balance-service.ts` | 从 provider_balances 扣 USD 余额 |

### 调用关系

```
Task 完成
  └─ UsageService.logProviderUsage()
       ├─ INSERT provider_usage_records
       ├─ ProviderBalanceService.deductFromUsage()   → 扣 provider USD 余额
       └─ 返回 { costUsd }
            └─ BillingService.consumeForTask()        → 扣用户 MXM-TOKEN
                 ├─ 查 provider_pricing.platform_*
                 ├─ 计算 TOKEN 费用
                 └─ UPDATE wallets + INSERT wallet_transactions
```

### 任务类型 → 调用位置

| 任务类型 | UsageService 调用位置 | BillingService 调用位置 |
|---------|----------------------|------------------------|
| graph（含九宫格） | `graph-task.ts`（4处） | `graph-task.ts`（4处，紧跟 Usage 之后） |
| writing（outline/generate） | `writing-task.ts` | `writing-task.ts`（紧跟 Usage 之后） |
| audio / video / 其它 | `task-executor.ts processResult()` | `task-executor.ts processResult()` |

### BasicText：内部文本调用（不创建任务但参与计费）

**定位**：图片提示词生成、写作内段落压缩等「内部 LLM 调用」，不创建独立任务、不出现在任务列表，但需要记录 Provider 用量并对用户计费。

**逻辑模型**（在「模型路由管理」中配置）：仅一个逻辑模型，生图提示词与写作内轻量调用统一计费与路由。

| 逻辑模型 | 用途 | 默认路由 |
|----------|------|----------|
| `writing-basic-text` | 生图前的提示词生成、写作内压缩/摘要等内部文本调用 | deer / gemini-3-pro |

**计费与用量**：

- `runBasicText(logicalModel, prompt, options)` 内部会：
  1. 用 `getResolvedRouting(logicalModel)` 得到 `{ provider, model }`（物理模型）；
  2. 调用 writing 文本模型，并调用 `UsageService.logProviderUsage(..., logicalModel, result)` 写入 `provider_usage_records`（scope = `writing`，model_key = **物理模型名**）；
  3. 扣减 Provider 余额（按 `provider_pricing` 中该物理模型的成本）。
- 用户侧扣费由**父任务**在完成时统一发起：例如 graph 任务在 `graph-task.ts` 里对「提示词生成」再调一次 `BillingService.consumeForTask(scope: 'writing', modelKey: 物理模型, ...)`，价格取自 `provider_pricing` 中该物理模型的 `platform_input_unit_price` / `platform_output_unit_price`。

**Admin 配置**：

- **模型路由管理**：与其它业务一致，可对 `writing-basic-text` 覆盖「Provider + 物理模型」；未覆盖时使用代码内默认路由。
- **Provider 定价**：按**物理模型**配置。例如路由到 `deer/gemini-3-pro` 时，需在 `provider_pricing` 中存在 `provider='deer', scope='writing', model_key='gemini-3-pro'`，并设置 `charge_mode='token_based'` 及 `platform_input_unit_price` / `platform_output_unit_price`（每千 token 售价）。这样 BasicText 与其它写作业务一样，可随路由切换物理模型并自动套用对应价格。
- **约定**：`provider_usage_records` 中 BasicText 产生的记录 `scope='writing'`，`model_key` 为物理模型名，便于与写作主任务区分（主任务同样 scope=writing，通过 task_id 与业务类型区分）。

### 余额预检（路由层）

任务创建前通过 `BillingService.checkBalance()` 检查用户余额：

| 路由文件 | 覆盖接口 | 状态 |
|---------|---------|------|
| `routes/graph.ts` | `/photograph` `/design` `/painting` | ✅ 已完成 |
| `routes/writing.ts` | outline（异步模式）/ generate（异步模式） | ✅ 已完成 |
| `routes/audio.ts` | `/:modelName`（异步任务分支） | ❌ 待补齐 |
| `routes/video.ts` | `/:modelName` | ❌ 待补齐 |

---

## 四、BillingService API

### `consumeForTask(params)` — 任务完成后扣费

```typescript
await BillingService.consumeForTask({
  taskId: string,
  userId: string,
  provider: string,          // 物理 provider（deer / openai ...）
  modelKey: string,          // 物理模型名（gemini-2-5-flash / nano-banana ...）
  scope: string,             // writing / graph / audio / video / text
  // 实际用量（与 charge_mode 对应，传对应字段即可）
  inputTokens?: number,
  outputTokens?: number,
  totalTokens?: number,
  imageCount?: number,
  audioSeconds?: number,
  videoSeconds?: number,
  requestCount?: number,
  providerCostUsd?: number,  // 来自 UsageService 返回值，存入流水 metadata
});
```

- 无定价配置时：跳过（不阻断任务）
- 余额不足时：抛出错误（由调用方决定是否标记任务失败，目前 graph/writing 仅 warn）

### `checkBalance(params)` — 任务创建前预检

```typescript
const result = await BillingService.checkBalance({
  userId: string,
  provider: string,
  modelKey: string,
  scope: string,
  estimatedImageCount?: number,
  estimatedOutputTokens?: number,
  estimatedInputTokens?: number,
  estimatedAudioSeconds?: number,
  estimatedVideoSeconds?: number,
  estimatedRequestCount?: number,
});
// result: { allowed: boolean, estimatedTokens: number, currentBalance: number, hasPricing: boolean }
```

- `hasPricing = false`（无定价）时，`allowed = true`（不拦截）
- Admin 用户永远 `allowed = true`

### `getPricing(provider, modelKey, scope)` — 查定价

公开方法，供外部查询某个 provider+model 的完整定价行（含 platform_* 字段）。

---

## 五、待补齐内容

### P0 — 必须补齐

#### 1. audio / video 路由余额预检

**文件**：`mxmcgi/src/routes/audio.ts` 和 `mxmcgi/src/routes/video.ts`

两个路由结构类似（通过 `/:modelName` 动态路由），需要在创建任务前插入预检。

**实现参考**（以 audio 为例，在 `createTask` 调用前插入）：

```typescript
// 在 routes/audio.ts 头部 import
import { getResolvedRouting } from '../models/providers';
import { BillingService } from '../core/billing/billing-service';

// 在 createTask() 之前插入
const { provider: rp, model: rm } = getResolvedRouting(modelName);
const balCheck = await BillingService.checkBalance({
  userId, provider: rp, modelKey: rm, scope: 'audio',
  estimatedRequestCount: 1,
  // 如果 params 中有 duration 字段，可用于估算秒数：
  estimatedAudioSeconds: Number((params as any).duration || 0) || undefined,
});
if (!balCheck.allowed) {
  return res.status(402).json({
    success: false,
    code: 'INSUFFICIENT_BALANCE',
    message: `余额不足，本次预计消耗约 ${balCheck.estimatedTokens} MXM-TOKEN，当前余额 ${balCheck.currentBalance}`,
  });
}
```

video 路由同理，`scope: 'video'`，用 `estimatedVideoSeconds: Number(params.duration || 5)`。

> 注意：audio 路由有同步直返模式（SSE stream），同步模式在 `return` 之前，无需预检（直接生成）。只需在走任务系统的分支（`// 其他情况走任务系统` 注释之后）加预检。

#### 2. 执行数据库 Migration

需手动在 Supabase 执行：

```
mxmdata/src/database/migrations/add_platform_pricing_to_provider_pricing.sql
```

并通过 reload-schema 让 PostgREST 感知新字段：

```bash
pnpm --filter @mxmai/mxmdata run reload-schema
```

#### 3. 录入初始平台定价数据

Migration 只加了字段，需要 Admin 通过管理后台或 SQL 填入 `platform_*` 值。

示例参考：

```sql
-- 图片生成（nano-banana via deer）
UPDATE provider_pricing
SET platform_unit_price = 50, platform_min_charge = 10
WHERE provider = 'deer' AND model_key = 'nano-banana' AND scope = 'graph';

-- 写作 LLM（gemini-2-5-flash via deer）
UPDATE provider_pricing
SET platform_input_unit_price = 5, platform_output_unit_price = 20
WHERE provider = 'deer' AND model_key = 'gemini-2-5-flash' AND scope = 'writing';

-- 语音合成（minimax-speech-2.5-hd via deer）
UPDATE provider_pricing
SET platform_unit_price = 10, platform_min_charge = 5
WHERE provider = 'deer' AND model_key = 'minimax-speech-2.5-hd' AND scope = 'audio';

-- 视频生成（sora-2 via deer）
UPDATE provider_pricing
SET platform_unit_price = 200, platform_min_charge = 200
WHERE provider = 'deer' AND model_key = 'sora-2' AND scope = 'video';
```

### P1 — 建议补齐

#### 4. Admin 定价管理 API

目前 `provider_pricing` 的 `platform_*` 字段只能通过 SQL 修改，建议新增 Admin 接口：

- `GET  /api/v1/system/provider-pricing` — 查询定价列表
- `PUT  /api/v1/system/provider-pricing/:id` — 更新定价（含 platform_* 字段）
- `POST /api/v1/system/provider-pricing` — 新增定价行

对应文件：`mxmcgi/src/routes/system.ts`（或新建 `providers.ts`）

#### 5. Margin 分析查询接口

`wallet_transactions.metadata.providerCostUsd` 已写入，但还没有查询接口。
建议新增 Admin 统计接口：

```
GET /api/v1/system/stats/margin?startDate=&endDate=&scope=&modelKey=
```

查询逻辑（通过 task_id 关联）：

```sql
SELECT
  wt.metadata->>'scope'           AS scope,
  wt.metadata->>'modelKey'        AS model_key,
  COUNT(*)                        AS task_count,
  SUM((wt.metadata->>'tokensCharged')::numeric)    AS total_tokens_charged,
  SUM((wt.metadata->>'providerCostUsd')::numeric)  AS total_provider_cost_usd
FROM wallet_transactions wt
WHERE wt.type = 'withdraw'
  AND wt.created_at BETWEEN :startDate AND :endDate
GROUP BY scope, model_key
ORDER BY total_provider_cost_usd DESC;
```

#### 6. 余额不足的用户提示优化

目前余额不足时 `consumeForTask()` 只打 `warn` 日志，不标记任务失败。
建议后续将任务状态更新为 `billing_failed`（新增 TaskStatus），并通过 SSE 推送给用户。

#### 7. 旧 `business_pricing` 表清理

该表在本次重构后已不再使用，可安全废弃：
- 确认无其他地方引用后，可删除对应的 Repository 和接口定义
- 相关文件：`mxmdata/src/adapters/supabase/SupabasePromptTemplateRepository.ts`（如有引用）

---

## 六、Admin 操作流程

```
1. 在各 Provider 平台充值
   ↓
2. 在系统录入 Provider 余额
   POST /api/v1/system/provider-balances
   { "provider": "deer", "balance": 100.00, "currency": "USD" }
   ↓
3. 配置模型路由（可选覆盖默认值）
   PUT /api/v1/system/model-routing/writing-articles
   { "provider": "deer", "model": "gemini-2-5-flash" }
   ↓
4. 录入 provider_pricing（成本 + 售价）
   UPDATE provider_pricing SET unit_price=..., platform_unit_price=... WHERE ...
   （P1 阶段改为管理后台页面操作）
   ↓
5. 用户充值 MXM-TOKEN
   → mxmpay 模块处理，充值后写入 wallets
   ↓
6. 用户发起任务 → 路由层预检余额 → 任务执行 → 自动扣费
```

---

## 七、关键文件速查

```
mxmcgi/src/
├── core/
│   ├── billing/billing-service.ts       ← 用户扣费主入口（consumeForTask / checkBalance）
│   ├── usage/usage-service.ts           ← Provider 用量记录（返回 costUsd）
│   ├── balance/provider-balance-service.ts  ← Provider 余额扣减
│   ├── text/basic-text.ts               ← BasicText 统一入口（runBasicText），内部调 UsageService
│   ├── graph/graph-task.ts              ← graph 任务完成后扣费（含 BasicText 提示词扣费）
│   ├── graph/graph-service.ts           ← 生图前提示词通过 runBasicText('writing-graph-prompt') 生成
│   └── writing/writing-task.ts         ← writing 任务完成后扣费
├── task/
│   └── task-executor.ts                ← audio/video/其它任务完成后扣费（processResult）
└── routes/
    ├── graph.ts                         ← ✅ photograph/design/painting 有余额预检
    ├── writing.ts                       ← ✅ outline/generate 有余额预检
    ├── audio.ts                         ← ❌ 待添加余额预检
    └── video.ts                         ← ❌ 待添加余额预检

mxmdata/src/database/migrations/
└── add_platform_pricing_to_provider_pricing.sql  ← 待执行的 Migration
```
