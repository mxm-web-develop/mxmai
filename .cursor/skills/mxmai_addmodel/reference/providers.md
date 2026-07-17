# mxmai Provider 文档与价格参考链接

> 说明：本文件只用于 **开发阶段查阅与对接参考**，真实计费逻辑以各平台最新官网价格为准。  
> Provider 名称与代码中的 `ProviderType`、Admin「物理模型」中的 `provider` 字段一致。  
> **新增模型时**：除本文件给的官方文档 + 价格外，还需按 [modality-cookbook.md](../../mxmai_provider_maintain/reference/modality-cookbook.md) 声明输入/输出模态，写入 `provider_models.capabilities`。

---

## deer / DeerAPI（图像 / 文本 / 音频 / 视频）

- **代码 ProviderType**：`deer`  
- **平台名称**：DeerAPI  
- **官方文档入口**：  
  - 通用文档与 API 说明：`https://api.deerapi.com`  
  - Gemini 图像更新说明（nano-banana-2 等）：`https://api.deerapi.com/gemini-3.1-flash-image-update`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://api.deerapi.com/pricing`
- **模态声明参考**（依上游 API 实际支持填）：
  - 图像类：`supported_inputs: [text, image]` / `supported_outputs: [image]` / `modes: [text-to-image, image-edit]`
  - 文本类：`supported_inputs: [text]` / `supported_outputs: [text]` / `modes: [chat, completion]`

---

## replicate（图像 / 文本 等）

- **代码 ProviderType**：`replicate`  
- **平台名称**：Replicate  
- **官方文档入口**：  
  - 开发者文档：`https://replicate.com/docs`
- **价格与套餐**：  
  - 官方 pricing 页面：`https://replicate.com/pricing`
- **模态声明参考**：
  - Replicate 模型多以 `owner/model` 形式存在；每个模型页面的"Inputs/Outputs"段会列出支持类型。
  - 例：`stability-ai/sdxl` → inputs `[text]` → outputs `[image]`，`modes: [text-to-image]`。

---

## ppio（图像 / 音频 等）

- **代码 ProviderType**：`ppio`  
- **平台名称**：PPIO  
- **官方文档入口**：  
  - 文档首页：`https://www.ppio.ai/docs`
- **价格与套餐**：  
  - 官方 pricing / 计费说明：`https://www.ppio.ai/pricing`
- **模态声明参考**：同 Replicate（按上游模型页面的 Inputs/Outputs 填）。

> 若链接有变动，可根据「PPIO AI pricing」关键字搜索最新页面。

---

## minimax（主要音频）

- **代码 ProviderType**：`minimax`  
- **平台名称**：MiniMax  
- **官方文档入口**：  
  - API 文档首页：`https://api.minimax.chat/document/guides`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://api.minimax.chat/document/price`
- **模态声明参考**：
  - TTS：`supported_inputs: [text]` / `supported_outputs: [audio]` / `modes: [text-to-speech]`
  - 旧接口 `text_to_speech` 仍可填，protocol 走 `t2a_v2` 之外的兼容分支。

---

## openai（文本 / 图像 / 多模态）

- **代码 ProviderType**：`openai`  
- **平台名称**：OpenAI Platform  
- **官方文档入口**：  
  - 开发者文档：`https://platform.openai.com/docs`
- **价格与套餐**：  
  - 官方 pricing 页面：`https://platform.openai.com/pricing`
- **模态声明参考**：
  - GPT-4o / GPT-4 Turbo：`inputs: [text, image]` / `outputs: [text]` / `modes: [chat, completion, multimodal-qa, vision-qa]`
  - GPT-Image-1 / DALL·E 3：`inputs: [text]` 或 `[text, image]` / `outputs: [image]` / `modes: [text-to-image, image-edit]`
  - Embedding：`inputs: [text]` / `outputs: [embed]` / `modes: [embedding]`（必填 `vector_dim`）

---

## google（Gemini 系列）

- **代码 ProviderType**：`google`  
- **平台名称**：Google AI / Gemini API  
- **官方文档入口**：  
  - Gemini API 文档：`https://ai.google.dev/gemini-api/docs`
- **价格与套餐**：  
  - 官方 pricing 页面：`https://ai.google.dev/pricing`
- **模态声明参考**：
  - Gemini 2.5/3.x Flash / Pro：`inputs: [text, image, video, audio]` / `outputs: [text]` / `modes: [chat, multimodal-qa]`
  - Gemini Image 系列（`gemini-2.5-flash-image` 等）：`inputs: [text, image]` / `outputs: [image]` / `modes: [text-to-image, image-edit]`

---

## anthropic（Claude 系列）

- **代码 ProviderType**：`anthropic`  
- **平台名称**：Anthropic Claude API  
- **官方文档入口**：  
  - API 文档：`https://docs.anthropic.com/en/api`
- **价格与套餐**：  
  - 官方 pricing 页面：`https://www.anthropic.com/pricing`
- **模态声明参考**：
  - Claude Opus / Sonnet 4.x：`inputs: [text, image]`（PDF/截图） / `outputs: [text]` / `modes: [chat, completion, vision-qa]`
  - Claude 3 Haiku：`inputs: [text, image]` / `outputs: [text]`
  - 早期 Claude 3.5 文本模型：`inputs: [text]` / `outputs: [text]`

---

## qwen（通义千问 / DashScope）

- **代码 ProviderType**：`qwen`  
- **平台名称**：阿里云 DashScope / 通义千问  
- **官方文档入口**：  
  - DashScope 文档首页：`https://help.aliyun.com/zh/model-studio`  
  - 通义千问模型文档：`https://dashscope.aliyun.com/`（登录后查看具体模型文档）
- **价格与套餐**：  
  - 官方 pricing 页面：`https://www.aliyun.com/activity/dashscope/pricing`
- **模态声明参考**：
  - 文本（qwen-plus / qwen-max / qwen3-235b 等）：`inputs: [text]` / `outputs: [text]` / `modes: [chat, completion]`
  - 视觉（qwen-vl-plus）：`inputs: [text, image]` / `outputs: [text]` / `modes: [vision-qa]`
  - 图像（wanx 系列）：`inputs: [text]` / `outputs: [image]` / `modes: [text-to-image]`
  - 音频（qwen-audio / cosyvoice）：`inputs: [text]` / `outputs: [audio]` / `modes: [text-to-speech]`
  - Embedding（text-embedding-v3）：`inputs: [text]` / `outputs: [embed]` / `modes: [embedding]`（`vector_dim` 必填）

---

## volc（火山引擎 / 豆包 / Seedream）

- **代码 ProviderType**：`volc`  
- **平台名称**：火山引擎 Doubao / Seedream 等  
- **官方文档入口**：  
  - Doubao / Seedream 文档入口：`https://www.volcengine.com/docs`（搜索 Doubao / Seedream 相关文档）
- **价格与套餐**：  
  - 官方 pricing 页面（Doubao / AI 相关）：`https://www.volcengine.com/pricing`
- **模态声明参考**：
  - Doubao-pro / lite：`inputs: [text]` / `outputs: [text]` / `modes: [chat, completion]`
  - Seedream 3.0/4.0：`inputs: [text]` 或 `[text, image]` / `outputs: [image]` / `modes: [text-to-image, image-edit]`

---

## 使用建议

- 新增模型时，先从这里找到对应 Provider 的官方文档和价格页，核对：  
  - 物理模型 ID（model name）；  
  - 支持的模态和参数；  
  - 计费单位与价格。
- 然后再回到 `SKILL.md` 中的步骤，按「provider_models（Admin，含 capabilities）→ registerModel / Provider 代码 → provider_pricing → 可选 routing」的顺序完成对接。
- **不要忘了填 capabilities 模态三件套**（`supported_inputs` / `supported_outputs` / `modes`），不填会被业务路由当成"零能力"模型拒绝调用。
