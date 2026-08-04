---
name: mxmai-audio-business-bundle
description: 在 SuperMXMai 中新增或更新 Audio 子业务（formSchema + unifiedTemplate + 可选管线 + 路由/计费），通过 mxm-business-bundle 导入。适用于 MiniMax TTS 口播、Task V2 scope=audio 的配置化上架。
---

# Audio 子业务上架（mxmai）

> **命名（必读）**：[`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md) — audio type **仅** `generator`（单口 / Voiceover）| `group`（对话 / Dialogue）| `series`（系列 / Series）。  
> 典例：[`audio-generator-voice-over-test.business.json`](../../../mxmcgi/src/tasks/examples/audio-generator-voice-over-test.business.json)（`type=generator` + `subtype=voice-over-test`；管线：口播稿 → TTS 优化 → MiniMax）。  
> **对话组典例**：[`audio-group-multi-voice.business.json`](../../../mxmcgi/src/tasks/examples/audio-group-multi-voice.business.json)（`type=group` + `subtype=multi-voice`；**pre 双交互卡**：文稿 → `text/expert/dialogue-content-scan` → 形式/人数/音色推荐卡 → input 合同 → enrich 台词/cue → 人审 → **output：逐句 TTS + 时间轴混音**）。  
> **新上架**例如：`type=generator` + `subtype=podcast-host`（subtypeLabel ≤ 8 字；补英文 i18n）。**不要**默认加 `parallel_count`。  
> **可选执行管线**：[`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md) — **仅在需要分步写稿或人审时选用**；**硬约束**：合同 → 生成接口默认在 **output**（`generator`/`group`/`series` 一致），勿把主 TTS/混音塞进 post。

## 1. 数据落在哪里

| 层级 | 存储 | 作用 |
|------|------|------|
| 任务模板 | `prompt_engineering_config` | `extra.taskTemplate`：`formSchema`、`unifiedTemplate`、`storage`、`pipeline` |
| 路由 | `audio_scope_config` | `task_key` + `sub_type` → `provider` + `model`（如 `speech-2.8-hd`） |
| text 子业务 | 同表 `scope=text` | 口播稿撰写、TTS 优化等，供 `pipeline.pre` / enrich nestedText 引用 |
| 计费 | `business_pricing` | 常见 `per_audio_second` |

### 1.1 Audio `type`（钉死）

| type | taskLabel | taskLabelI18n.en | 说明 |
|------|-----------|------------------|------|
| `generator` | 单口 | Voiceover | 单人 / 单轨 TTS 等；合同为主对象 |
| `group` | 对话 | Dialogue | 多角色 / 多音色对话或多轨；合同为对象数组；**output 遍历** `lines` 调 speech |
| `series` | 系列 | Series | 带历史上下文的连续配音 |

**不得新建**旧 type：`voiceover` `dialogue` `multiple` `speak`。仓库已删除 `audio-speak-*` 示例；DB 用 `pnpm run deactivate:legacy-audio-speak` 停用。解析层仍保留 `speak→generator` 别名仅兼容历史任务。

## 2. 直出 vs 管线版

| 模式 | pipeline | 说明 |
|------|----------|------|
| **直出** | 无 / 仅平台默认 | 用户文本直接进 TTS（需表单或模板提供最终 prompt） |
| **Warp 口播（推荐）** | `executionMode: mxm-warp`：pre 采文档/音色/播报风格 → input 订合同 → enrich 口播稿+TTS 改写+人审 → **`skipOutputLlm` → output 位 speech 合成**（`post` 通常为空） | 见 `audio-generator-voice-over-test.business.json` |
| **Warp 对话组** | enrich 写 `business.lines[]` + cue + 人审 → **`skipOutputLlm` → output：`dialogueLineTts` → 展轴 → 混音** | 见 multi-voice；**禁止**把该链当成「后置加工」长期挂 post |
| **旧 deferred pre** | `pre` 含 `afterPromptRender` nestedText | 兼容旧包；Warp 业务勿再挂 `afterPromptRender` |

### 2.1 `skipOutputLlm` 与 output（音频必读）

1. **`skipOutputLlm: true`**：只跳过 Warp output 的**文本 LLM**（稿已在 enrich/人审定死）。
2. **仍然必须有 output**：从合同/成稿调 **speech 路由**（单口一次；group 遍历数组 + 必要混音）。
3. **不要**因为设了 `skipOutputLlm` 就把 TTS/混音写进 `pipeline.post`，否则 Admin 会显示成「后置」，与全站「合同→生成=output」规范冲突。详见 [pipeline skill §2.1](../mxmai_business_pipeline/SKILL.md)。

**纠偏（multi-voice）**：历史 bundle 曾把三步合成挂在 `pipeline.post`——属债务。目标布局：

```
enrich: nestedText(拆稿/markup/cues) + manualReview
output: dialogueLineTts → resolveDialogueTimeline → renderAudioTimeline   // 或引擎等价路径
post:   [] 或真后置（转码/附件等）
```

新 audio 业务上架 checklist：主合成是否在 output？`post` 是否未包含 speech/混音主链？

**播报风格（`broadcast_style`）**：`fast_talk` 快嘴 1.4 / `news` 资讯 1.3 / `chat_show` 聊天 ≈1.2 / `late_night` 深夜 ≈1.0；驱动语速与 enrich 改写指令。

**首尾留白**：

- **单口**：合成前可由 `ensureTtsEdgePauses` 保证全文首尾至少 `<#0.8#>`（已有更长则保留）。
- **多人对话**：默认**不要**抬到 0.8s 边停（会冲掉抢词/紧凑接话）；保留 enrich 短停顿；落轴按有效语音对齐。

**主播人设（`host_persona` / cast.persona，可选）**：性格 / 常用语气词 / 口头语。  
- **角色卡**：本地从卡字段拼装。  
- **系统音色**：**LLM**（`text/expert/voice-persona-sketch` + `POST /api/v1/search/voice-persona-sketch`）按音色名/官方描述生成可编辑草稿；**禁止**前端关键词表写死人设。过糊 label 不请求。  
- enrich 对人口头禅做**择位点缀**（庄重/事实句禁止句首硬塞）。**不要**把人设写进 MiniMax `voice_setting`。

**原则**：能直出就直出；口播场景用 Warp + text 挂 enrich；**生成接口永远在 output**。

## 3. formSchema 建议（口播）

- `source_material`（`x-ui-type: textFileOrPaste`：粘贴文本 / 上传解析 txt·md·pdf / 虚拟文件夹选取写作任务或文本文件，三选一）
- `voice`（`x-ui-type: minimaxVoice`）+ 可选 `host_persona`（textarea；`x-guided-hidden`，在音色步内联编辑）
- `broadcast_style`
- `speed`、`total_duration_seconds`（计费，隐藏）
- **不含**表单级 `tts_model`（路由固定物理模型）

## 4. 导入

```bash
cd mxmcgi
pnpm run seed:audio-voice-over-test
pnpm run seed:audio-multi-voice
# 或
pnpm run apply:bundle -- src/tasks/examples/audio-generator-voice-over-test.business.json
pnpm run apply:bundle -- src/tasks/examples/audio-group-multi-voice.business.json
pnpm run deactivate:legacy-audio-speak
```

生产：`bash scripts/seed-audio-bundle-production.sh`

## 5. 验证

- Admin → audio/generator/voice-over-test → **执行管线**：enrich 文本步 + 可选人工审核；**output** 为 speech（post 宜空）
- Admin → audio/group/multi-voice：合成链应理解成 **output**，勿再当标准后置范例复制
- 开启人工审核时：任务待审核 → 编辑草稿 → 开始生成 → MP3 + 字幕
- `pnpm --filter @mxmai/mxmcgi` 相关 seed 后 Web「音频」页可提交（业务键为 `generator` / `voice-over-test`）

## 6. 运行时

- 提交：`task-engine` 创建任务，`businessPipelinePreDeferred: true`
- Worker：`deferred-media-pipeline.ts` / `audio-warp-pipeline.ts`：Warp 五段后 **output 位**调 TTS（单口）或对话混音链（group）
- 参数：`audio-tts-params.ts` → maxplan `t2a_v2`
