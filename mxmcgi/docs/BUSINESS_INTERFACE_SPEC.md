# 业务接口统一规范

## 目标

- **Admin 可配置**：对每个「细分业务接口」配置/切换不同的 provider 和 model，无需改代码。
- **与 models 层一致**：业务只通过「业务接口 key → (provider, model) → registry.getModel → generate」调用，不写死具体模型。
- **为提示词工程预留**：业务接口 key 同时作为后续「提示词工程」管理的维度（按接口配置/切换提示词）。

---

## 目标架构（四步流程）

用户请求经「业务接口 → 路由与提示词 → 执行」的完整流程如下：

1. **用户调用具体业务接口**（如 `/writing-articles`）  
   对外暴露的是业务维度（大纲、文章、歌词、口播稿、分镜脚本等），不是模型名或功能阶段名。

2. **后端根据业务获取 Admin 配置的 provider 和模型**  
   根据业务 key（如 `writing-articles`）从 model-routing（或 DB）解析出要使用的 `provider` 和 `model`，不写死模型。

3. **后端根据业务获取对应提示词工程配置，对用户传入的配置和提示进行拼接与润色**  
   按同一业务 key 读取提示词工程配置（rules / outputFormat 等），与用户参数、原始提示拼接并润色，得到最终 prompt。

4. **后端将最终提示发送给对应 provider 的模型，生成系统任务 task**  
   用步骤 2 得到的 (provider, model) 调用生成接口，并创建/更新系统任务。

落地时：路由层与任务创建写入「业务 key」；执行层先解析业务 key → (provider, model)，再取提示词配置 → 组 prompt → 调模型。

---

## 1. 业务接口 key 清单（细分配置维度）

以下 key 为**稳定标识**，Admin 可为每个 key 配置「默认 provider + model」；运行时通过路由解析得到实际 (provider, model)，再走 registry 或 provider 调用。

### 1.1 写作 (writing)

写作按**业务类型**区分接口（与 graph 按 photograph/design/painting 一致），不以「功能阶段」如 outline/paragraph/full 作为业务 key。

| 业务接口 key | 说明 | 当前默认 (model-routing) |
|--------------|------|--------------------------|
| `writing-outlines` | 大纲（文章/口播/分镜等通用大纲生成） | deer / gemini-3-pro |
| `writing-articles` | 文章（科技文、故事小说、学术论文等） | 由 WRITING_MODEL_SELECTION 顺序选 |
| `writing-lyrics` | 歌词（含 Suno 格式等） | 同上 |
| `writing-voice-scripts` | 口播稿（带货/情感/知识分享等） | 同上 |
| `writing-storyboard-scripts` | 分镜脚本（短视频/电影/动画/广告等） | 同上 |
| `writing-media-post` | 媒体帖（可选） | 同上 |
| `writing-reviews` | 评论（可选） | 同上 |
| `writing-resumes` | 简历（可选） | 同上 |

说明：

- **业务 key 与 WritingType 对齐**：`articles`、`lyrics`、`voice-scripts`、`storyboard-scripts`、`outlines` 等对应实际写作类型（见 `core/writing/type.ts`），Admin 按业务配置「该业务用哪个 provider+model」。
- **同一业务内的阶段**：当前实现中，同一业务内仍有「生成大纲 / 段落展开 / 整篇生成」等阶段，由 `selectModel('outline'|'paragraph'|'full')` 从 `WRITING_MODEL_SELECTION` 选模型。规范后优先按**业务 key** 解析路由（如 `getResolvedRouting('writing-articles')`）；若需对「业务+阶段」细分配置，可再扩展 key（如 `writing-articles-outline`、`writing-articles-paragraph`），与 model-routing 一致即可。
- **已废弃**：`writing-rewrite`、`writing-polish` 为旧逻辑，当前未使用，不再作为业务接口 key。

### 大纲 (outline)

大纲已作为独立域：创建大纲任务时传入大纲业务接口 key（逻辑模型名），并在执行端通过 `outline-*` 路由表解析实际 provider + physical model。

| 业务接口 key | 说明 | 当前默认 (model-routing) |
|--------------|------|--------------------------|
| `outline-<taskKey>` | 大纲业务线（如小说/短视频/课程大纲等），由 Admin 为每条线配置 `TaskTemplate` 的 `formSchema/systemTemplate/outputFormatTemplate` | 由 Admin 配置（建议初始与 `writing-outlines` 对齐） |

说明：
- outline 业务接口 key 不再依赖写作阶段 `outline/paragraph/full` 的语义，而是直接表达“该大纲业务线要输出什么结构与字段”。
- 业务与提示词工程可以在同一 key（`outline-<taskKey>`）维度下并行配置、独立演化。

### 1.2 图文 (graph)

| 业务接口 key | 说明 | 当前默认 |
|--------------|------|----------|
| `graph-photograph` | 摄影（人像/风景/电影/商业/纪实等，子类型由 params.type 区分） | deer / nano-banana |
| `graph-design` | 设计（3D/海报/图标等） | deer / nano-banana |
| `graph-painting` | 绘画（插画/漫画/概念艺术等） | deer / nano-banana |

说明：

- **流程中使用的 key**：Task V2 下由 `runTaskV2` 解析路由后写入任务；执行时 **`graph-task.ts`** 读取 `requestParams.graphType` + `params.type`（子业务）。对外入口为 **`POST /api/v2/tasks/run`**（`scope=graph`，`taskKey` = photograph|design|painting，`subtype` = 子类型如 portrait）。旧 **`/api/v1/cgi/graph/*`** 已 410。
- **非业务接口**：`graph-seedream`、`graph-flux` 对应底层物理模型（Seedream、Flux），不属于业务接口。当前 graph 业务内部按 `quality`（high → nano-banana，fast → seedream-4）在模型间二选一，不通过业务 key 暴露。若存在「直接指定某模型」的 API 需求，可在 model-routing 中保留此类 key 供路由解析，但不列入业务接口清单。规范后业务层可按「业务 key + 可选 quality」解析为单一 (provider, model)，或拆成 `graph-photograph-high` / `graph-photograph-fast` 等由 Admin 配置。

### 1.3 音频 (audio)

| 业务接口 key | 说明 | 当前默认 (model 为实际模型名) |
|--------------|------|-------------------------------|
| `audio-speak` | 语音/朗读（底层可用 MiniMax 等） | maxplan / speech-2.8-hd |

说明：口播业务走独立 **`scope=audio`**（Task V2），路由表 `audio_scope_config`；物理模型如 `speech-2.8-hd` 仅出现在路由的 model 字段，不用于业务 key。

### 1.4 音乐 (music)

| 业务接口 key | 说明 | 当前默认 (model 为实际模型名) |
|--------------|------|-------------------------------|
| `music-compose-maxplan-direct` | 音乐直出（粘贴/召回 → music_generation） | maxplan / music-2.6 |
| `music-compose-maxplan-test` | 音乐管线版（含 text 歌词草稿步） | maxplan / music-2.6 |

说明：

- 音乐生成使用独立 **`scope=music`**（非 `audio-music` 合并 scope），路由表 `music_scope_config`。
- 底层 Provider：**maxplan** `POST /v1/music_generation`（`music-2.5` / `music-2.6`）。
- 计费：`per_audio_second`（与口播相同计量维度）。
- 历史文档中的 `audio-music` + Suno 为旧命名，新上架请使用 `scope=music` + bundle 导入。

### 1.5 视频 (video)

视频按**业务类型**区分接口，不使用模型名（如 Sora、Runway）作为业务 key；底层模型由路由解析得到。

| 业务接口 key | 说明 | 当前默认 (model 为实际模型名) |
|--------------|------|-------------------------------|
| `video-short` | 短视频 | deer / sora-2（可配置为其他模型） |
| `video-movie` | 电影 | deer / sora-2 |
| `video-animation` | 动画 | deer / sora-2 |
| `video-music-video` | 音乐视频 | deer / sora-2 |
| `video-commercial` | 广告 | deer / sora-2 |
| `video-documentary` | 纪录片 | deer / sora-2 |
| `video-motion-graphics` | 概念动效 | deer / sora-2 |
| `video-game-cg` | 游戏 CG | deer / sora-2 |
| `video-educational` | 教育片（可选） | deer / sora-2 |

说明：业务命名与分镜脚本类型（如 `short-video-storyboard`、`movie-storyboard`）对齐；sora-2、runway 等为底层模型名，仅出现在路由的 model 字段，不用于业务 key。Admin 可为每种视频业务配置不同 provider/model。

### 1.6 关于 text（scope=text 子业务）

**text 不作为面向用户的独立产品模块**。Task V2 中 `scope=text` 的条目用于 **pipeline 前置 nestedText**（如口播写稿、TTS 优化、graph format），由 bundle 内独立 item 定义，经 `nestedTextTaskKey` 挂载到 audio/music/graph 等主业务。

用户可见的「写作文本」仍走 **`scope=writing`** 与 writing-* 业务 key。裸模型 text 调用由 Admin 路由配置，不单独占业务接口清单。

### 1.7 Task V2 可选执行管线（前置 / 人工审核 / 后置）

**不强制**配置；默认「表单 → 核心模型 → 结果」。

| 阶段 | 配置 | 何时选用 |
|------|------|----------|
| **前置 pre** | `taskTemplate.pipeline.pre` | 需先跑 text 子业务、或显式 pre 步骤 |
| **人工审核** | `pipeline.pre/post` 中的 `manualReview` 步骤 | pre/post 任意位置暂停；text/json/image 草稿；`GET review-draft` / `POST approve-review` |
| **后置 post** | `taskTemplate.pipeline.post` | 核心产出后还需步骤（少见） |

audio/music **直出**可无 pipeline；**管线版**用 `afterPromptRender` nestedText。Agent 设计细则： [`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../../.cursor/skills/mxmai_business_pipeline/SKILL.md)

---

## 2. 统一解析与调用约定

### 2.1 解析：业务 key → (provider, model, scope)

- **入口**：`getResolvedRouting(businessKey)`（现有 model-routing），返回 `{ provider, model }`。
- **scope 推断**：由业务 key 前缀或配置确定：
  - `writing-*` → scope `writing`
  - `graph-*` → scope `graph`
  - `audio-*` → scope `audio`
  - `video-*` → scope `video`
- **Admin 配置**：仅改路由表（内存覆盖或后续 DB），不改业务代码。  
  例如：`setRoutingOverride('writing-articles', { provider: 'official', model: 'claude-4.5-sonnet' })`。

### 2.2 调用链（推荐）

1. 根据请求确定 **业务接口 key**（如 `writing-articles`、`graph-photograph`、或 URL 中的物理模型名）。
2. 若为业务 key，则 **解析**：`const { provider, model } = getResolvedRouting(businessKey)`；若为物理模型名，则 `provider = getProviderForModel(model).provider`，`model = modelName`。
3. **取定义**：`def = getModel(provider, scope, model)`；若 `def` 存在则 `result = await def.generate(params, { providerOverride: provider })`。
4. **回退**：若 registry 无该定义，则 `providerFactory.getProviderForModel(model, provider).generate(model, params)`（兼容未迁到 models 的旧模型）。

### 2.3 与 TaskExecutor 的约定

- 创建任务时，**metadata 或 requestParams** 中应保存用于解析的 **业务 key 或最终 (provider, model)**，便于执行时一致解析。
- 执行时：若 `modelName` 以 `writing-`/`graph-` 等开头，先 `getResolvedRouting(modelName)` 得到 (provider, model)，再按 2.2 调用；否则仍按现有「物理 modelName + provider」执行。

---

## 3. 与「提示词工程」的衔接

- 业务接口 key 可作为**提示词配置的维度**：例如按 `writing-articles`、`graph-photograph` 配置不同 system prompt / 规则 / 输出格式。
- 后续可在 Admin 中增加「按业务接口 key 管理提示词模板」，与「按业务接口 key 配置 provider+model」并列，实现「细分业务接口」下的模型+提示词双配置。

---

## 4. 落地步骤建议

1. **统一业务 key 与 model-routing**  
   - 在 `model-routing` 中收口所有业务 key（writing 按业务：`writing-outlines`、`writing-articles`、`writing-lyrics`、`writing-voice-scripts`、`writing-storyboard-scripts` 等；若需按阶段细分配置再增加 `writing-*-outline`/`paragraph`/`full`）。  
   - 为 graph 的 quality 维度决定是「一个 key 多模型由内部 quality 选」还是「拆成 graph-photograph-high / graph-photograph-fast」等，并在 defaultRouting 中补全。

2. **业务层统一走「解析 → getModel → generate」**  
   - writing：按**业务类型**解析 key（如 `writing-articles`、`writing-lyrics`），先 `getResolvedRouting(writingBusinessKey)` 得到 (provider, model)，再 `getModel(provider, 'writing', model).generate(...)`；业务内部若仍区分 outline/paragraph/full 阶段，可再查对应阶段的路由或沿用现有 WRITING_MODEL_SELECTION。  
   - graph：在 `generateGraphImage` 中，用 `getResolvedRouting('graph-photograph'|...)`（或按 quality 的 key）得到 (provider, model)，再走 registry/provider，替代当前 quality → nano-banana/seedream-4 的写死逻辑。  
   - audio / video：创建任务时传业务 key（如 `audio-speak`、`video-short`）或解析后的 (provider, model)；TaskExecutor 执行时用同一套解析与调用约定。video 不使用 video-sora 等模型名作为业务 key。

3. **路由与任务创建**  
   - 各 route 在创建 task 时写入「业务接口 key」或「解析后的 provider+model」，便于执行端与统计一致。

4. **Admin 能力**  
   - 已有：`GET/POST/DELETE /system/admin/providers/routing` 读写路由覆盖。  
   - 可选：提供「业务接口 key 列表 + 当前配置」的只读接口，方便前端按「细分业务接口」展示与编辑。

5. **提示词工程**  
   - 在现有 prompt-config / 规则解析基础上，增加「按业务接口 key」的配置与加载，与本次业务接口规范共用同一套 key。

---

## 5. 小结

- **业务接口**：用稳定、可枚举的 **业务接口 key** 表示「细分业务接口」。
- **配置与切换**：Admin 通过 **model-routing**（及后续 DB）为每个 key 配置/切换 (provider, model)。
- **统一规范**：业务层统一通过「业务 key → getResolvedRouting → getModel(provider, scope, model) → generate」调用，避免各处写死模型或重复解析逻辑。
- **提示词**：同一批 key 作为后续提示词工程的管理维度，实现「按业务接口的模型 + 提示词」双配置。

这样在 models 已收口的前提下，业务接口统一规范即可支持 Admin 对细分业务接口做不同 provider、不同模型的配置与切换，并为提示词工程打好基础。
