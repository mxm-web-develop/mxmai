---
name: mxmai-audio-business-bundle
description: 在 SuperMXMai 中新增或更新 Audio 子业务（formSchema + unifiedTemplate + 可选管线 + 路由/计费），通过 mxm-business-bundle 导入。适用于 MiniMax TTS 口播、Task V2 scope=audio 的配置化上架。
---

# Audio 子业务上架（mxmai）

> **命名（必读）**：[`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md) — audio type **仅** `generator`（单口 / Voiceover）| `group`（对话 / Dialogue）| `series`（系列 / Series）。  
> 历史示例：[`audio-speak-voice-over-test.business.json`](../../../mxmcgi/src/tasks/examples/audio-speak-voice-over-test.business.json)（旧 `speak/*` / `voiceover/*`，结构可参考）。  
> **新上架**例如：`type=generator` + `subtype=podcast-host`（subtypeLabel ≤ 8 字；补英文 i18n）。**不要**默认加 `parallel_count`。  
> **可选执行管线**：[`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md) — **仅在需要分步写稿或人审时选用**

## 1. 数据落在哪里

| 层级 | 存储 | 作用 |
|------|------|------|
| 任务模板 | `prompt_engineering_config` | `extra.taskTemplate`：`formSchema`、`unifiedTemplate`、`storage`、`pipeline` |
| 路由 | `audio_scope_config` | `task_key` + `sub_type` → `provider` + `model`（如 `speech-2.8-hd`） |
| text 子业务 | 同表 `scope=text` | 口播稿撰写、TTS 优化等，供 `pipeline.pre` nestedText 引用 |
| 计费 | `business_pricing` | 常见 `per_audio_second` |

### 1.1 Audio `type`（钉死）

| type | taskLabel | taskLabelI18n.en | 说明 |
|------|-----------|------------------|------|
| `generator` | 单口 | Voiceover | 单人 / 单轨 TTS 等；合同为主对象 |
| `group` | 对话 | Dialogue | 多角色 / 多音色对话或多轨；合同为对象数组 |
| `series` | 系列 | Series | 带历史上下文的连续配音 |

**不得新建**旧 type：`voiceover` `dialogue` `multiple` `speak`（历史可暂留；解析层有别名）。

## 2. 直出 vs 管线版

| 模式 | pipeline | 说明 |
|------|----------|------|
| **直出** | 无 / 仅平台默认 | 用户文本直接进 TTS（需表单或模板提供最终 prompt） |
| **管线版** | `pre` 含 `afterPromptRender` nestedText | 口播稿 → TTS 优化 → 核心 TTS；text 为独立业务 |
| **+ 人工审核** | 上者 + `pipeline.pre` 中插入 `manualReview` | 前置 text 跑完后 `awaiting_review`，用户改稿再 TTS |

**原则**：能直出就直出；口播场景再上架 text 子业务 + pipeline。

## 3. formSchema 建议（口播）

- `source_material`（`x-ui-type: textFileOrPaste`：粘贴文本 / 上传解析 txt·md·pdf / 虚拟文件夹选取写作任务或文本文件，三选一）
- `voice_style`、`host_style`、`emotion`
- `voice`（`x-ui-type: minimaxVoice`）
- `speed`、`total_duration_seconds`（计费，隐藏）
- **不含**表单级 `tts_model`（路由固定物理模型）

## 4. 导入

```bash
cd mxmcgi
pnpm run seed:audio-voice-over-test
# 或
pnpm run apply:bundle -- src/tasks/examples/audio-speak-voice-over-test.business.json
```

生产：`bash scripts/seed-audio-bundle-production.sh`

## 5. 验证

- Admin → audio/speak/voice-over-test → **执行管线**：可见两步「前置 text」
- 开启人工审核时：任务待审核 → 编辑草稿 → 开始生成 → MP3 + 字幕
- `pnpm --filter @mxmai/mxmcgi` 相关 seed 后 Web「音频」页可提交

## 6. 运行时

- 提交：`task-engine` 创建任务，`businessPipelinePreDeferred: true`
- Worker：`deferred-media-pipeline.ts` 跑 pre nestedText
- 参数：`audio-tts-params.ts` → maxplan `t2a_v2`
