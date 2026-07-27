# Provider 维护参考（atlascloud / maxplan）

## 1. 数据落点

| 表 / 配置 | 作用 |
|-----------|------|
| `provider_models` | 物理模型目录：`supportsModel` / upstream / protocol / modality / **capabilities（模态能力双写）** |
| `provider_pricing` | 成本价 + `platform_*` 用户 MXM-TOKEN 售价 |
| `provider_api_keys` / `.env` | `ATLASCLOUD_API_KEY`、`MAXPLAN_API_KEY`（或 Admin Key） |
| scope_config（可选） | 业务默认路由，非通道必需 |

`provider_models.capabilities` 是 **JSONB 自由结构**，本项目约定 3 组字段：
- **业务字段**：`context_window` / `max_output_tokens` / `vector_dim`
- **新模态字段**（2026-07+）：`supported_inputs[]` / `supported_outputs[]` / `modes[]`（拍平数组，运行时优先读）
- **旧模态字段**（兼容）：`input{...}` / `output{...}`（嵌套对象，老 seed / 老 Admin 还在用）

运行时 catalog：`loadProviderModelCatalog()`；改库后需 **reload mxmcgi**。

代码：
- maxplan：`mxmcgi/src/models/maxplan/provider.ts`
- atlascloud：`mxmcgi/src/models/atlascloud/provider.ts` + `seedance-video.ts`
- 模态归一化工具：`mxmcgi/src/models/provider-modality.ts`
- 集中数据源：`mxmcgi/src/scripts/data/hk-provider-modalities.ts`

## 2. Scope / protocol 约定

### maxplan（api.minimaxi.com）

| scope | modality | protocol | 上游 |
|-------|----------|----------|------|
| `text` / writing 共用模型 | `text` | `chatcompletion_v2` | `/v1/text/chatcompletion_v2` |
| `graph` | `image` | `image_generation` | `/v1/image_generation` |
| `audio` | `audio` | `t2a_v2`（旧：`text_to_speech`） | `/v1/t2a_v2` |
| `music` | `music` | `music_generation` | `/v1/music_generation` |

TTS 计费：官方按 **字符**；实现把 `usage_characters` 写入 `metadata.usage.prompt_tokens`，定价用 `token_based`（**USD / 千字**）。

### atlascloud（api.atlascloud.ai）

| 模态 | protocol 建议 | 路由 |
|------|---------------|------|
| 文本 | `openai_chat` / 含 `chat` | OpenAI 兼容 chat |
| 图像 | `generate_image` / `prediction` | generateImage + poll |
| 视频 | `prediction_video` / `generate_video` | prediction poll；Seedance 基座自动切 text/image/reference |
| 3D | `prediction_3d` / `generate_3d` | generate3d + poll（如 Seed3D / Hunyuan 3D） |
| 音频 | `generate_audio` / `prediction_audio` | generateAudio + poll（Suno Chirp 等） |

Seedance：`upstream_model` 填 `bytedance/seedance-2.0` 或 `...-mini`，不要写死子路径。

## 3. charge_mode → platform 字段

售价公式：`platform = usd × 100 × 2.5`（至少 0.001）。

| charge_mode | 成本字段 | platform 字段 | 典型用途 |
|-------------|---------|---------------|----------|
| `token_based` | `input_unit_price` / `output_unit_price`（每千 token 或千字） | `platform_input/output_unit_price`；`platform_min_charge` 文本≥1，TTS 可 0.1～1 | LLM、TTS |
| `per_image` | `unit_price` | `platform_unit_price` + min=同价 | 生图 |
| `per_request` | `unit_price` | 同上 | 音乐轨、按次 |
| `per_second_video` | `unit_price`（$/s） | 同上 | Seedance 等 |
| `per_second_audio` | `unit_price` | 同上 | 少见 |

## 4. 模态能力（capabilities）Schema 与归一化

> 2026-07 引入的硬性门禁。每条 `provider_models` 都必须带 capabilities，**老 seed 没写的要补齐**。

### 4.1 双写结构

```jsonc
{
  // —— 新（拍平数组，运行时优先读）——
  "supported_inputs":  ["text", "image", "audio"],   // 6 选 N
  "supported_outputs": ["image", "video"],            // 6 选 N
  "modes": ["text-to-image", "image-edit", "reference-to-image"],

  // —— 旧（嵌套对象，向后兼容）——
  "input":  { "text": true, "image": true, "audio": false, "video": false, "3d": false, "embed": false },
  "output": { "image": true, "video": true },

  // —— 业务参数 ——
  "context_window": 1_000_000,        // LLM 上下文窗口
  "max_output_tokens": 131_072,        // LLM 单次最大输出
  "vector_dim": 1536                   // embedding 维度
}
```

### 4.2 6 种模态枚举

| 值 | 含义 | 中文 UI | 典型场景 |
|----|------|--------|----------|
| `text` | 文本 | T 文本 | LLM prompt、TTS 输入、写作 |
| `image` | 图片 | 🖼 图片 | 生图参考、图生图、视觉理解 |
| `audio` | 音频/语音 | 🔊 语音/音频 | TTS 输出、音乐、STT 输入 |
| `video` | 视频 | 🎬 视频 | 文生视频、图生视频、参考视频 |
| `3d` | 3D 模型 | 🧊 3D 模型 | Seed3D / Hunyuan 3D（输出端） |
| `embed` | 向量 | 🔢 向量 | embedding（输出端） |

### 4.3 20 种 *-to-* mode

按 AtlasCloud 官方分类：

| Mode | 适用 |
|------|------|
| `text-to-image` / `image-edit` / `image-to-image` | 文生图 / 图编辑 / 风格迁移 |
| `text-to-video` / `image-to-video` / `reference-to-video` | 视频生成 |
| `video-edit` / `video-extension` | 视频编辑（Seedance 2.0） |
| `text-to-music` / `text-to-speech` / `voice-clone` | 音乐 / TTS |
| `chat` / `completion` / `long-context` / `multimodal-qa` / `vision-qa` | LLM 用途 |
| `embedding` | 向量化 |
| `subject-reference` / `style-transfer` / `reference-to-image` | 视觉参考 |
| `text-to-3d` / `image-to-3d` | 3D 生成 |

完整速查 + 案例见 [modality-cookbook.md](reference/modality-cookbook.md)。

### 4.4 写入与同步

| 场景 | 工具 |
|------|------|
| 改 seed 脚本 | 编辑 `mxmcgi/src/scripts/data/hk-provider-modalities.ts`（单一来源） |
| 改单条 capabilities | Admin「物理模型」→「模型能力参数」Tab 多选 |
| 批量重写生产 | `bash scripts/sync-modality-capacities-production.sh` |
| 仅打印分布 | `pnpm --filter @mxmai/mxmcgi run report:hk-modalities` |

> **不要直接改 SQL 或写 JSONB 字符串**；所有写入都通过 seed / sync / Admin 三条路径，保证双写一致。

## 5. maxplan ↔ MiniMax 官方价对照（维护时以官网为准）

来源：https://platform.minimax.io/docs/guides/pricing-paygo

| model_key | 官方 | 写入成本 |
|-----------|------|----------|
| MiniMax-M3 | ≤512k 五折后 $0.30 / $1.20 per M tokens | in/out `$0.0003` / `$0.0012` per 1K |
| speech-2.8-hd / 2.6-hd | $100 / M chars | in `$0.1` / 千字 |
| speech-2.8-turbo / 2.6-turbo | $60 / M chars | in `$0.06` / 千字 |
| image-01 / image-01-live | $0.0035 / image | `per_image` `0.0035` |
| music-2.5 / 2.6 | $0.15 / track（≤5min） | `per_request` `0.15` |

> 512k / Priority(1.5×) 档位若上架，需单独定价行或在 metadata 注明并选正确单价。

## 6. atlascloud 定价怎么查

1. 打开 `https://www.atlascloud.ai/models/<owner>/<model>` 的 Pricing / API。
2. 记下计费单位（张 / 秒 / token / 次）与 USD。
3. 映射到上表 `charge_mode`；视频优先对齐现有 Seedance：`per_second_video`。
4. 写入 `provider`=`atlascloud`，`model_key` 与 `provider_models.model_key` **完全一致**。
5. **同时**在 [hk-provider-modalities.ts](../../mxmcgi/src/scripts/data/hk-provider-modalities.ts) 的 `HK_ATLASCLOUD_MODALITIES` 表加 `supported_inputs/outputs/modes`。

### 已固化批次（2026-07，MXM-TOKEN = usd×100×2.5）

| model_key | 官方成本 | charge_mode | platform_* | supported_inputs → outputs | modes |
|-----------|----------|-------------|------------|----------------------------|-------|
| gpt-image-2 | ≈$0.009/张 | per_image | 2.25 | [text,image] → [image] | text-to-image, image-edit |
| nano-banana-2 | ≈$0.08/张(1k) | per_image | 20 | [text,image] → [image] | text-to-image, image-edit, reference-to-image |
| bytedance/seedance-2.0-mini | ≈$0.045/s | per_second_video | 11.25 | [text,image,video,audio] → [video,audio] | text-to-video, image-to-video, reference-to-video |
| bytedance/seedance-2.0 | ≈$0.09/s | per_second_video | 22.5 | [text,image,video,audio] → [video,audio] | + video-edit, video-extension |
| bytedance/seedance-2.0-fast/… | ≈$0.072/s | per_second_video | 18 | [text] → [video] | text-to-video |
| anthropic/claude-opus-4.8 | $0.005/$0.025 per 1K | token_based | 1.25 / 6.25 | [text,image] → [text] | chat, completion, vision-qa |
| google/gemini-3.5-flash | $0.0015/$0.009 per 1K | token_based | 0.375 / 2.25 | [text,image,video,audio] → [text] | chat, completion, multimodal-qa |
| openai/gpt-oss-120b | （text-only） | token_based | （待定价） | [text] → [text] | chat, completion |
| deepseek-ai/deepseek-v4-flash | $0.14/$0.28 per M | token_based | 0.035 / 0.07 | [text] → [text] | chat, completion, long-context |
| deepseek-ai/deepseek-v4-pro | $1.68/$3.38 per M | token_based | 0.42 / 0.845 | [text] → [text] | chat, completion, long-context |
| openai/gpt-5.6-luna | $1/$6 per M | token_based | 0.25 / 1.5 | [text,image] → [text] | chat, completion, vision-qa, long-context |
| openai/gpt-5.6-terra | $2.5/$15 per M | token_based | 0.625 / 3.75 | [text,image] → [text] | chat, completion, vision-qa, long-context |
| openai/gpt-5.6-sol | $5/$30 per M | token_based | 1.25 / 7.5 | [text,image] → [text] | chat, completion, vision-qa, long-context |
| zai-org/glm-5.2 | $1.40/$4.40 per M | token_based | 0.35 / 1.1 | [text] → [text] | chat, completion, long-context |
| suno/chirp-v4 · v5 | ≈$0.132/次 | per_request | 33 | [text] → [audio] | text-to-music |

批量写入：`pnpm --filter @mxmai/mxmcgi run seed:provider-atlascloud-models` +  
`upsert:provider-pricing -- --file mxmcgi/src/scripts/data/atlascloud-pricing.json`

## 7. 命令速查

```bash
# 冒烟
pnpm --filter @mxmai/mxmcgi run probe:provider-model -- --provider maxplan --model MiniMax-M3

# 定价 upsert（本地 .env Supabase）
pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- --file /tmp/pricing.json

# 批量 maxplan 官方价
pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-pricing

# 写生产库（模型 / 定价）
bash scripts/sync-provider-db-production.sh --models --pricing
# 仅定价：
bash scripts/sync-provider-db-production.sh --pricing

# 仅更新模态 capabilities（不动其它列）
bash scripts/sync-modality-capacities-production.sh --dry-run   # 先看 diff
bash scripts/sync-modality-capacities-production.sh             # 真跑

# 静态能力分布报告
pnpm --filter @mxmai/mxmcgi run report:hk-modalities

# Provider 代码变更后
pnpm deploy:hk -- --backend-only
ssh mxm-hk 'pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler'
```

生产 Supabase：港机 `/opt/supermxmai/.env` 有 `SUPABASE_URL` + `SUPABASE_DB_URL`（可能无 `SUPABASE_SERVICE_ROLE_KEY`）。同步脚本优先 SERVICE_ROLE；否则 SSH 港机用 `pg` + DB URL upsert。

## 8. Probe 参数提示

| 模态 | probe 默认行为 |
|------|----------------|
| text | 短 prompt，max_tokens 小 |
| image | 简单英文 prompt，n=1 |
| audio/TTS | 短中文，默认 voice |
| music | 短 prompt，instrumental 视模型 |
| video | 短 prompt + 短 duration；适当加大 `--timeout-ms` |
| 3d | 短英文 prompt（多数 atlas 3d 模型 1k 图起步） |
| embedding | 短中文文本，检查返回维度 |

## 9. Checklist（交付前勾选）

- [ ] `provider_models` 行存在且 `is_enabled`
- [ ] protocol/modality 与 Provider 路由匹配
- [ ] `capabilities` 已带 `supported_inputs` / `supported_outputs` / `modes`（双写 `input/output`）
- [ ] `HK_*_MODALITIES` 集中表已加新 model_key（若新增）
- [ ] probe 退出码 0，有合理 usage / URL
- [ ] `provider_pricing` 成本 + platform_* 齐全
- [ ] 生产库已 upsert，mxmcgi 已 reload
- [ ] `report:hk-modalities` 输出含新模型
- [ ] Admin 刷新可见；用户说明售价、扣费口径、模态能力
