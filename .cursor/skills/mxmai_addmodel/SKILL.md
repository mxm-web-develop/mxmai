---
name: mxmai-addmodel
description: Adds or updates model support in the mxmcgi service. Use when the user mentions adding a new model (with a specific provider like deer, replicate, ppio, openai, google, anthropic, etc.) and usually shares the upstream API or pricing docs, and they want this model to appear in the admin “模型通道管理/模型价格管理” configuration layer.
---

# 在 mxmcgi 中新增模型支持（mxmai 专用流程）

> 适用场景：用户说“给 DeerAPI/Replicate/OpenAI 等新增某个模型”，并提供了对应的线上文档或 pricing 页，希望：
> - 代码能调用新模型；
> - Admin 后台（模型通道管理页面）能在下拉中选择该模型；
> - 计费层可以配置该模型的成本价和平台售价。

默认服务：`mxmcgi`（AI 内容生成服务），仓库根为 `/Users/mxm_pro/Desktop/codes/supermxmai`。  
各 Provider 的官方文档与价格链接汇总见：[reference/providers.md](reference/providers.md)。

## 总体原则

- **不要急于完全 DB 驱动模型列表**：目前真实计费已由数据库表 `provider_pricing` 决定，`suport-list.ts` 主要承担“支持列表 + 上游模型映射 + 默认价格”的角色，继续使用即可。
- **新增模型时，一定要完成“模型注册”**：只有通过 `registerModel()` 注册过的模型才会出现在 Admin 的下拉中（由 `listModels()` + `/system/admin/providers/options` 提供）。
- **尽量沿用现有同类模型的模式**：新的图像模型参考现有 nano-banana/flux/seedream，文本模型参考现有 gemini/qwen/gpt，避免重新发明轮子。

当你接到“新增某模型支持”的请求时，请按下面的步骤执行。

---

## 步骤 0：确认输入信息

从用户对话和链接中提取以下关键信息（如果缺失，可以推断或简单向用户补问）：

1. **Provider 类型**：`deer` / `replicate` / `ppio` / `openai` / `google` / `anthropic` / `qwen` / `volc` / `minimax` 等。
2. **业务模态 / 作用域 scope**：`graph`（图像）、`text`/`writing`（文本）、`audio`、`video`。
3. **逻辑模型 key（本仓库要使用的名字）**：例如 `nano-banana-2`、`gemini-3.1-flash-image-preview`。
4. **上游物理模型名**：来自官方文档或 pricing 页，例如 `gemini-3.1-flash-image`。
5. **大致计费模式与价格**：是按图片、按 token、还是按时长（仅用于默认值，真实价格以后可由 Admin 在 DB 中修改）。

> 若用户只给了 pricing 链接（如 `https://api.deerapi.com/pricing`），可以根据页面内容推断模型名和收费模式。

---

## 步骤 1：在 `suport-list.ts` 声明模型映射（统一入口）

作用：为 Provider 提供“支持列表 + 上游模型名 + 默认价格”。  
位置：`mxmcgi/src/models/suport-list.ts`

1. 打开 `suport-list.ts`，找到对应 Provider 的配置块，例如：
   - Replicate 图像：`export default { replicate: { graph: { ... } } }`
   - Deer 图像：`deer: { graph: { ... } }`
   - Deer 文本：`deer: { text: { ... } }`

2. 在正确的 Provider + scope 下新增条目，示例（Deer 图像的新 nano-banana 版本）：

```ts
'nano-banana-2': {
  modelname: 'gemini-3.1-flash-image-preview', // 上游物理模型名
  price: 0.06,                                  // 参考成本价（USD，可粗略）
  charge_mode: ChargeMode.per_change_mode,      // 与模型类型对应（例如图片按次）
  currency: 'USD',
  service: 'google',                            // 如有子服务可填（可选）
},
```

3. 对于多 Provider 共享的逻辑模型（如 nano-banana 在 deer / replicate / ppio 同时存在），确保各 Provider 的配置一致或注明差异。

> 这一步不会直接影响真实扣费，但会影响：
> - Provider 的 `supportsModel(modelName)`；
> - `/system/models` 接口的返回；
> - 部分文档示例中的默认价格展示。

---

## 步骤 2：在 `models` 层注册新模型（保证 Admin 下拉可见）

核心思想：**每个模型对应一个 TS 文件，在模块顶层调用 `registerModel()`。**

1. 根据 **逻辑 Provider（代码里的 ProviderType）** 和 scope 决定目录（按“谁在对外提供服务/计费”来分，而不是按上游云厂商来分）：

   - Deer 图像：`mxmcgi/src/models/deerapi/graph/`
   - Deer 文本：`mxmcgi/src/models/deerapi/writing/`
   - Replicate 图像：`mxmcgi/src/models/replicate/graph/`
   - OpenAI 文本（直接走 OpenAI 官方，而不是通过 DeerAPI 转发）：`mxmcgi/src/models/openai/**`

> 例如：DeerAPI 这个第三方 provider 统一封装了 Google / Anthropic / OpenAI 等多家模型，但在本项目里只要是“走 DeerAPI 的请求”，逻辑 provider 都是 `'deer'`，对应的模型文件一律放在 `models/deerapi/**` 下；只有真正走 OpenAI 官方 API 的模型才放到 `models/openai/**`。

2. 复制最近的同类型模型文件作为模板：

   - 图像示例：以 `nano-banana.ts` 或 `nano-banana-pro.ts` 作为模板；
   - 文本示例：以 `gemini-2-5-flash.ts`、`gpt-5-2.ts` 作为模板；
   - 视频 / 音频示例：参考已有 `sora-*` 或 `suno-music` 等。

3. 修改模板中的关键点：

   - `modelKey`：改为新逻辑模型名，例如 `'nano-banana-2'`；
   - `logicalProvider`：保持为对应 Provider，比如 `const logicalProvider = 'deer';`；
   - 参数接口：根据官方文档保留/扩展必要字段，推荐继承 `GenerateParams` 并添加：
     - 图像：`aspect_ratio`、`image_size`、`image`、`image_urls`、`image_base64s`、`enableProgress` 等；
     - 文本：主要使用 `prompt` + `parameters`（`temperature`、`max_tokens` 等）。
   - `generateImpl` 中：
     - 使用 `providerFactory.getProviderForModel(modelKey, preferred)` 选 Provider；
     - 组装 `GenerateParams`，注意把额外参数放到 `parameters` 字段；
     - 调用 `modelProvider.generate(modelKey, generateParams)`；
     - 将返回的 `mediaUrls` 映射成更易用的字段（例如 `image_urls`）。

4. 定义并注册模型：

   - 构造 `definition: ModelDefinition<Params, Result>`：
     - `provider: logicalProvider`
     - `scope: 'graph' | 'text' | 'audio' | 'video'`
     - `modelKey`
     - `generate: generateImpl`
   - 调用 `registerModel(definition)`；
   - `export default definition;`

5. 将新模型文件加入对应的 `index.ts` 中以触发副作用导入（同样按逻辑 provider 归类），例如 Deer 图像：

   - 位置示例：
     - Deer 图像：`mxmcgi/src/models/deerapi/graph/index.ts`
     - OpenAI 文本（直接走 OpenAI）：`mxmcgi/src/models/openai/index.ts`，并在 `mxmcgi/src/index.ts` 中有 `import './models/openai';`
   - 添加示例（Deer）：

```ts
import './nano-banana-2';
import './nano-banana-2-pro';
```

> 一旦模型文件被导入，`registerModel()` 会在服务启动时执行，使该模型出现在 `listModels()` 的结果中，从而进入 Admin 的下拉选项（包括「业务模型管理」和「Provider 定价」里的模型键下拉）。

---

## 步骤 3：在 Provider 实现中接入调用逻辑

Provider 实现定义了“如何真正调用上游 API”。不同 Provider 文件位置示例：

- DeerAPI：`mxmcgi/src/models/deerapi/provider.ts`
- Replicate：`mxmcgi/src/models/replicate/provider.ts`
- PPIO：`mxmcgi/src/models/ppio/provider.ts`
- OpenAI/Google/Anthropic：对应 `src/models/{provider}/provider.ts`

执行以下检查：

1. **确认 `supportsModel()` 覆盖新模型**

   - DeerAPI / Replicate 等一般通过 `suport-list.ts` 自动构建支持列表；
   - 确保 `suport-list` 中已有该模型配置后，`supportsModel(modelName)` 就能返回 `true`；
   - 如果 Provider 使用硬编码数组（例如特殊模型列表），需要手动把新模型加入数组。

2. **为特殊分支添加模型（图像/视频常见）**

   - 例如 DeerAPI 图像中的 `generateImage()` 会区分：
     - Gemini 系列（nano-banana*）→ `generateImageWithGemini`；
     - Flux 系列（flux-*）→ `generateImageWithReplicate`；
     - Seedream 系列（seedream-4）→ `generateImageWithSeedream`。
   - 新模型如果属于某一类，需要把它加入对应的判断条件：

```ts
const isGeminiModel =
  modelName === 'nano-banana' ||
  modelName === 'nano-banana-pro' ||
  modelName === 'nano-banana-2' ||
  modelName === 'nano-banana-2-pro';
```

3. **同步类型/工具函数**

   - 若有工具函数对 `modelName` 使用了联合类型限制（例如参考图工具 `processReferenceImages()`），需要把新模型名一起加入联合类型，以免 TS 报错。

---

## 步骤 4：配置数据库定价（表 `provider_pricing`）

> 真实扣费逻辑在 `docs/billing-architecture.md` 中有详细说明，这里只列新增模型的快速步骤。

1. **通过 Admin 后台配置（优先推荐）**

   - 进入 `web` Admin 页面 → “模型通道管理” → “模型价格管理” Tab；
   - 点击「新增 Provider 定价」，填写：
     - Provider：如 `deer`；
     - Scope：`graph` / `text` / `audio` / `video`；
     - 模型键：选择刚才在下拉中可见的新模型名（比如 `nano-banana-2`）；
     - 计费方式：`per_image` / `token_based` / `per_second_*` / `per_request`；
     - 单价/输入单价/输出单价（USD）；
     - 平台售价（`platform_*`，单位 MXM-TOKEN）。

2. **或直接通过 SQL/脚本配置**

   - 使用仓库中已有的 migration / helper 脚本示例：
     - `mxmdata/src/database/migrations/add_provider_usage_pricing_and_business_pricing.sql`
     - `setup_pricing.sql`
     - `scripts/check-and-setup-pricing.ts`
   - 新增一行满足：
     - `provider = 'deer'`
     - `scope = 'graph'`
     - `model_key = 'nano-banana-2'`
     - 其它字段按文档填写。

> 若未配置 `provider_pricing`，该模型仍可调用，只是暂不产生费用（BillingService 会跳过无定价的模型）。

---

## 步骤 5：如需要，更新默认路由 `defaultRouting`

默认逻辑模型（如 `graph-photograph`）到物理 Provider/模型的映射位于：

- `mxmcgi/src/core/providers/model-routing.ts` 中的 `defaultRouting`。

当用户希望“新模型成为某业务的默认选择”时：

1. 打开 `model-routing.ts`；
2. 修改对应逻辑 key，例如：

```ts
'graph-photograph': { provider: 'deer', model: 'nano-banana-2-pro' },
```

3. 保存后，重启 `mxmcgi`，新默认路由生效。

> 业务侧也可以通过 Admin 界面设置覆盖路由（写入 `model_routing_overrides` 表），不必改代码。这适合灰度切流或频繁调整的场景。

---

## 步骤 6：重启服务并验证

1. 在仓库根目录启动或重启 `mxmcgi`：

```bash
pnpm dev:mxmcgi
```

2. 打开 Admin 后台：

   - **模型通道管理**：
     - 在“业务模型管理”Tab 中，编辑某个逻辑模型；
     - Provider 选用户指定的 Provider（如 `deer`）；
     - 检查「物理模型」下拉中是否出现新模型（如 `nano-banana-2`）。

   - **模型价格管理**：
     - 查看 `provider_pricing` 列表中是否存在对应 Provider + Scope + 模型键的定价行。

3. 发起一次实际调用（可以通过现有业务接口或测试脚本）：

   - 确认任务能成功调用到新模型并返回结果；
   - 如已配置 `provider_pricing`，在计费链路中能看到该模型的 usage 与费用记录。

---

## 使用本 Skill 时的提示

当用户说“新增某模型支持”时，你应：

1. 先解析用户给出的 Provider 名称和线上文档链接，从文档中确定：
   - 上游物理模型 ID；
   - 模型能力（图像/文本/音频/视频）；
   - 计费模式和大致价格。
2. 严格按本 Skill 的步骤修改代码与配置：
   - 先改 `suport-list.ts`；
   - 再加模型定义文件并 `registerModel()`；
   - 更新 Provider 适配逻辑；
   - 配置 `provider_pricing`；
   - 必要时调整 `defaultRouting`；
   - 最后提示用户重启服务并在 Admin 界面验证。
3. 始终沿用已有同类模型的模式，避免引入不一致的参数命名或调用风格。

