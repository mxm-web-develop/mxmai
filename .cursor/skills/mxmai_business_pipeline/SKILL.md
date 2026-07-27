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

## 2. 三段结构

```
[前置 pre] → [核心：scope 主模型] → [后置 post]
     ↑
  可选：awaiting_review（人工审核）
```

- **核心**：bundle 的 `scope` + `routing.model`（如 graph 生图、audio TTS、writing 正文）。
- **前置 / 后置**：写在 `extra.taskTemplate.pipeline.pre` / `.post`（数组 of step）。
- **平台自动步骤**（敏感词、Schema 驱动 kbRecall/webSearch）由运行时合并，Admin 中带锁展示；见 `business-pipeline-defaults.ts`。

---

## 3. 前置（pre）常用 step

| step | 用途 | 配置位置 |
|------|------|----------|
| `sensitiveCheck` | 提交 prompt 敏感词 | 默认 pre，一般不必手写 |
| `resolveContextFields` | Schema `x-ui-type: kbRecall` / `webSearch` | 按 `x-resolve-phase: pre` 自动 |
| `resolveVoiceoverAudio` | ffprobe 口播时长 | `audioUrlFrom` → `audio_duration_seconds` |
| `transcribeVoiceoverAudio` | **ASR 语音识别**（本地 FunASR Paraformer，中文优先）；MiniMax TTS 有字幕则跳过 | 建议放在 `resolveVoiceoverAudio` 之后；输出 `params.voiceover_subtitles_json` + `params.script` |
| `buildVideoEditTimeline` | **确定性 OpenReel 分镜 JSON**（策略 + fieldMapping，无业务硬编码） | `params.segmentStrategy` + `fieldMapping`；见下文 |
| `nestedText` | 调用独立 **text 子业务** | `nestedTextTaskKey: "text/transform/..."` + `inputMapping`；可选 `params.outputTarget: "lyrics"`（音乐：写入 lyrics 不覆盖 prompt） |
| `when`（步骤级） | **条件执行**（不满足则跳过，记入 pipelineTrace.skipped） | 见下方「执行条件」；Admin 执行管线 Tab 可配 |

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
- 同一 bundle 可含多个 item：text 子业务 + 主 scope 业务（见 `audio-speak-voice-over-test.business.json`）。

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

- `mxmcgi/src/tasks/examples/audio-speak-voice-over-test.business.json`（两个 nestedText 之间插入审核）
- `mxmcgi/src/tasks/examples/graph-post-image-review.example.json`（post 图片确认）

---

## 5. 后置（post）

`pipeline.post`：核心模型产出后的步骤（少见，按产品需要）。

- `resolveContextFields`（`x-resolve-phase: post`）
- `nestedText`（如：对 `state.coreArtifact.text` 做摘要/翻译）
- **`renderDocumentPdf`**：LLM 编排 `documentRenderSpec` → 校验 → PDFKit / Spec Engine / HTML Print → MinIO（见 `writing-resumes-it.business.json`）

`renderDocumentPdf` 配置要点：

- `layoutTaskKey`: `text/layout/document-render-spec`
- `inputMapping`: `markdown` ← `${state.coreArtifact.text}`，`renderer` ← `${params.pdf_renderer}`
- Core 业务设 `storage_form=markdown`；最终 PDF 仅 Post 产出
- Pre `nestedText` 可用 `params.outputStatePath: "pipeline.resumeProfile"` 写入结构化 JSON

默认多数业务 **post 为空**。

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
| 口播测试 bundle | `mxmcgi/src/tasks/examples/audio-speak-voice-over-test.business.json` |
| 固定前置链说明（敏感词/知识库） | `mxmcgi/src/tasks/README_TASK_V2_FIXED.md` |

---

## 8. 与各 scope skill 的关系

本 skill **不替代** graph/writing/audio/music/video 的 bundle skill；在对方案做「要不要分步、要不要人审」时 **先读本节**，再回对应 scope skill 写 formSchema / routing。

- Graph 格式化：优先 `graphPreFormat` + text/format 业务，通常**不需要**人工审核。
- Audio 口播：常见 **2 步 pre nestedText + 可选人工审核 + TTS 核心**。
- Music：可 1 步 pre 歌词草稿；人工审核同 audio。
- Writing：`generator` 多数 **无 pipeline**；`group` / `series` 按需分步。Video：多数 **无 pipeline**；长链路用 Smartflow 而非单任务 pre/post。
- type 命名见 [`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md)（非 text 统一 `generator`|`group`|`series`）。
