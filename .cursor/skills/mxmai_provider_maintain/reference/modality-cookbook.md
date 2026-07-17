# 输入/输出模态速查（modality cookbook）

> 配套 `mxmai_provider_maintain/SKILL.md` 第 1.5 步和 `reference.md` §4。  
> 数据源：`mxmcgi/src/scripts/data/hk-provider-modalities.ts`（HK 在线条目）。

## 1. 6 种模态枚举

| 值 | 中文 UI | 何时作为输入 | 何时作为输出 |
|----|---------|------------|------------|
| `text` | T 文本 | 总是（任何 LLM 都需要 prompt） | LLM 回答、TTS 文本输入 |
| `image` | 🖼 图片 | 生图参考 / 图生图 / 视觉理解 | 生图结果、风格迁移结果 |
| `audio` | 🔊 语音/音频 | 语音转文本 / 音乐提示 | TTS / 音乐 / 配音 |
| `video` | 🎬 视频 | 视频编辑 / 参考视频 / I2V | 文生视频、图生视频 |
| `3d` | 🧊 3D 模型 | 极少（3d-to-3d） | Seed3D / Hunyuan 3D 输出 |
| `embed` | 🔢 向量 | 文本 / 图像向量化 | 知识库 embedding |

## 2. 20 种 `*-to-*` 模式

| Mode | 适用 | 典型 model_key |
|------|------|----------------|
| `text-to-image` | 文生图 | gpt-image-2、nano-banana-2、image-01、seedream-4.0 |
| `image-edit` | 图编辑（基于参考图） | gpt-image-2、nano-banana-2、gpt-image-2-light |
| `image-to-image` | 图生图（风格/主体迁移） | image-01、image-01-live |
| `subject-reference` | 主体参考 | image-01 |
| `style-transfer` | 风格迁移 | image-01-live |
| `reference-to-image` | 多参考图生图 | nano-banana-2 |
| `text-to-video` | 文生视频 | seedance-2.0 系列、kling-v3-pro-t2v |
| `image-to-video` | 图生视频 | seedance-2.0 系列、kling-v3-pro-t2v |
| `reference-to-video` | 多参考视频 | seedance-2.0、seedance-2.0-mini |
| `video-edit` | 视频编辑 | seedance-2.0（含 native audio） |
| `video-extension` | 视频续写 | seedance-2.0 |
| `text-to-music` | 文生音乐 | suno/chirp-v4/v5、music-2.5/2.6 |
| `text-to-speech` | 文转语音 | speech-2.x 全系 |
| `voice-clone` | 声音克隆 | speech-2.8-hd |
| `text-to-3d` | 文生 3D | Seed3D / Hunyuan 3D（atlas 上架时填） |
| `image-to-3d` | 图生 3D | Seed3D 2.0、Hunyuan 3D Pro |
| `chat` | 对话 | 所有 LLM |
| `completion` | 续写 | 所有 LLM |
| `long-context` | 长上下文 | MiniMax-M3（1M context） |
| `multimodal-qa` | 多模态问答 | gemini-3.5-flash |
| `vision-qa` | 视觉问答 | claude-opus-4.8 |
| `embedding` | 向量化 | qwen3-embedding-8b、bge-m3、jina-embeddings-v3 |

## 3. Provider × 模态速查矩阵

### 3.1 atlascloud

| model_key | supported_inputs | supported_outputs | modes |
|-----------|------------------|-------------------|-------|
| gpt-image-2 | [text, image] | [image] | text-to-image, image-edit |
| nano-banana-2 | [text, image] | [image] | text-to-image, image-edit, reference-to-image |
| bytedance/seedance-2.0 | [text, image, video, audio] | [video, audio] | text-to-video, image-to-video, reference-to-video, video-edit, video-extension |
| bytedance/seedance-2.0-mini | [text, image, video, audio] | [video, audio] | text-to-video, image-to-video, reference-to-video |
| bytedance/seedance-2.0-fast/text-to-video | [text] | [video] | text-to-video |
| bytedance/seedance-v1.5-pro/text-to-video-fast | [text] | [video] | text-to-video |
| anthropic/claude-opus-4.8 | [text, image] | [text] | chat, completion, vision-qa |
| google/gemini-3.5-flash | [text, image, video, audio] | [text] | chat, completion, multimodal-qa |
| openai/gpt-oss-120b | [text] | [text] | chat, completion |
| suno/chirp-v4 / v5 | [text] | [audio] | text-to-music |

### 3.2 maxplan（国内 Token Plan）

| model_key | supported_inputs | supported_outputs | modes |
|-----------|------------------|-------------------|-------|
| image-01 | [text, image] | [image] | text-to-image, image-to-image, subject-reference |
| image-01-live | [text, image] | [image] | text-to-image, image-to-image, style-transfer |
| MiniMax-M3 | [text] | [text] | chat, completion, long-context |
| music-2.5 / 2.6 | [text] | [audio] | text-to-music |
| speech-2.8-hd | [text] | [audio] | text-to-speech, voice-clone |
| speech-2.8-turbo | [text] | [audio] | text-to-speech |
| speech-2.6-hd / 2.6-turbo | [text] | [audio] | text-to-speech |

### 3.3 jiekou（接口AI）

| model_key | supported_inputs | supported_outputs | modes |
|-----------|------------------|-------------------|-------|
| deepseek-v3 / r1 | [text] | [text] | chat, completion |
| gemini-2.5-flash / 2.0-flash | [text] | [text] | chat, completion |
| qwen-2.5-72b / qwen3-235b | [text] | [text] | chat, completion |
| llama-3.3-70b / claude-3-5-sonnet / glm-4.5 | [text] | [text] | chat, completion |
| gpt-image-2-light | [text, image] | [image] | text-to-image, image-edit |
| gemini-2.5-flash-image | [text, image] | [image] | text-to-image, image-edit |
| seedream-4.0 | [text] | [image] | text-to-image |
| nano-banana-light | [text, image] | [image] | text-to-image, image-edit |
| kling-v3-pro-t2v | [text, image] | [video] | text-to-video, image-to-video |
| qwen3-embedding-8b | [text] | [embed] | embedding（vector_dim=1536 占位） |

## 4. 决策流程

新增一个模型时，按下面 4 步确定 capabilities：

```
1. 看上游 API 文档
   ├─ 只接受 prompt？         → supported_inputs: [text]
   ├─ 接受参考图？            → 追加 image
   ├─ 接受参考视频？          → 追加 video
   └─ 接受音频输入？          → 追加 audio

2. 看输出
   ├─ 输出图片？              → supported_outputs: [image]
   ├─ 输出视频？              → supported_outputs: [video]
   ├─ 输出音频？              → supported_outputs: [audio]
   ├─ 输出 3D 模型？          → supported_outputs: [3d]
   ├─ 输出向量？              → supported_outputs: [embed]
   └─ 输出文本？              → supported_outputs: [text]

3. 看官方 *-to-* 分类（atlas / huggingface / openai）
   └─ 把支持的 mode 写到 modes[]，便于业务路由判断

4. 业务参数
   ├─ LLM：填 context_window / max_output_tokens
   ├─ Embedding：填 vector_dim
   └─ 其它：可省
```

## 5. 反例（不要这么填）

❌ `supported_inputs: []` — 模型至少接受 prompt，应该有 text  
❌ `supported_outputs: ['all']` — 必须从 6 个枚举里选具体值  
❌ 模态写在 `default_parameters` — 那是请求参数（max_tokens / temperature），不是能力声明  
❌ 只填新字段不填旧字段 — 双写策略要求同时写 `input/output` 嵌套对象  
❌ 不填 modes — 业务路由（reference-to-video vs text-to-video）无法自动判断  

## 6. 校验清单（CI/手工）

- [ ] `supported_inputs` / `supported_outputs` 全是 6 选 N（白名单在 `provider-modality.ts`）
- [ ] `modes` 中每个值是英文短语（小写、连字符）
- [ ] 老 `input/output` 嵌套对象与新数组**完全一致**（去重排序后比对）
- [ ] LLM 必有 `supported_outputs: [text]`
- [ ] 生图必有 `supported_outputs: [image]`
- [ ] 生视频必有 `supported_outputs: [video]`，mode 含 `text-to-video` 或 `image-to-video`
- [ ] TTS/音乐必有 `supported_outputs: [audio]`
- [ ] Embedding 必有 `supported_outputs: [embed]` 且 `vector_dim` 存在
- [ ] 3D 模型必有 `supported_outputs: [3d]` 且 mode 含 `text-to-3d` / `image-to-3d`
