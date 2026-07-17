---
name: mxmai-addmodel
description: Adds or updates model support in the mxmcgi service. Use when the user mentions adding a new model (with a specific provider like deer, replicate, ppio, openai, google, anthropic, etc.) and usually shares the upstream API or pricing docs, and they want this model to appear in the admin "模型通道管理/模型价格管理" configuration layer with correct input/output modality capabilities and platform pricing.
---

# 在 mxmcgi 中新增模型支持（mxmai 专用流程）

> **主通道 atlascloud / maxplan**：请改用 [`.cursor/skills/mxmai_provider_maintain/SKILL.md`](../mxmai_provider_maintain/SKILL.md)（含官方定价、probe 门禁、模态能力集中表、同步生产）。本 skill 覆盖 deer / replicate / openrouter 等其它 Provider。

> 适用场景：用户说"给 DeerAPI/Replicate/OpenAI 等新增某个模型"，并提供了对应的线上文档或 pricing 页，希望：
> - 代码能调用新模型；
> - Admin 后台（模型通道管理页面）能在下拉中选择该模型；
> - 计费层可以配置该模型的成本价和平台售价；
> - **业务层知道该模型允许什么输入、能输出什么**（`capabilities` 双写：supported_inputs/outputs/modes）。

默认服务：`mxmcgi`（AI 内容生成服务），仓库根为 `/Users/mxm_pro/Desktop/codes/supermxmai`。  
各 Provider 的官方文档与价格链接汇总见：[reference/providers.md](reference/providers.md)。  
**模态枚举 + 决策流程**见：[../mxmai_provider_maintain/reference/modality-cookbook.md](../mxmai_provider_maintain/reference/modality-cookbook.md)。

## 总体原则

- **物理模型与上游 ID 以数据库为准**：表 `provider_models`（Admin「物理模型」）+ 启动时 `loadProviderModelCatalog()`；Provider 的 `supportsModel` / 上游解析依赖该表，**不再使用已删除的静态 `suport-list.ts`**。
- **真实计费以 `provider_pricing` 为准**（Admin「模型价格管理」或 SQL）。
- **新增模型时，一定要完成「模型注册」**：只有通过 `registerModel()` 注册过的模型才会出现在 Admin 的部分下拉中（由 `listModels()` + `/system/admin/providers/options` 提供）。
- **模型能力（输入/输出模态）必须随模型一起声明**：每个新模型都要在 `provider_models.capabilities` JSONB 里写双写 `supported_inputs[]` / `supported_outputs[]` / `modes[]`（外加旧的 `input/output` 嵌套对象，保持向后兼容）。**不写模态 = 业务无法判断"该模型能否接音频/视频输入"，必失败**。
- **尽量沿用现有同类模型的模式**：新的图像模型参考现有 nano-banana/flux/seedream，文本模型参考现有 gemini/qwen/gpt，避免重新发明轮子。

当你接到"新增某模型支持"的请求时，请按下面的步骤执行。

---

## 步骤 0：确认输入信息

从用户对话和链接中提取以下关键信息（如果缺失，可以推断或简单向用户补问）：

1. **Provider 类型**：`deer` / `replicate` / `ppio` / `openai` / `google` / `anthropic` / `qwen` / `volc` / `minimax` 等。
2. **业务模态 / 作用域 scope**：`graph`（图像）、`text`/`writing`（文本）、`audio`、`video`、`music`、`knowledge`（embedding）。
3. **逻辑模型 key（本仓库要使用的名字）**：例如 `nano-banana-2`。
4. **上游物理模型名**：来自官方文档或 pricing 页，例如 `gemini-3.1-flash-image-preview`。
5. **大致计费模式与价格**：按图片、按 token、按时长等（用于配置 `provider_pricing`）。
6. **`supported_inputs[]`**：6 选 N — `text` / `image` / `audio` / `video` / `3d` / `embed`（看上游 API 文档）。
7. **`supported_outputs[]`**：同上。
8. **`modes[]`**（可选）：`*->*` 模式（`text-to-image` / `reference-to-video` / `chat` / `embedding` …），参照 modality-cookbook.md 选值。

> 若用户只给了 pricing 链接（如 `https://api.deerapi.com/pricing`），可以根据页面内容推断模型名和收费模式。  
> **模态字段（6/7/8）不能省**，按"该上游 API 接受什么输入 / 产出什么"判断，必要时查 [reference/providers.md](reference/providers.md) 的官方文档链接。

---

## 步骤 1：在 Admin 配置物理模型（`provider_models`）

作用：让运行时识别「该 provider 支持哪些 `model_key`」以及「上游物理模型 ID」。

1. 打开 Admin →「模型通道管理」→「物理模型」Tab（或调用 `POST /api/v1/system/admin/providers/models`）。
2. 新增一行，填写：
   - `provider`：如 `deer`、`replicate`；
   - `scope`：如 `graph`、`writing`；
   - `model_key`：逻辑名，如 `nano-banana-2`；
   - `upstream_model`：上游真实 ID（Replicate 须为 `owner/model` 格式）；
   - **「模型能力参数」Tab** 必填：
     - 支持的输入模态（多选，6 选 N）
     - 支持的输出模态（多选，6 选 N）
     - 支持的 `*-to-*` 模式（tag 多选）
     - `context_window`（LLM 必填）、`vector_dim`（embedding 必填）
   - 启用状态。
3. 保存后重启或等待 catalog 刷新（若接口已触发 `refreshProviderModelCatalog` 则无需全量重启）。

> 无 `provider_models` 记录时，`supportsModel` 一般为 `false`，调用会在上游解析阶段失败。  
> 模态能力字段的 schema 详见 [modality-cookbook.md](../mxmai_provider_maintain/reference/modality-cookbook.md)；批量脚本可走 `mxmcgi/src/scripts/data/hk-provider-modalities.ts`（仅 atlascloud/maxplan/jiekou 三个 HK provider，**其它 provider 暂时走 Admin 手动**）。

---

## 步骤 2：在 `models` 层注册新模型（保证 Admin 下拉可见）

核心思想：**每个模型对应一个 TS 文件，在模块顶层调用 `registerModel()`。**

1. 根据 **逻辑 Provider（代码里的 ProviderType）** 和 scope 决定目录：

   - Deer 图像：`mxmcgi/src/models/deerapi/graph/`
   - Deer 文本：`mxmcgi/src/models/deerapi/writing/`
   - Replicate 图像：`mxmcgi/src/models/replicate/graph/`
   - OpenAI 文本（直连官方）：`mxmcgi/src/models/openai/**`

> 例如：DeerAPI 统一封装多家上游，逻辑 provider 为 `'deer'` 时模型文件放在 `models/deerapi/**`；直连 OpenAI 官方 API 的放在 `models/openai/**`。

2. 复制最近的同类型模型文件作为模板，修改 `modelKey`、`logicalProvider`、`generateImpl` 等。

3. 将新模型文件加入对应的 `index.ts` 副作用导入，例如 Deer 图像：

```ts
import './nano-banana-2';
```

> 一旦模型文件被导入，`registerModel()` 会在服务启动时执行，使该模型出现在 `listModels()` 与 Admin 相关下拉里。

---

## 步骤 3：在 Provider 实现中接入调用逻辑

Provider 实现定义了"如何真正调用上游 API"。不同 Provider 文件位置示例：

- DeerAPI：`mxmcgi/src/models/deerapi/provider.ts`
- Replicate：`mxmcgi/src/models/replicate/provider.ts`
- PPIO：`mxmcgi/src/models/ppio/provider.ts`
- OpenAI/Google/Anthropic：对应 `src/models/{provider}/provider.ts`

执行以下检查：

1. **确认 `supportsModel()`**  
   - 依赖 **`provider_models` 中已启用的行**；确保步骤 1 已配置正确。

2. **为特殊分支添加模型（图像/视频常见）**  
   - 例如 DeerAPI `generateImage()` 中 Gemini / Flux / Seedream 分支，把新 `model_key` 加入对应判断条件。

3. **同步类型/工具函数**  
   - 若有工具函数对 `modelName` 使用了联合类型限制，需要把新模型名加入，以免 TS 报错。

---

## 步骤 4：配置数据库定价（表 `provider_pricing`）

> 真实扣费逻辑在 `docs/billing-architecture.md` 中有详细说明。  
> 售价公式：`platform_* = usd_cost × 100 × 2.5`（1 MXM-TOKEN ≈ $0.01，2.5× 加价）。

1. Admin →「模型价格管理」：新增 `provider` + `scope` + `model_key` 与单价、`charge_mode` 等。
2. 或直接使用 SQL/migration 插入一行。
3. 或用脚本：

```bash
pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- \
  --provider deer --scope graph --model nano-banana-2 \
  --mode per_image --unit-usd 0.02
```

> 若未配置 `provider_pricing`，该模型仍可调用，只是暂不产生费用（视 BillingService 策略而定）。

---

## 步骤 4.5：补/校验模态能力（必做，2026-07+）

> 与 [mxmai_provider_maintain §1.5](../mxmai_provider_maintain/SKILL.md) 一致。即使本 skill 覆盖的 Provider 不在 HK 集中数据源里，**也要**在 Admin「物理模型」编辑时把 capabilities 三件套填齐（否则业务路由会判错）。

- 校验工具：`mxmcgi/src/models/provider-modality.ts` 的 `normalizeModalityList()` 会在运行时过滤非法值。
- 校验清单（手工）：
  - [ ] `supported_inputs` / `supported_outputs` 全是 6 选 N
  - [ ] LLM 必有 `supported_outputs: [text]`
  - [ ] 生图必有 `supported_outputs: [image]`，modes 含 `text-to-image`
  - [ ] 生视频必有 `supported_outputs: [video]`，modes 含 `text-to-video` 或 `image-to-video`
  - [ ] Embedding 必有 `supported_outputs: [embed]` + `vector_dim`
  - [ ] 3D 必有 `supported_outputs: [3d]`，modes 含 `text-to-3d` / `image-to-3d`

---

## 步骤 5：如需要，更新默认路由 `defaultRouting`

默认逻辑模型到物理 Provider/模型的映射位于 `mxmcgi/src/core/providers/model-routing.ts` 中的 `defaultRouting`。

也可在 Admin 设置覆盖路由（`model_routing_overrides`），不必改代码。

---

## 步骤 6：重启服务并验证

```bash
pnpm dev:mxmcgi
```

在 Admin 验证物理模型、定价、模态能力、business 路由；发起一次实际调用确认结果与 usage。

---

## 使用本 Skill 时的提示

当用户说"新增某模型支持"时，你应：

1. 从文档中确定上游物理模型 ID、模态、计费模式、**输入/输出能力**。
2. 按顺序：**Admin `provider_models`（含 capabilities）→ `registerModel` 与 Provider 分支 → `provider_pricing` → 可选 `defaultRouting`**。
3. 沿用已有同类模型的模式，避免不一致的参数命名或调用风格。
4. **不要**只填价格不填模态；**不要**把模态写进 `default_parameters`。
