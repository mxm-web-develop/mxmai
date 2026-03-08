# mxmai Provider 文档与价格参考链接

> 说明：本文件只用于 **开发阶段查阅与对接参考**，真实计费逻辑以各平台最新官网价格为准。  
> Provider 名称与代码中的 `ProviderType` / `suport-list.ts` 中的 key 对应关系如下。

---

## deer / DeerAPI（图像 / 文本 / 音频 / 视频）

- **代码 ProviderType**：`deer`  
- **平台名称**：DeerAPI  
- **官方文档入口**：  
  - 通用文档与 API 说明：`https://api.deerapi.com`  
  - Gemini 图像更新说明（nano-banana-2 等）：`https://api.deerapi.com/gemini-3.1-flash-image-update`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://api.deerapi.com/pricing`

---

## replicate（图像 / 文本 等）

- **代码 ProviderType**：`replicate`  
- **平台名称**：Replicate  
- **官方文档入口**：  
  - 开发者文档：`https://replicate.com/docs`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://replicate.com/pricing`

---

## ppio（图像 / 音频 等）

- **代码 ProviderType**：`ppio`  
- **平台名称**：PPIO  
- **官方文档入口**：  
  - 文档首页：`https://www.ppio.ai/docs`  
- **价格与套餐**：  
  - 官方 pricing / 计费说明：`https://www.ppio.ai/pricing`

> 若链接有变动，可根据「PPIO AI pricing」关键字搜索最新页面。

---

## minimax（主要音频）

- **代码 ProviderType**：`minimax`  
- **平台名称**：MiniMax  
- **官方文档入口**：  
  - API 文档首页：`https://api.minimax.chat/document/guides`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://api.minimax.chat/document/price`

---

## openai（文本 / 图像 / 多模态）

- **代码 ProviderType**：`openai`  
- **平台名称**：OpenAI Platform  
- **官方文档入口**：  
  - 开发者文档：`https://platform.openai.com/docs`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://platform.openai.com/pricing`

---

## google（Gemini 系列）

- **代码 ProviderType**：`google`  
- **平台名称**：Google AI / Gemini API  
- **官方文档入口**：  
  - Gemini API 文档：`https://ai.google.dev/gemini-api/docs`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://ai.google.dev/pricing`

---

## anthropic（Claude 系列）

- **代码 ProviderType**：`anthropic`  
- **平台名称**：Anthropic Claude API  
- **官方文档入口**：  
  - API 文档：`https://docs.anthropic.com/en/api`  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://www.anthropic.com/pricing`

---

## qwen（通义千问 / DashScope）

- **代码 ProviderType**：`qwen`  
- **平台名称**：阿里云 DashScope / 通义千问  
- **官方文档入口**：  
  - DashScope 文档首页：`https://help.aliyun.com/zh/model-studio`  
  - 通义千问模型文档：`https://dashscope.aliyun.com/`（登录后查看具体模型文档）  
- **价格与套餐**：  
  - 官方 pricing 页面：`https://www.aliyun.com/activity/dashscope/pricing`

> 若链接变化，可搜索关键字「DashScope 计费标准」获取更新页面。

---

## volc（火山引擎 / 豆包 / Seedream）

- **代码 ProviderType**：`volc`  
- **平台名称**：火山引擎 Doubao / Seedream 等  
- **官方文档入口**：  
  - Doubao / Seedream 文档入口：`https://www.volcengine.com/docs`（搜索 Doubao / Seedream 相关文档）  
- **价格与套餐**：  
  - 官方 pricing 页面（Doubao / AI 相关）：`https://www.volcengine.com/pricing`

---

## 使用建议

- 新增模型时，先从这里找到对应 Provider 的官方文档和价格页，核对：  
  - 物理模型 ID（model name）；  
  - 支持的模态和参数；  
  - 计费单位与价格。  
- 然后再回到 `SKILL.md` 中的步骤，按“suport-list → models → provider → provider_pricing → routing”的顺序完成对接。  

