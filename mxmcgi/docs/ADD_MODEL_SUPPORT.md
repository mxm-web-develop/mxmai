## 在 mxmcgi 中新增模型支持指南（以 DeerAPI 为例）

本文档说明如何在 `mxmcgi` 中接入一个新的模型，并让它在 Admin 配置层（模型通道管理 / 定价管理）里可见和可配置。下面以我们刚刚接入的 `deerapi` 图像模型 `nano-banana-2` 为例。

### 一、整体流程概览

新增任意模型，一般需要完成 4 层配置：

1. **能力声明层（模型注册）**  
   - 在 `mxmcgi/src/models/**` 下新增对应模型文件，并在文件中调用 `registerModel()` 完成注册。  
   - 这样 `listModels()` 才能枚举到该模型，Admin 后台下拉框才能出现对应的物理模型名。

2. **Provider 适配层（调用逻辑）**  
   - 在对应 Provider 实现中，确保 `supportsModel()` 返回 `true`，并在 `generate()` 中正确分发到对应的上游 API。  
   - 对于 DeerAPI，这部分逻辑在 `mxmcgi/src/models/deerapi/provider.ts`。

3. **支持列表 / 上游模型映射层（可选但推荐）**  
   - 在 `mxmcgi/src/models/suport-list.ts` 中补充该模型的映射：  
     - 本地模型 key（例如 `nano-banana-2`）  
     - 上游真实模型名（例如 `gemini-3.1-flash-image-preview`）  
     - 默认价格、计费模式等（仅作参考，真实计费以数据库为准）。

4. **计费配置层（数据库 provider_pricing）**  
   - 在 `mxmdata` 的 `provider_pricing` 表中为该模型增加或更新定价行，用于真实扣费。  
   - 可通过 Admin 后台「模型价格管理」页面或直接执行 SQL 完成。

> 注意：**只有完成第 1 步（模型注册），新模型才能出现在 Admin 的物理模型下拉框中。**  
> 第 3、4 步主要影响价格展示和实际扣费。

---

### 二、步骤一：在 `models` 层注册新模型

以 DeerAPI 图像模型 `nano-banana-2` 为例：

1. **选择目录结构**
   - Provider：`deerapi`  
   - 业务域（scope）：`graph`（图片生成）  
   - 建议放在：`mxmcgi/src/models/deerapi/graph/` 目录下。

2. **创建模型定义文件**
   - 文件路径示例：`mxmcgi/src/models/deerapi/graph/nano-banana-2.ts`  
   - 内容可以参考已有的 `nano-banana.ts` / `nano-banana-pro.ts`，保持一致的参数和返回结构：
     - 定义 `NanoBanana2Params` / `NanoBanana2Result` 接口，继承自 `GenerateParams` / `GenerateResult`；
     - 在 `generateImpl` 内部通过：
       - `providerFactory.getProviderForModel(modelKey, preferred)` 选出实际 Provider；
       - 组装 `GenerateParams`，透传 `aspect_ratio`、`image_size`、`image` / `image_urls` / `image_base64s` 等参数；
       - 调用 `modelProvider.generate(modelKey, generateParams)`；
     - 定义 `definition: ModelDefinition<...>`，设置：
       - `provider: 'deer'`
       - `scope: 'graph'`
       - `modelKey: 'nano-banana-2'`
     - 最后调用 `registerModel(definition)` 并导出 `default`。

3. **将模型纳入 DeerAPI graph 注册入口**
   - 更新 `mxmcgi/src/models/deerapi/graph/index.ts`，引入新模型文件：
     - `import './nano-banana-2';`
     - `import './nano-banana-2-pro';`（如同时新增 Pro 版）
   - 这个文件仅用于「副作用导入」，确保服务启动时模型定义文件会被执行，从而完成 `registerModel()`。

完成上述步骤后，后端的 `listModels()` 会包含新模型，`/api/v1/system/admin/providers/options` 返回的 `modelsByProvider` / `modelsByProviderByScope` 中也会多出该模型，Admin 前端的「物理模型」下拉就能看到对应项。

---

### 三、步骤二：在 Provider 中接入调用逻辑

对于 DeerAPI，Provider 实现在 `mxmcgi/src/models/deerapi/provider.ts`：

1. **确保 `supportsModel()` 返回 true**
   - DeerProvider 通过 `suport-list.ts` 自动构建支持列表，一般只要在 `suport-list.deer` 中添加了模型映射，`supportsModel(modelName)` 就会返回 `true`。

2. **在 `generateImage()` 中识别新模型类型（如有特殊分支）**
   - DeerAPI 的图像模型根据类型选择不同的调用方式，例如：
     - `nano-banana` / `nano-banana-pro` → 使用 `generateImageWithGemini()`；
     - `flux-*` → 使用 `generateImageWithReplicate()`；
     - `seedream-4` → 使用 `generateImageWithSeedream()`。
   - 当新增 `nano-banana-2` / `nano-banana-2-pro` 时，需要把它们加入 Gemini 模型分支，例如：
     - `modelName === 'nano-banana-2' || 'nano-banana-2-pro'` 也走 `isGeminiModel` 分支。

3. **必要时同步更新工具函数的类型约束**
   - 比如参考图处理函数 `processReferenceImages()`，如果它的 `modelName` 联合类型中限制了模型名，需要把新模型加进去，避免 TS 报错。

> 如果新增的是「纯文本模型」或「视频 / 音频模型」，对应的特殊分支可能在 `generateText()` / `generateVideo()` / `generateAudio()` 等函数中，需要按实际情况调整。

---

### 四、步骤三：在 `suport-list.ts` 中声明映射（推荐）

`mxmcgi/src/models/suport-list.ts` 统一维护「本地模型 key → 上游物理模型名 + 默认价格」映射，例如 Deer 的图像部分：

- 在 `deer.graph` 下为新模型添加配置，例如：
  - `nano-banana-2` → `gemini-3.1-flash-image-preview`
  - `nano-banana-2-pro` → `gemini-3.1-flash-image`
- 字段含义：
  - `modelname`: 上游真实模型 ID；
  - `price`: 参考成本价（USD）；
  - `charge_mode`: 计费模式，需与 `provider_pricing.charge_mode` 字符串保持一致；
  - `currency`: 币种（通常 `USD`）；
  - `service`（可选）: 子服务名称，例如 `google`。

> 提醒：**实际扣费已经全面迁移到数据库的 `provider_pricing` 表**，`suport-list.ts` 中的价格更多是默认/文档用途，方便前端和 Provider 代码使用，具体数值以 DB 为准。

---

### 五、步骤四：在数据库中配置定价（`provider_pricing`）

计费逻辑完全依赖 `mxmdata` 数据库中的 `provider_pricing` 表，详情见 `docs/billing-architecture.md`。

新增模型后，需要：

1. 在 Admin 后台「模型价格管理」页面新增一条 Provider 定价，或执行 SQL：
   - `provider`: 物理 Provider，例如 `deer`；
   - `scope`: 业务域，例如 `graph` / `writing` / `audio` / `video` / `text`；
   - `model_key`: 物理模型 key，例如 `nano-banana-2`；
   - `charge_mode`: 与模型类型对应的计费方式，例如 `per_image` 或 `token_based`；
   - `unit_price` / `input_unit_price` / `output_unit_price` 等字段按需要填写。

2. 可同时录入平台售价字段（`platform_*`），用于用户侧 MXM-TOKEN 扣费。

> 如果 `provider_pricing` 中没有该模型的定价，任务仍可正常调用，只是不会产生费用（即「未配置定价时不拦截」）。

---

### 六、步骤五：更新默认路由（可选）

默认的「逻辑模型 → Provider/物理模型」映射在 `mxmcgi/src/core/providers/model-routing.ts` 的 `defaultRouting` 中维护，例如：

- `graph-photograph` → `{ provider: 'deer', model: 'nano-banana-pro' }`

如果希望新模型成为某个业务逻辑的默认物理模型，可以：

1. 在 `defaultRouting` 中，将对应逻辑 key 的 `model` 修改为新模型（如 `nano-banana-2-pro`）；  
2. 或者在 Admin 后台「模型通道管理」中，通过路由编辑弹窗为某个逻辑模型设置覆盖路由（写入 `model_routing_overrides` 表）。

---

### 七、步骤六：重启服务并验证

1. 在仓库根目录执行：

```bash
pnpm dev:mxmcgi
```

或重启已有的 `mxmcgi` 服务，使新的模型定义和路由生效。

2. 使用 Admin 后台：
   - 打开「模型通道管理」页面；
   - 编辑任一逻辑模型（比如 `graph-painting`），选择 Provider 为 `deer`；
   - 检查「物理模型」下拉是否能搜索并选择新模型（例如 `nano-banana-2`）。  

3. 发起一次实际调用（前端业务或测试脚本），确认：
   - 任务能正常完成并返回结果；
   - `provider_usage_records` 中有相应记录；
   - 如已配置 `provider_pricing`，任务完成后能产生正确的扣费。

完成以上步骤，即完成了一个新模型从「能力注册 → Provider 适配 → 上游映射 → 定价配置 → 路由配置」的完整接入流程。新增其他 Provider 或模态的模型时，也可以参照同样的思路进行扩展。

