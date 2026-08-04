---
name: mxmai-business-pipeline
description: SuperMXMai Task V2 可选执行管线设计（前置 / 人工审核 / 后置）。设计或上架业务时，仅在确有分步需求时选用；不强制所有业务配置 pipeline。适用于 graph/writing/audio/music/video 等 bundle 与 Admin「执行管线」Tab。
---

# Task V2 执行管线（可选）

> **原则**：平台**支持**前置 →（可选）人工审核 → 核心生成 → 后置；**默认直出**即可，勿为每个业务堆管线。  
> **Admin**：业务抽屉 → **执行管线** Tab 插入「人工审核」步骤（pre/post 均可）。  
> **节点可复用（硬约束）**：见下方 §0；ADR [`docs/adr/pipeline-reusable-steps.md`](../../../docs/adr/pipeline-reusable-steps.md)。

---

## 0. 节点可复用约束

管线 step 是**平台原语**。业务差异只允许：

1. 节点 `params` / `fieldMapping` / `when`
2. 命名策略插件（如 `webSearch.queryBuilder=industryTrend`）
3. `formSchema` / `createGuide`
4. `nestedText` → 独立 `text/*` 业务

**禁止**：在 step 实现里 `if (taskKey)` / `if (subtype === 'industry-daily')`，或把某业务字段枚举写死为唯一路径。

| 类型 | 例子 | 要求 |
|------|------|------|
| 平台节点 | `webSearch`、`extractHotTopics`、`nestedText`、`interactiveCard`、`groupItemBatch`、`groupFanout` | 跨业务；Admin 可配齐参数 |
| 垂类节点 | `buildSciencePopTimeline`、`albumImageBatch` | 可按场景命名；内部仍用策略/`fieldMapping` |

**Checklist（上架 / 改管线前勾选）**：

- [ ] 新能力能否用现有 step + 配置完成？能则不新增 step
- [ ] 若必须新 step：输入/输出路径是否全部可配（禁止写死唯一 state 键）
- [ ] 业务专用拼查询是否走 `queryBuilder` 插件或 `queryTemplate`，而非改核心 runner
- [ ] 同一 step 能否挂到另一个无关业务且只改 JSON/Admin

**反例**：勿在 `web-search-step.ts` 堆 `if (industryDaily)`；行业日报检索用已注册的 `industryTrend` builder。

---

## 1. 什么时候需要管线？

| 场景 | 建议 |
|------|------|
| 单步：表单 → 一次模型调用 → 结果 | **不配** `pipeline`，或仅用平台自动步骤（敏感词、Schema 内 kbRecall/webSearch） |
| 先 text 再 media（口播稿 → TTS、歌词 → 音乐） | **前置** `nestedText` |
| 生图前把 briefing 格式化成英文 prompt | Graph：**Prompt 格式化**（`graphPreFormat`）或独立 text/format 业务 |
| 生成前必须人工改稿 | **前置 pipeline** 插入 **`manualReview`** 步骤 |
| 生成后还要解析/二次处理 | **后置** `nestedText` / `resolveContextFields` |

**不要**：为「看起来完整」给每个业务加 2～3 步 nestedText；直出版 bundle 往往更好验收。

---

## 1.1 设计经验：少嵌套 LLM，证据齐就直出（2026-07 行业日报复盘）

> 写 enrich / 长文管线前先读本小节。代价已付过：中间多烧 token，成稿结构反而更差。

### 结论（可执行）

| 做法 | 何时用 | 何时不用 |
|------|--------|----------|
| **证据链**（`webSearch` / `extractHotTopics` / `pruneToSelection` / 选题补搜） | 日报、需联网、需用户选题 | — |
| **确定性步**（prune、pickMain、归档复用发现池） | 总能用；便宜、可测 | — |
| **成稿前 nestedText「结构导演」→ `mapSections` → body 再嵌套** | 仅当有**可验收**的中间产物（人审改大纲、多路 group 分发） | 单篇报道体「先 JSON 骨架再成稿」——**默认取消** |
| **主笔一次直出**（骨架写死在 writing `unifiedTemplate`） | 行业日报 / 同类时段报道 | 中间已有人审大纲时除外 |

### 反模式（勿再堆）

1. **为架构好看叠三层 LLM**：`text/expert/industry-daily-structure` → `mapSections(body)` → 再 `nestedText(body)` → 最后 writing 再写一遍。实测：又肥、又慢、又浪费 token；结构导演出的 `body_sections` 常把多焦点**假因果捆在一起**，主笔被半成品带偏，删掉中间链后成稿明显更好。
2. **同质检索连打**：pre 已 `industryTrend` 广搜，enrich 再为「大势」搜一轮同 query；应 **归档复用发现池 → `industry_overview`**，只给主/副焦点补搜。
3. **用中间 JSON 代替成稿约束**：排版黑名单（禁止「副标：」）、大势禁列表、多话题独立——应写在 **output 主笔提示词 + 确定性后处理**，不要指望 structure 业务「策划对了」。
4. **剪枝靠中英专名死表**：热点意译成中文 chip 后对不上外文标题。正确做法：提炼时挂 `sources` 下标 → `topicSourceMap`（topic→url），剪枝按 URL 回挂；空则 softMinKept + 选题补搜。

### 行业日报（`writing/generator/industry-daily`）当前瘦身形

```
pre:  interactiveCard → webSearch(industryTrend) → extractHotTopics
      ↓ 用户选题
enrich: pruneToSelection(+归档大势) → pickMainTopic → webSearch(主) → webSearch(副)
output: writing 主笔直出（时段大势散文 → 各焦点独立章）
```

**已从主链路拿掉**（业务定义可留库，勿再挂回 enrich）：structure / mapSections / body 嵌套。调结构只打磨主笔模板与后处理，**先别加回中间 LLM**。

### Checklist（加 nestedText 前多问一句）

- [ ] 这一步的产出用户/人审会不会看见并改？看不见 → 多半该删
- [ ] 删掉后，主笔提示词能否单独锁死骨架？能 → 直出
- [ ] 是否只是「分段省 context」？先试一次直出 + 压缩 evidencePack；不够再 `mapSections`
- [ ] 新增的 webSearch 是否与上一步同质？同质 → 复用 evidence，勿再搜

---

## 2. 三段结构（旧 Task V2）与 Warp 五段

```
[前置 pre] → [核心：scope 主模型 / Warp output] → [后置 post]
     ↑
  可选：awaiting_review（人工审核）
```

Warp：`pre → input → enrich → output → post`（见 `docs/mxm-warp-v2-对齐记录.md`）。

- **核心 / output**：从**完整合同**取参，调用本 scope **主生成接口**（writing LLM / graph 生图 / audio speech / music / video）。
- **Core Skill（垂直切片）**：切片内 writing/audio 与相关 text 的 output/Prompt 改为 `taskTemplate.extra.skillPack`（Anthropic 目录：`SKILL.md` + `references/` + `scripts/`）。编排仍是本管线；合同 ref 与 `scripts/invoke-*` 只读。见 [`docs/adr/core-skill-output.md`](../../../docs/adr/core-skill-output.md)。
- **前置 / enrich / 后置**：写在 `extra.taskTemplate.pipeline.pre` / `.enrich` / `.post`（数组 of step）。
- **平台自动步骤**（敏感词、Schema 驱动 kbRecall/webSearch）由运行时合并，Admin 中带锁展示；见 `business-pipeline-defaults.ts`。

---

## 2.1 硬约束：合同 → 生成接口 = output（跨 scope · 三态一致）

> **上架 / 改管线前必读。** 违反即视为错误 bundle，勿再以「挂在 post 方便跑」绕过。

### 定义

凡 **读取合同（或 enrich 已写回合同的字段）并调用本业务主生成接口** 的步骤，语义上属于 **output**（旧管线称「核心」），**不论** scope 是 writing / graph / audio / music / video，也 **不论** taskKey 是 `generator` | `group` | `series`。

| taskKey | 合同形状 | output 做什么（一致） |
|---------|----------|------------------------|
| `generator` | 单对象 | 一次（或配置内的）主接口调用 → 交付物 |
| `group` | 对象数组 | **遍历 / 并发**数组元素，各调主接口（可再合并成片）→ 交付物 |
| `series` | 对象 + 历史 | 带历史上下文调主接口 → 新交付物 |

写作：output = 文本 LLM。媒体：output = 路由上的物理模型（speech / 生图 / 视频 / 音乐等）。**group 的「遍历生成」仍在 output**，不是 post。

### `skipOutputLlm` 只能干一件事

- **含义**：Warp output **跳过文本 LLM**（enrich/人审已定稿，不必再写一遍）。
- **不含义**：跳过 output；更不含义「把主合成挪到 post」。
- 媒体典范：`skipOutputLlm: true` → **仍走 output 位**调用 speech（或等价成片链）。口播见 `audio-generator-voice-over-test`（`post: []`，合成在 Warp 结束后的 audio 核心）。

### post 允许 / 禁止

| ✅ post（主交付已产出之后） | ❌ 禁止当 post（实为 output） |
|------------------------------|--------------------------------|
| 润色、摘要、翻译、Markdown→PDF | 单口 / 多人 **TTS / speech 路由** |
| 字幕后处理、转码、二次封装 | **逐句 TTS + 时间轴混音**（对话成片） |
| 成片后的人工确认（可选） | graph 主生图、music 主成曲、video 主渲染 |
| 真正的 sidecar 附件 | 「因为 skipOutputLlm 所以随便塞 post」 |

### 配置落点（现状与目标）

| 形态 | 正确落点 |
|------|----------|
| 单次媒体合成（单口 TTS 等） | `skipOutputLlm` + scope 执行器读合同/成稿调路由（**勿**写进 `pipeline.post`） |
| 多步才构成一次主交付（如逐句 TTS→展轴→混音） | **语义 = output**。优先：引擎在 skipOutputLlm 之后、post 之前执行（与单口对称）。目标：支持 `pipeline.output[]` 显式配置；**新业务禁止**把主链只挂在 `pipeline.post` |
| 写作 group 多段 | output / group 汇编，不是 post |

### 反例（勿再复制）

`audio/group/multi-voice` 曾把 `dialogueLineTts` → `resolveDialogueTimeline` → `renderAudioTimeline` 配进 **`pipeline.post`**，Admin 显示成「后置」，与「合同→生成=output」冲突。纠偏方向：enrich 只负责台词/cue/人审；**合成链归 output**；post 清空或只留真后置。迁移前运行时可能仍读旧 post 配置——**新上架不得再效仿**。

### Checklist（再勾一次）

- [ ] 主生成接口调用是否在 **output / 核心**，而不是 post？
- [ ] `group` 是否在 output **遍历合同数组**，而非「跳过 output、post 里循环」？
- [ ] 若设了 `skipOutputLlm`，是否仍安排了 **媒体 output**（路由或 output 步），而不是空 output？
- [ ] post 是否仅含「主交付已存在」之后的步骤？

---

## 3. 前置（pre）常用 step

| step | 用途 | 配置位置 |
|------|------|----------|
| `sensitiveCheck` | 提交 prompt 敏感词 | 默认 pre，一般不必手写 |
| `resolveContextFields` | Schema `x-ui-type: kbRecall` / `webSearch` | 按 `x-resolve-phase: pre` 自动 |
| `resolveVoiceoverAudio` | ffprobe 口播时长 | `audioUrlFrom` → `audio_duration_seconds` |
| `transcribeVoiceoverAudio` | **ASR 语音识别**（本地 FunASR Paraformer，中文优先）；MiniMax TTS 有字幕则跳过 | 建议放在 `resolveVoiceoverAudio` 之后；输出 `params.voiceover_subtitles_json` + `params.script` |
| `buildVideoEditTimeline` | **确定性 OpenReel 分镜 JSON**（策略 + fieldMapping，无业务硬编码） | `params.segmentStrategy` + `fieldMapping`；见下文 |
| `nestedText` | 调用独立 **text 子业务** | `nestedTextTaskKey: "text/transform/..."` + `inputMapping`；可选 `params.outputTarget: "lyrics"`（音乐：写入 lyrics 不覆盖 prompt）；可选 `seedParamsIfEmpty` 把 expert JSON 键写入尚未填写的 params（供后续交互卡预填推荐） |
| `interactiveCard` | **人机闸门**（可多张） | `params.fields`；C 端 createGuide 只抽 **pre 第一张**；后续卡在任务运行时暂停。典例：多人语音 = 文稿卡 → nestedText 扫描 → 形式/人数/音色卡 |
| `when`（步骤级） | **条件执行**（不满足则跳过，记入 pipelineTrace.skipped） | 见下方「执行条件」；Admin 执行管线 Tab 可配 |

> **对话成片三步**（`dialogueLineTts` / `resolveDialogueTimeline` / `renderAudioTimeline`）属于 **§2.1 output**，不要配进 pre；也不要当作「默认 post」。见下方 §5.1。

**执行条件 `when`（Admin 可配，无业务硬编码）**：

```json
"when": {
  "all": [
    { "field": "params.make_instrumental", "op": "falsy" },
    { "field": "params.lyrics", "op": "empty" }
  ]
}
```

| op | 含义 |
|----|------|
| `falsy` | 未勾选 / false / 空 |
| `truthy` | 已勾选 / 非空 |
| `empty` / `notEmpty` | 字符串或对象为空 |
| `eq` / `neq` | 等于 / 不等于（需 `value`） |

`all` 内条件**全部满足**才执行该步骤。音乐纯器乐跳过歌词 text 步：在 nestedText 步骤配置 `make_instrumental` falsy + `lyrics` empty，**不要**在代码里写 `if (make_instrumental)`。

**口播视频前置示例**（科普口播剪辑）：

```json
"pre": [
  { "step": "resolveVoiceoverAudio", "params": { "audioUrlFrom": "${params.voiceover_audio_url}" } },
  {
    "step": "transcribeVoiceoverAudio",
    "params": {
      "audioUrlFrom": "${params.voiceover_audio_url}",
      "skipWhenTtsSubtitles": true,
      "skipWhenScriptPresent": true,
      "language": "zh"
    }
  },
  { "step": "nestedText", "nestedTextTaskKey": "text/plan/science-pop-script-draft", "inputMapping": { "...": "...", "voiceover_subtitles_json": "${params.voiceover_subtitles_json}" } }
]
```

推荐（确定性分镜，Admin 可复用）：

```json
"pre": [
  { "step": "resolveVoiceoverAudio", "params": { "audioUrlFrom": "${params.voiceover_audio_url}" } },
  { "step": "transcribeVoiceoverAudio", "params": { "audioUrlFrom": "${params.voiceover_audio_url}", "skipWhenTtsSubtitles": true } },
  {
    "step": "buildVideoEditTimeline",
    "params": { "segmentStrategy": "voiceover-subtitles", "segmentsStatePath": "voiceoverSubtitles.segments" },
    "fieldMapping": {
      "duration": "${params.audio_duration_seconds}",
      "title": "${params.topic}",
      "audioUrl": "${params.voiceover_audio_url}",
      "segments": "${params.voiceover_subtitles_json}"
    }
  }
]
```

- `skipWhenTtsSubtitles`：音频 URL 指向 TTS 任务（`/media/audio/:taskId`）且该任务有 `subtitle_data` / MinIO 字幕 / 可拉取的 `subtitle_file_upstream` 时**不调用 ASR**。
- `skipWhenScriptPresent`：用户已填 `script` 时跳过 ASR（按时长估算句级时间轴）。
- ASR 回退：本地 FunASR（`FUNASR_PYTHON`、`ASR_TIMEOUT_MS`）；仅用户上传/外链/字幕缺失时使用。

### 3.1 nestedText 两种时机

| params | scope | 执行时机 |
|--------|-------|----------|
| `{ "graphPreFormat": true }` | graph | `renderPrompt` 之后；Admin **单独「Prompt 格式化」**区块，不在 pre 列表重复展示 |
| `{ "afterPromptRender": true }` | audio / music | **worker 内** deferred pre（`deferred-media-pipeline.ts`），模板渲染后再跑 nestedText |

**audio/music 前置示例**（口播测试 bundle）：

```json
"pipeline": {
  "pre": [
    {
      "step": "nestedText",
      "nestedTextTaskKey": "text/transform/voice-script-draft",
      "params": { "afterPromptRender": true },
      "inputMapping": {
        "source_material": "${params.source_material}",
        "voice_style": "${params.voice_style}"
      }
    },
    {
      "step": "nestedText",
      "nestedTextTaskKey": "text/transform/voice-script-tts-markup",
      "params": { "afterPromptRender": true },
      "inputMapping": {
        "script_draft": "${state.finalPrompt}",
        "voice_id": "${params.voice_id}"
      }
    }
  ]
}
```

**设计要点**：

- 写稿 / 格式化应是 **独立 text 业务**（可单独换模型、Prompt），通过 `nestedTextTaskKey` 挂载，**不要**写死在 audio 代码里。
- 同一 bundle 可含多个 item：text 子业务 + 主 scope 业务（见 `audio-generator-voice-over-test.business.json`）。

---

## 4. 人工审核（Manual Review Gates，可选）

前置 / 后置管线任意位置可插入 **`manualReview`** 步骤；单任务可多次进入 **`awaiting_review`**。

### 4.1 配置（推荐：pipeline step）

`pipeline.pre` / `pipeline.post` 中插入：

```json
{
  "step": "manualReview",
  "params": {
    "id": "lyrics-review",
    "label": "歌词审核",
    "hint": "确认后继续生成",
    "kind": "text",
    "draftFrom": "${state.finalPrompt}",
    "applyMapping": { "prompt": "${review.text}" }
  }
}
```

| 字段 | 说明 |
|------|------|
| `id` | 闸门唯一 ID（同任务内不重复） |
| `kind` | `text` \| `json` \| `image`（v1）；`media`/`composite` 预留 |
| `draftFrom` | 从 ctx.state 取草稿的路径/模板 |
| `applyMapping` | 审核通过后写回 ctx 的映射 |

在 Admin **执行管线** Tab 点击「插入人工审核」，可配置 pre/post 任意位置与多次闸门。

### 4.2 运行时

1. 执行到 `manualReview` → **`awaiting_review`**，写入 `metadata.manualReviewGate`。
2. 草稿按 **`taskId + gateId`** 存 Redis（`cgi:manual-review:{taskId}:{gateId}`），不落库正文。
3. `GET /api/v2/tasks/:id/review-draft`
4. `POST /api/v2/tasks/:id/approve-review` `{ reviewText?, reviewJson?, gateId?, approved: true }` → 从 checkpoint 续跑。
5. 多闸门：每 approve 一次 `reviewCheckpoint.stepIndex++`，直至 pre/post 阶段完成。

### 4.3 前端

- 全异步 scope（outline/writing/graph/video/audio/music）列表「待审核」→ `ManualReviewModal`（text/json/image）。
- 可选：保存草稿到虚拟文件夹。

### 4.4 适用范围

- **v1**：全部异步 scope；pre/post 任意位置；多次 `awaiting_review`。

**典例**：

- `mxmcgi/src/tasks/examples/audio-generator-voice-over-test.business.json`（两个 nestedText 之间插入审核）
- `mxmcgi/src/tasks/examples/graph-post-image-review.example.json`（post 图片确认）

---

## 5. 后置（post）

`pipeline.post`：主生成（output / 核心）**已经产出交付物之后**的步骤（少见，按产品需要）。**禁止**把主 TTS / 主生图 / 主成片链塞进 post——见 §2.1。

- `resolveContextFields`（`x-resolve-phase: post`）
- `nestedText`（如：对 `state.coreArtifact.text` 做摘要/翻译）
- **`markdownToPdf`**：Markdown → PDF（封面+目录）；默认 sidecar 独立存 PDF 地址到 `metadata.pdfStorage`；失败不阻断任务（见 `writing-resumes-it.business.json`）

`markdownToPdf` 配置要点：

- `params.storageMode`: `sidecar`（默认）| `overwrite`
- `params.includeCover` / `includeToc`: 默认 true
- `params.useLayoutLlm`: 长文默认 **false**（确定性 pdfkit 封面+目录）；简历等强版式再开 true
- `inputMapping.markdown` ← `${state.coreArtifact.text}`
- Core 业务主存 Markdown；PDF 仅 Post 产出供阅读（`GET /media/writing` 对 PDF 走 Range/stream）
- 旧名 `renderDocumentPdf` 仍兼容，请迁移到 `markdownToPdf`

默认多数业务 **post 为空**。

### 5.1 output 位媒体步（对话成片等）

下列 step **语义属于 output**（读 `contract.business.*` → 调 speech / 混音），不是 pre/post 默认项：

| step | 用途 | 典型 params |
|------|------|-------------|
| `dialogueLineTts` | 多人语音逐句 TTS（按 cast.voice_id） | `linesFrom` / `castFrom` / concurrency |
| `resolveDialogueTimeline` | cue → 绝对 `start_ms`（支持负 offset 重叠） | `linesFrom` |
| `renderAudioTimeline` | 按 `start_ms` 多轨混音成片（ffmpeg adelay+amix） | `linesFrom` |

**推荐顺序（output）**：`dialogueLineTts` → `resolveDialogueTimeline` → `renderAudioTimeline`。enrich 只产出 `lines` / cue / 人审；`skipOutputLlm` 后由上述链（或引擎等价路径）成片。

---

## 6. Bundle 与 Admin 清单

设计含管线的业务时，bundle 建议包含：

- [ ] 主 scope item：`formSchema`、`unifiedTemplate`、`routing`、`businessPricing`
- [ ] 若用 nestedText：**独立 text item(s)**（`scope=text`），routing 指向写稿模型（如 MiniMax-M3）
- [ ] 主 item 的 `pipeline.pre` / `post`（含必要的 `manualReview` 步骤）
- [ ] **不要**在 pricing metadata 标 `internal: true` 隐藏 text 子业务——应为一等业务，仅在主业务 pipeline 引用

Admin 保存后：执行管线 Tab 应能看到 audio/music 的「前置 text · …」步骤（`afterPromptRender` 与 graph 的 `graphPreFormat` 展示逻辑不同）。

---

## 7. 相关代码

| 用途 | 路径 |
|------|------|
| 管线合并 / 默认 | `mxmcgi/src/tasks/business-pipeline-defaults.ts` |
| pre 执行 | `mxmcgi/src/tasks/business-pipeline.ts` |
| nestedText step | `mxmcgi/src/tasks/business-pipeline-steps.ts` |
| audio/music deferred pre | `mxmcgi/src/tasks/deferred-media-pipeline.ts` |
| ~~pipeline-llm-plugin~~ | **已移除**：勿再使用 `textPlan` / `textThinking` / `textFormat` 内联 LLM step；LLM 中间步骤一律用独立 `text/*` + `nestedText` |
| 人工审核 | `mxmcgi/src/tasks/manual-review.ts`、`manual-review-store.ts`、`manual-review-types.ts` |
| approve / draft API | `mxmcgi/src/tasks/task-http-handlers.ts`、`routes.ts` |
| Admin 执行管线 UI | `web/src/pages/AdminBusinessPipelineTab.tsx`、`admin-business-pipeline.utils.ts` |
| 口播测试 bundle | `mxmcgi/src/tasks/examples/audio-generator-voice-over-test.business.json` |
| 固定前置链说明（敏感词/知识库） | `mxmcgi/src/tasks/README_TASK_V2_FIXED.md` |

---

## 8. 与各 scope skill 的关系

本 skill **不替代** graph/writing/audio/music/video 的 bundle skill；在对方案做「要不要分步、要不要人审」时 **先读本节**，再回对应 scope skill 写 formSchema / routing。

- Graph 格式化：优先 `graphPreFormat` + text/format 业务，通常**不需要**人工审核。
- Audio 口播：常见 **enrich nestedText + 可选人工审核 + `skipOutputLlm` + TTS output（post 空）**；对话组同 §2.1 / §5.1。
- Music：可 1 步 pre/enrich 歌词草稿；主成曲在 output；人工审核同 audio。
- Writing：`generator` 多数 **无 pipeline**；`group` / `series` 按需分步，**遍历仍在 output**。Video：多数 **无 pipeline**；长链路用 Smartflow 而非单任务把主渲染塞进 post。
- type 命名见 [`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md)（非 text 统一 `generator`|`group`|`series`）。
- **合同→生成接口 = output**：§2.1 硬约束，各 scope bundle skill 必须遵守。
