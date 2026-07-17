---
name: mxmai-provider-maintain
description: >-
  维护 SuperMXMai 主 Provider（atlascloud / maxplan）：物理模型上架、官方成本定价、平台 MXM-TOKEN 售价、模型输入/输出模态能力（supported_inputs/outputs/modes）声明、冒烟测试通过后再同步线上。
  Use when 用户提到添加/更新 atlascloud 或 maxplan 模型、改 Provider 价格、补全/校验输入输出模态、同步线上定价、MiniMax/AtlasCloud 通道维护。
---

# Provider 维护（atlascloud + maxplan）

> 主服务生产主通道：**atlascloud**、**maxplan**。其它 Provider 仍可用 `mxmai_addmodel`，但本 skill 专治这两家。  
> 详表、协议、定价公式、模态枚举见 [reference.md](reference.md)；模态速查见 [reference/modality-cookbook.md](reference/modality-cookbook.md)。

## 硬性门禁（不得跳过）

1. **先冒烟、后宣称可用**：未通过 `probe-provider-model` 不得同步「启用」到生产。
2. **价格必须有据**：  
   - **maxplan** → 查 [MiniMax PAYG](https://platform.minimax.io/docs/guides/pricing-paygo)（Token Plan / Credits 同源价）。  
   - **atlascloud** → 查该模型 Atlas 页面 Pricing / API 档位。
3. **平台售价**：`platform_* = usd_cost × 100 × 2.5`（1 TOKEN≈$0.01，2.5× 加价），写入 `provider_pricing`。
4. **线上同步**：写生产 Supabase（港机 `mxm-hk` → `/opt/supermxmai`），再 `pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler`（或 `pnpm deploy:hk -- --backend-only` 若改了 Provider 代码）。
5. **模态能力必填**：新模型 / 改价时必须**同时**声明输入/输出模态（`supported_inputs[]` / `supported_outputs[]` / `modes[]`），否则业务侧无法判断"该模型能否接音频/视频输入"。集中维护在 `mxmcgi/src/scripts/data/hk-provider-modalities.ts`，**单一来源**。

## 标准流程（增模型 / 改价 / 补模态）

### 0. 采集

| 字段 | 说明 |
|------|------|
| `provider` | `atlascloud` \| `maxplan` |
| `scope` / `modality` / `protocol` | 见 reference（决定走哪条上游 API） |
| `model_key` / `upstream_model` | 逻辑名 vs 上游 ID（Seedance 可填基座） |
| **官方成本** | USD + `charge_mode` |
| **`supported_inputs[]`** | 6 选 N：`text` / `image` / `audio` / `video` / `3d` / `embed` |
| **`supported_outputs[]`** | 同上 |
| **`modes[]`** | 可选：`*->*` 模式（`text-to-image` / `reference-to-video` / `chat` / `embedding` …） |
| `context_window` / `max_output_tokens` / `vector_dim` | 视模型特性 |

> **采集要齐 8 字段**（前 4 + 后 4），缺一不可。`supported_inputs/outputs` 与 `modes` 的取值查 [modality-cookbook.md](reference/modality-cookbook.md)。

### 1. 注册物理模型（`provider_models`）

- 扩 seed：`seed-provider-models-maxplan.ts` 或仿 `seed-provider-model-atlascloud-*.ts` 新增一行。
- **集中数据源**：所有 provider 的模态定义统一在 `mxmcgi/src/scripts/data/hk-provider-modalities.ts`（`HK_ATLASCLOUD_MODALITIES` / `HK_MAXPLAN_MODALITIES` / `HK_JIEKOU_MODALITIES`）。Seed 脚本用 `withCapabilities(row, HK_*.MODALITIES[modelKey])` 自动生成双写 capabilities。
- 本地写入后，生产用：`bash scripts/sync-provider-db-production.sh --models`（或该模型专属 seed）。
- **仅当现有 protocol / Provider 分支已支持该模态**才算「配置即可」；新协议要改 `mxmcgi/src/models/{atlascloud|maxplan}/provider.ts` 并部署。

### 1.5 声明输入/输出模态（必须）

> 这是 2026-07 引入的"硬性门禁 #5"。在 `provider_models.capabilities` JSONB 中双写：
> - **新字段**（拍平数组，运行时优先读）：`supported_inputs` / `supported_outputs` / `modes`
> - **旧字段**（嵌套对象，向后兼容）：`input` / `output`
> - **业务字段**：`context_window` / `max_output_tokens` / `vector_dim`

**两种使用方式**：

```bash
# A) 通过 seed 脚本（推荐，新模型 / 改 capabilities 都用）
# 编辑 mxmcgi/src/scripts/data/hk-provider-modalities.ts → 增改 model_key
# 然后跑：
MXM_SEED_PRODUCTION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  pnpm --filter @mxmai/mxmcgi run seed:provider-atlascloud-models
# 或 maxplan / jiekou

# B) 通过幂等 patch 脚本（仅更新 capabilities 字段，不动其它列）
bash scripts/sync-modality-capacities-production.sh --dry-run   # 先看 diff
bash scripts/sync-modality-capacities-production.sh             # 真跑
```

**模态值速查**（完整列表见 [modality-cookbook.md](reference/modality-cookbook.md)）：

| Modality | 含义 | 典型场景 |
|----------|------|----------|
| `text` | 文本 prompt / 上下文 | LLM、TTS、写作 |
| `image` | 图片（参考图 / 输出图） | 生图、图生图、视觉理解 |
| `audio` | 音频（语音 / 音乐） | TTS、STT、音乐生成 |
| `video` | 视频（参考 / 输出） | 文生视频、图生视频、参考视频 |
| `3d` | 3D 模型输出 | Atlas Cloud 3D 系列（Seed3D / Hunyuan 3D） |
| `embed` | 向量（embedding） | 知识库 embedding |

**Schema 与工具**：
- 归一化工具：`mxmcgi/src/models/provider-modality.ts`（`getSupportedInputs/Outputs/Modes()` / `normalizeModalityList()`）
- 集中数据源：`mxmcgi/src/scripts/data/hk-provider-modalities.ts`
- 模板：`templates/capabilities-row.example.json`
- Admin UI：ProviderRoutes.tsx 「模型能力参数」Tab 多选（兼容读 + 写）

### 2. 冒烟测试（强制）

```bash
pnpm --filter @mxmai/mxmcgi run probe:provider-model -- \
  --provider maxplan --model MiniMax-M3
# atlascloud 示例：
pnpm --filter @mxmai/mxmcgi run probe:provider-model -- \
  --provider atlascloud --model bytedance/seedance-2.0-mini --timeout-ms 300000
```

通过标准：HTTP 成功、返回有效 text 或 media URL、无上游 `base_resp` / prediction `failed`。失败则修 Key / upstream / protocol / 代码，**禁止**只改价上线。

### 3. 定价（`provider_pricing`）

```bash
# 单条或 JSON 文件；自动算 platform_*
pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- \
  --provider maxplan --scope audio --model speech-2.8-hd \
  --mode token_based --input-usd 0.1 --output-usd 0
```

批量 maxplan 官方表：`pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-pricing`  
生产：`bash scripts/sync-provider-db-production.sh --pricing`（无 SERVICE_ROLE_KEY 时走港机 `SUPABASE_DB_URL`+pg）。

### 4. 上线验收

- Admin → Provider 管理：物理模型 `is_enabled`、定价行存在、「模型能力」Tab 多选框与采集一致。
- 港机 reload 后，再跑一次 probe（指向生产 Key / 或港机环境）。
- 跑 `pnpm --filter @mxmai/mxmcgi run report:hk-modalities` 看能力分布是否含新模型。
- 向用户交付：**模型 ID、官方成本、platform 售价、模态能力（inputs/outputs/modes）、probe 结果、是否已写生产库**。

## 与业务上架的边界

本 skill **只管通道 + 计费底价 + 模态能力**。Task V2 / Smartflow 业务表单与路由走对应 `mxmai_*_business_bundle`。
