---
name: mxmai-music-business-bundle
description: 在 SuperMXMai 中新增或更新 Music 子业务（formSchema + unifiedTemplate + 管线 + 路由/计费），通过 mxm-business-bundle 导入。适用于 AI 音乐生成（maxplan music-2.5/2.6）、Task V2 scope=music 的配置化上架。
---

# Music 子业务上架（mxmai）

> **命名（必读）**：[`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md) — music type **仅** `generator`（生成 / Generated）| `group`（片段 / Fragment）| `series`（系列 / Series）。  
> 历史示例：[`music-compose-maxplan-test.business.json`](../../../mxmcgi/src/tasks/examples/music-compose-maxplan-test.business.json)（旧 `compose/*` / `fragment`）。  
> **新上架**例如：`type=generator` + `subtype=full-track`；成组短 hook 用 `type=group`。subtypeLabel ≤ 8 字。

**可选执行管线**（前置歌词 nestedText / 人工审核，**非必须**）：见 [`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md)。`generator` 直出可 **不配** pipeline。

## 1. 数据落在哪里

| 层级 | 存储 | 作用 |
|------|------|------|
| 任务模板 | `prompt_engineering_config` | `extra.taskTemplate`：`formSchema`、`unifiedTemplate`、`storage`、`pipeline` |
| 路由 | `music_scope_config` | `task_key` + `sub_type` → `provider` + `model` |
| 物理模型 | `provider_models` | `music-2.5` / `music-2.6`，`protocol=music_generation` |
| 计费 | `business_pricing` | `charge_metric: per_audio_second` |

### 1.1 Music `type`（钉死）

| type | taskLabel | taskLabelI18n.en | 说明 |
|------|-----------|------------------|------|
| `generator` | 生成 | Generated | 完整曲目单次生成；合同为主对象 |
| `group` | 片段 | Fragment | 短 hook / 切片向成组产出；合同为对象数组 |
| `series` | 系列 | Series | 带历史曲目上下文的续作 / 变奏 |

**不得新建**旧 type：`fragment`（请改 `group`）、`compose` 等（历史可暂留）。

## 2. 与 Audio 的差异

| 维度 | Audio（口播） | Music（音乐） |
|------|---------------|---------------|
| maxplan API | `t2a_v2` | `music_generation` |
| 物理模型 | `speech-2.8-*` | `music-2.5` / `music-2.6` |
| 表单核心 | 音色、情绪、TTS 模型 | 风格、歌词、纯器乐、音乐模型 |
| 预览 | 句级字幕 + 播放条 | **仅播放条**（无 subtitle API） |
| 参数层 | `audio-tts-params.ts` | `music-generation-params.ts` |

**原则**：平台 formSchema 能力全集可配（`text`、`kbRecall`、`selection`、`nestedText` 等）；具体业务 bundle 用不用某字段/管线，由业务设计决定。

## 3. formSchema 建议字段

- `source_text`（`x-ui-type: text`）
- `source_ref`（`x-ui-type: kbRecall`，`x-resolve-phase: pre`）
- `music_style`（`x-ui-type: selection`）
- `lyrics`（可选完整歌词）
- `make_instrumental`（布尔，提交时映射为 `is_instrumental`）
- `music_model`（`music-2.6` / `music-2.5`，覆盖路由物理模型）
- `supplement`
- `total_duration_seconds`（计费参考，隐藏）

**不含**：`minimaxVoice`、`emotion`、`tts_model`、`subtitle_*`。

## 4. 管线（可选）

参照 audio 口播测试，可内置 1 步 `nestedText`，**由 text 业务产出歌词，作为 `lyrics` 传入音乐接口**（避免 MiniMax/Suno `lyrics_optimizer` 自动写词）：

- `text/transform/music-lyrics-draft` — 输入 `source_material`、`music_style`、`language`、`supplement` → **输出纯歌词**（[Verse]/[Chorus] 段落结构）
- 该 nestedText step 的 `params` 须含 `{ "afterPromptRender": true, "outputTarget": "lyrics" }`（均在 Admin「文本子业务」设置中可配）：
  - `outputTarget: "lyrics"` → 输出写入 `params.lyrics` 与 `state.lyricsDraft`，**不覆盖** `finalPrompt`
  - 主业务 `unifiedTemplate` 渲染出的**曲风描述**作为 `music_generation` 的 `prompt`
- **纯器乐跳过写词**：在 nestedText 步骤配置 `when.all`（非代码硬编码），例如：
  ```json
  "when": {
    "all": [
      { "field": "params.make_instrumental", "op": "falsy" },
      { "field": "params.is_instrumental", "op": "falsy" },
      { "field": "params.lyrics", "op": "empty" }
    ]
  }
  ```
- provider 收到 `lyrics` 后自动置 `lyrics_optimizer=false`；歌词回显在结果 `metadata.lyrics` 与 `businessPipelineState.musicPipeline.lyrics`（文本已保存）

直出版（`compose/maxplan-direct`）无 `pipeline.pre`；用户可在 `lyrics` 字段直接粘贴完整歌词，同样走 `lyrics` 路径。

## 5. Admin 必配

1. **物理模型**：`pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-models`（含 music-2.5/2.6）
2. **业务 bundle**：见下方导入命令
3. **计价**：`business_pricing`，`per_audio_second`

## 6. 导入 bundle

```bash
cd mxmcgi
pnpm run seed:music-maxplan-test
# 或
pnpm run apply:bundle -- src/tasks/examples/music-compose-maxplan-test.business.json
```

生产环境：

```bash
bash scripts/seed-music-bundle-production.sh
```

## 7. 验证

1. Admin 连通性测试 `music-2.6` / `music-2.5` 返回音频 URL
2. Web「音乐」页：`scope=music`，`compose/maxplan-direct` 提交后 `GET /media/music/:taskId` 可播放
3. 管线版 `maxplan-test`：text 业务产出的歌词进入 `music_generation.lyrics`（**非** prompt），曲风描述作为 `prompt`；结果 `metadata.lyrics` 有词
4. 表单 `music_model=music-2.5` 覆盖路由
5. `make_instrumental=true` → API `is_instrumental=true`
6. 播放器无字幕（`AudioViewerModal showSubtitles={false}`）

## 8. 运行时要点

- `ModelScope` 含 `music`；`task-executor` `scopeHint=music`
- `task-engine`：`scope=music` 走 `buildMusicGenerationParameters`，**不走** TTS `voice_setting`
- 前端：`prepareTaskV2SubmitParams(..., { scope: 'music' })` 调用 `flattenMusicFormForSubmit`
