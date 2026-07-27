# 各业务请求的提示词拼接与生成流程

本文档说明：**每个业务请求进来后，提示词是如何解析、拼接并最终发给模型的**。

---

## 一、整体架构（四步）

1. **请求进入**：路由按业务 key（writing_type / graphType+type / video model）识别业务。
2. **取配置**：按业务从 **Admin 配置（DB）或代码回退** 取「提示词规则 / 输出格式」。
3. **拼提示词**：把「规则 + 用户输入 + 业务参数 + 知识库（若有）+ 输出格式」拼成完整 prompt。
4. **发模型**：按业务 key 做 model-routing 选 provider/模型，把最终 prompt 发给该模型生成任务。

下面分 **Writing**、**Graph**、**Video**、**Audio** 四条线说明。

---

## 二、Writing（写作）提示词拼接

### 2.1 入口与业务识别

- 路由：`routes/writing.ts`，请求体中有 `writing_type`（如 `articles`、`outlines`、`lyrics`、`storyboard-scripts`、`voice-scripts` 等）和可选的 `outline_type`（大纲子类型）。
- 业务 key 由 `getWritingBusinessKey` / `getWritingBusinessKeyFromParams` 等从 `writing_type`（及 `outline_type`）推导，用于 model-routing 和提示词解析。

### 2.2 规则与输出格式从哪里来（提示词解析）

- **统一入口**：`src/prompts/resolver.ts` 的 **`getWritingRulesAndFormatResolved(writingType, outlineType, lang)`**。
- **解析顺序**：
  1. **先查 DB**：`prompt_engineering_config` 表，key 为 `writing` + `writingType` + `outlineType`（可为 null），取 `rules_i18n`、`output_format_i18n`，按 `lang` 取对应语言；若存在且 `is_active`，则直接返回。
  2. **回退代码**：若 DB 无或未启用，则调用 **`getWritingTypeRules(writingType)`**、**`getWritingTypeOutputFormat(writingType)`**（来自 `core/writing/wtconfigs/index.ts`），从各类型的 config（如 `articlesConfig`、`outlinesConfig`、`storyboardScriptsConfig` 等）里取写死的 `rules` 和 `outputformat`。
- **特殊类型**：
  - **lyrics + Suno**：用该类型的 `getSunoFormatRules()` 的 `rules` / `outputformat`，不再用 DB/通用 rules。
  - **voice-scripts + TTS**：用 `getTtsFormatRules()` 的 `rules` / `outputformat`。
  - **storyboard-scripts 分镜块**：有时用专门的 `getStoryboardChunkOutputFormat(...)` 作为 outputFormat。

即：**写作的「规则 + 输出格式」= 优先 DB 提示词工程配置，否则用 wtconfigs 里该写作类型的 rules/outputformat（或子类型专用 Suno/TTS/分镜格式）。**

### 2.3 段落级提示词最终长什么样（拼接顺序）

在 **`writing-service.ts`** 里，每个段落生成时都会拼一段 **sectionPrompt**，顺序大致为（不同分支略有差异，逻辑一致）：

1. **typeRules**  
   来自 `getWritingRulesAndFormatResolved(...).rules`（即上面解析得到的「写作类型规则」）。  
   若有，则放在最前，后面跟 `---`。

2. **subtypeRules**  
   来自 **`getSubtypeRules(writing_type, outline_type)`**（writing-service 内硬编码的 `subtypeRulesMap`，按写作类型 + 大纲子类型给一段「细分类型要求」）。  
   若有，则用「【细分类型要求】：subtypeRules」+ `---`。

3. **节奏/角色/分镜等（若适用）**  
   - 分镜脚本可能有 **rhythmRules**。  
   - 若启用角色：**charactersText**（角色设定）+ **castText**（本段出场角色）。  
   - 其他如 storyboard 的节奏说明等。

4. **【段落标题】**  
   `section.content`（当前要写的这一段标题/主题）。

5. **【写作指导】**（若有）  
   本段的 motivation、stance、tone、key_elements、length 等，来自 outline 的段落级配置；并强调「不要直接输出这些参数本身」。

6. **【前文记忆】**（若有）  
   前文摘要，保证连贯。

7. **【知识库内容】**（若有）  
   段落级或全局知识库召回后格式化成的 `sectionKnowledgeContext`。

8. **【整体写作要求】**  
   **enhancedPrompt**：即用户的主 prompt，若配置了全局知识库且无段落级知识库，会先做知识库召回并 **enhancePromptWithKnowledge** 拼进这里。

9. **typeOutputFormat**  
   来自 `getWritingRulesAndFormatResolved(...).outputFormat`。  
   若有，放在末尾，前面加 `---`。

10. **【重要要求】**  
    固定文案：禁止输出「动机：xxx」等参数文字、字数/格式要求、Markdown 或纯文本约定、无配置时只生成标题等。

总结：**写作的最终段落 prompt = typeRules + subtypeRules + 段落标题 + 写作指导 + 前文记忆 + 知识库 + 用户整体要求(enhancedPrompt) + typeOutputFormat + 重要要求**。其中 typeRules/typeOutputFormat 由「DB 提示词工程 or wtconfigs」解析得到。

---

## 三、Graph（图文）提示词拼接

### 3.1 入口与业务识别

- 路由：`routes/graph.ts`，请求体中有 **graphType**（`photograph` | `design` | `painting`）和 **type**（如 portrait、landscape、cinematic、3d、coverImage、illustration 等）。
- 业务 key 即 `graphType + type`，用于 model-routing 和规则解析。

### 3.2 规则从哪里来（提示词解析）

- **统一入口**：`src/prompts/resolver.ts` 的 **`getGraphRulesResolved(graphType, type, lang)`**。
- **解析顺序**：
  1. **先查 DB**：`prompt_engineering_config`，key 为 `graph` + `graphType` + `type`，取 `rules_i18n` 按 `lang`；若存在且 `is_active` 则返回。
  2. **回退代码**：否则调用 **`getGraphRulesForType(graphType, type)`**（`core/graph/graphconfigs/index.ts`），从 photographConfig/designConfig/paintingConfig 的 **getRulesForType(type)** 取该子类型的 `rules`（如 portrait 的「人像摄影专业要求」等）。

即：**图文的「规则」= 优先 DB 提示词工程，否则用 graphconfigs 里该 graphType+type 的 rules。**

### 3.3 用户需求如何变成「结构化描述」（effectiveUserPrompt）

在 **`graph-service.ts`** 的 **generateGraphPrompt** 中：

- 先取 **params** 里的 `prompt`（用户原始输入）和业务参数（style、tone、environment、makeup、pose、lighting 等）。
- 按 **graphType + type** 调用各子类型的 **buildXxxUserPrompt(params, outputLanguage)**，例如：
  - photograph：`buildPortraitUserPrompt`、`buildLandscapeUserPrompt`、`buildCinematicUserPrompt` 等；
  - design：`build3dUserPrompt`、`buildCoverImageUserPrompt` 等；
  - painting：`buildIllustrationUserPrompt`、`buildComicUserPrompt` 等。
- 这些函数用 **params 里的表单选项值 + 用户 prompt** 拼成一段结构化中文/英文描述（如「任务：…」「主体描述：…」「场景与构图：…」「光线与氛围：…」），得到 **effectiveUserPrompt**。
- 若没有对应 build 函数，则 **effectiveUserPrompt = 用户原始 prompt**。

同时会：
- **extractBusinessParams**：把当前类型用到的业务参数字段（如 style、tone、lighting）抽成 key-value 列表，供后面拼进「用户选择的业务参数」。
- （当前禁用）知识库召回得到 **knowledgeContext**。
- 参考图处理：生成 **referenceImagePrompt**，最终会拼到**大模型生成结果**前面，而不是拼进「给大模型的输入」。

### 3.4 发给「提示词生成模型」的 prompt 长什么样（buildPromptGenerationRequest）

在 **graph-service.ts** 里：

1. **rules**  
   `await getGraphRulesResolved(graphType, type, outputLanguage)`，即上面说的「图文规则」。

2. **拼装顺序**（`buildPromptGenerationRequest`）：
   - **prompt = rules**（打头）；
   - 若有 **knowledgeContext**：`【知识库内容】` + knowledgeContext；
   - 若有 **businessParamsDesc**（extractBusinessParams 的键值列表）：`【用户选择的业务参数】` + businessParamsDesc；
   - **【用户需求】** + effectiveUserPrompt（即 buildXxxUserPrompt 的结果或用户原文）；
   - **【输出要求】**：输出语言（中文/英文）+ 「只输出最终图片生成提示词本身，不要包含其他说明文字」。

3. 这段 **promptGenerationRequest** 会发给 **文本模型**（如 `GRAPH_PROMPT_MODEL`，默认 gemini-3-pro）生成「最终用于画图的英文/中文提示词」**generatedPrompt**。

4. 清理 generatedPrompt 后，若有 **referenceImagePrompt**，会拼到前面得到 **finalPrompt**（即「参考图描述 + 生成：cleanedPrompt」）。**finalPrompt** 才是真正交给 **图像模型** 的提示词。

总结：**图文的流程是「两段式」**：  
- 第一段：**规则(rules) + 知识库 + 业务参数 + 用户需求(effectiveUserPrompt)** → 发给 **文本模型** 得到「图像用提示词」；  
- 第二段：**参考图描述 + 图像用提示词** → 发给 **图像模型** 出图。  
规则来自 **DB 或 graphconfigs**，用户需求结构来自 **buildXxxUserPrompt**。

---

## 四、Video（视频）提示词

- 路由：`routes/video.ts`，请求体里是 **prompt**（或分镜 chunks 里每段的 prompt）以及 **chunk_seconds**、参考图等。
- **video-service** 只做任务编排与参数归一化（如 **normalizeSeconds**、**getBestSize**），**不在这里做「规则 + 用户输入」的提示词工程拼接**。
- 传给底层模型（sora-2、sora-2-deer、runway 等）的 **就是用户/上游传入的 prompt**（或从分镜 chunk 的 `prompt` / `chunkToPromptString(chunk)` 得来的文本）。
- 即：**视频业务当前没有像 Writing/Graph 那样的「规则 + 输出格式」解析与拼接**，提示词 = 用户/分镜给出的文本，仅做业务参数（时长、分辨率等）处理。

---

## 五、Audio（音频）提示词

- 路由：`routes/audio.ts`，按 **模型名** 调用对应 core/audio 的 xxx.generate。
- 与 Writing/Graph 类似，若某音频类型有「规则 + 格式」，应在各自模型适配层或统一入口里从 DB/代码取并拼接；当前代码库中 **没有像 prompts/resolver 那样对 audio 的 getXxxRulesResolved**，多数是 **用户/上游给的文本直接作为 prompt 或 script** 传给 TTS/音乐模型。
- 即：**音频目前也没有统一的「业务 key → 提示词工程配置 → 拼接」流程**，多为直传。

---

## 六、汇总表

| 业务   | 业务 key 来源              | 规则/格式来源                                      | 拼接顺序（最终发给「生成」的 prompt） |
|--------|-----------------------------|----------------------------------------------------|----------------------------------------|
| Writing | writing_type + outline_type | DB prompt_engineering_config → wtconfigs           | typeRules + subtypeRules + 段落信息 + 知识库 + enhancedPrompt + typeOutputFormat + 固定要求 |
| Graph   | graphType + type            | DB prompt_engineering_config → graphconfigs        | 先拼「规则+知识库+业务参数+用户需求」给文本模型 → 得到图像用 prompt → 再拼参考图给图像模型 |
| Video   | 模型/模式                   | 无                                                 | 用户/分镜的 prompt 直接使用             |
| Audio   | 模型名                      | 无统一解析                                         | 多为用户/上游文本直传                  |

---

## 七、相关文件速查

- **提示词解析（DB + 代码回退）**：`src/prompts/resolver.ts`（`getWritingRulesAndFormatResolved`、`getGraphRulesResolved`）。
- **写作规则/格式回退**：`src/core/writing/wtconfigs/index.ts`（`getWritingTypeRules`、`getWritingTypeOutputFormat`、各类型 config）。
- **写作段落 prompt 拼接**：`src/core/writing/writing-service.ts`（sectionPrompt 多处：generateWritingParallel、generateWritingSequential、同步生成等）。
- **图文规则回退**：`src/core/graph/graphconfigs/index.ts`（`getGraphRulesForType`）。
- **图文用户需求结构化**：`src/core/graph/graphconfigs/photograph|design|painting/*.ts` 的 **buildXxxUserPrompt**。
- **图文「给文本模型」的拼接**：`src/core/graph/graph-service.ts`（`buildPromptGenerationRequest`、`generateGraphPrompt`）。
- **视频/音频**：`src/core/video/video-service.ts`、`src/core/audio/*`，无统一规则拼接层。

若你希望把 **Video/Audio** 也做成「业务 key → 提示词工程配置 → 拼接」的统一流程，可以在 `prompts/resolver.ts` 增加 `getVideoRulesResolved` / `getAudioRulesResolved`，并在对应 service 里像 Writing/Graph 一样拼进最终 prompt。
