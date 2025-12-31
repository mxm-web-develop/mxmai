# 音频 API 参考文档

本文档包含 MiniMax 语音合成 API 的所有可用参数和选项。

## 目录

- [音色 ID (voice_id)](#音色-id-voice_id)
- [情绪选项 (emotion)](#情绪选项-emotion)
- [API 使用示例](#api-使用示例)

---

## 音色 ID (voice_id)

MiniMax 支持多种系统音色，您可以在 `voice_setting.voice_id` 参数中使用以下音色 ID：

### 男性音色

| 音色名称 | voice_id |
|---------|----------|
| 青涩青年音色 | `male-qn-qingse` |
| 精英青年音色 | `male-qn-jingying` |
| 霸道青年音色 | `male-qn-badao` |
| 青年大学生音色 | `male-qn-daxuesheng` |
| 男性主持人 | `presenter_male` |
| 男性有声书 1 | `audiobook_male_1` |
| 男性有声书 2 | `audiobook_male_2` |
| 聪明男童 | `clever_boy` |
| 可爱男童 | `cute_boy` |
| 病娇弟弟 | `bingjiao_didi` |
| 俊朗男友 | `junlang_nanyou` |
| 纯真学弟 | `chunzhen_xuedi` |
| 冷淡学长 | `lengdan_xiongzhang` |
| 霸道少爷 | `badao_shaoye` |

### 女性音色

| 音色名称 | voice_id |
|---------|----------|
| 少女音色 | `female-shaonv` |
| 御姐音色 | `female-yujie` |
| 成熟女性音色 | `female-chengshu` |
| 甜美女性音色 | `female-tianmei` |
| 女性主持人 | `presenter_female` |
| 女性有声书 1 | `audiobook_female_1` |
| 女性有声书 2 | `audiobook_female_2` |
| 萌萌女童 | `lovely_girl` |
| 甜心小玲 | `tianxin_xiaoling` |
| 俏皮萌妹 | `qiaopi_mengmei` |
| 妩媚御姐 | `wumei_yujie` |
| 嗲嗲学妹 | `diadia_xuemei` |
| 淡雅学姐 | `danya_xuejie` |

### Beta 音色（高质量版本）

| 音色名称 | voice_id |
|---------|----------|
| 青涩青年音色-beta | `male-qn-qingse-jingpin` |
| 精英青年音色-beta | `male-qn-jingying-jingpin` |
| 霸道青年音色-beta | `male-qn-badao-jingpin` |
| 青年大学生音色-beta | `male-qn-daxuesheng-jingpin` |
| 少女音色-beta | `female-shaonv-jingpin` |
| 御姐音色-beta | `female-yujie-jingpin` |
| 成熟女性音色-beta | `female-chengshu-jingpin` |
| 甜美女性音色-beta | `female-tianmei-jingpin` |

### 特殊音色

| 音色名称 | voice_id |
|---------|----------|
| 卡通猪小琪 | `cartoon_pig` |

### 英文音色

| 音色名称 | voice_id |
|---------|----------|
| Santa Claus | `Santa_Claus` |
| Grinch | `Grinch` |
| Rudolph | `Rudolph` |
| Arnold | `Arnold` |
| Charming Santa | `Charming_Santa` |
| Charming Lady | `Charming_Lady` |
| Sweet Girl | `Sweet_Girl` |
| Cute Elf | `Cute_Elf` |
| Attractive Girl | `Attractive_Girl` |
| Serene Woman | `Serene_Woman` |

---

## 情绪选项 (emotion)

MiniMax 支持 7 种情绪，您可以在 `voice_setting.emotion` 参数中使用以下值：

| 情绪 | emotion 值 | 说明 |
|------|-----------|------|
| 高兴 | `happy` | 表达快乐、愉悦的情绪 |
| 悲伤 | `sad` | 表达悲伤、沮丧的情绪 |
| 愤怒 | `angry` | 表达愤怒、生气的情绪 |
| 害怕 | `fearful` | 表达恐惧、害怕的情绪 |
| 厌恶 | `disgusted` | 表达厌恶、反感的情绪 |
| 惊讶 | `surprised` | 表达惊讶、意外的情绪 |
| 中性 | `neutral` | 默认情绪，无明显情感倾向 |

---

## API 使用示例

### 同步语音合成（minimax-speech-02-turbo）

```bash
POST http://localhost:3000/api/v1/cgi/audio/minimax-speech-02-turbo
```

**请求体示例：**

```json
{
  "text": "这是一段试听文本，我现在真的很开心呀，哈哈哈哈",
  "voice_setting": {
    "voice_id": "female-shaonv",
    "speed": 1.0,
    "vol": 1.0,
    "pitch": 0,
    "emotion": "happy",
    "text_normalization": false
  },
  "audio_setting": {
    "format": "mp3",
    "sample_rate": 32000,
    "bitrate": 128000,
    "channel": 1
  },
  "output_format": "url"
}
```

**响应示例：**

```json
{
  "success": true,
  "model": "minimax-speech-02-turbo",
  "data": {
    "mediaUrls": [
      "https://faas-minimax-audio-1312767721.cos.ap-shanghai.myqcloud.com/..."
    ],
    "metadata": {
      "model": "minimax-speech-02-turbo",
      "provider": "ppio",
      "status": 2
    }
  }
}
```

### 异步语音合成（minimax-speech-02-hd-async）

```bash
POST http://localhost:3000/api/v1/cgi/audio/minimax-speech-02-hd-async
```

**请求体示例：**

```json
{
  "text": "这是一段试听文本，我现在真的很开心呀，哈哈哈哈",
  "voice_setting": {
    "voice_id": "male-qn-jingying",
    "speed": 1.1,
    "vol": 1.0,
    "pitch": 0,
    "emotion": "happy",
    "text_normalization": false
  },
  "audio_setting": {
    "format": "mp3",
    "sample_rate": 32000,
    "bitrate": 128000,
    "channel": 1
  },
  "language_boost": "Chinese",
  "voice_modify": {
    "pitch": 0,
    "intensity": 0,
    "timbre": 0,
    "sound_effects": "spacious_echo"
  },
  "storeToMinio": true
}
```

**响应示例：**

```json
{
  "success": true,
  "model": "minimax-speech-02-hd-async",
  "data": {
    "taskId": "xxx",
    "status": "pending",
    "createdAt": "2025-12-21T..."
  }
}
```

### 使用音色混合（timbre_weights）

```json
{
  "text": "这是一段试听文本",
  "timbre_weights": [
    {
      "voice_id": "female-shaonv",
      "weight": 60
    },
    {
      "voice_id": "female-yujie",
      "weight": 40
    }
  ],
  "voice_setting": {
    "speed": 1.0,
    "vol": 1.0,
    "pitch": 0,
    "emotion": "happy"
  }
}
```

**注意：** `voice_id` 和 `timbre_weights` 二选一必填。`timbre_weights` 支持最多 4 种音色混合，权重范围为 [1,100]。

---

## 参数说明

### voice_setting 参数

| 参数 | 类型 | 范围/选项 | 默认值 | 说明 |
|------|------|----------|--------|------|
| `voice_id` | string | 见上方音色列表 | - | 音色编号（与 timbre_weights 二选一必填） |
| `speed` | number | [0.5, 2] | 1.0 | 语速，取值越大语速越快 |
| `vol` | number | (0, 10] | 1.0 | 音量，取值越大音量越高 |
| `pitch` | number | [-12, 12] | 0 | 语调，0 为原音色输出，需为整数 |
| `emotion` | string | 见上方情绪列表 | - | 情绪类型 |
| `text_normalization` | boolean | true/false | false | 英语文本规范化 |
| `latex_read` | boolean | true/false | false | 是否支持朗读 latex 公式（仅同步接口） |

### audio_setting 参数

| 参数 | 类型 | 范围/选项 | 默认值 | 说明 |
|------|------|----------|--------|------|
| `format` | string | mp3, pcm, flac, wav | mp3 | 音频格式 |
| `sample_rate` | number | 8000, 16000, 22050, 24000, 32000, 44100 | 32000 | 采样率 |
| `bitrate` | number | 32000, 64000, 128000, 256000 | 128000 | 比特率（仅 mp3 格式生效） |
| `channel` | number | 1, 2 | 1 | 声道数（1=单声道，2=双声道） |

### voice_modify 参数（声音效果器）

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `pitch` | number | [-100, 100] | 0 | 音高调整（-100=低沉，100=明亮） |
| `intensity` | number | [-100, 100] | 0 | 强度调整（-100=刚劲，100=轻柔） |
| `timbre` | number | [-100, 100] | 0 | 音色调整（-100=浑厚，100=清脆） |
| `sound_effects` | string | spacious_echo, auditorium_echo, lofi_telephone, robotic | - | 音效设置 |

---

## 支持的模型

### 同步模型（直接返回结果）

- `minimax-speech-02-turbo` - Speech-02-turbo 同步语音合成
  - 文本长度限制：最大 10000 字符
  - 适用场景：短句生成、语音聊天、在线社交

### 异步模型（返回 taskId，需要轮询）

- `minimax-speech-02-hd-async` - Speech-02-hd 异步语音合成
- `minimax-speech-2.6-hd-async` - Speech-2.6-hd 异步语音合成
- `minimax-speech-2.5-turbo-async` - Speech-2.5-turbo 异步语音合成
  - 文本长度限制：最大 100 万字符
  - 适用场景：长文本、整本书籍等

---

## 注意事项

1. **音色选择**：`voice_id` 和 `timbre_weights` 二选一必填，如果都不提供，系统会使用默认音色 `female-shaonv`。

2. **情绪设置**：`emotion` 参数可选，如果不提供，将使用默认的中性情绪。

3. **文本长度**：
   - 同步接口（turbo）：最大 10000 字符
   - 异步接口（hd）：最大 100 万字符

4. **音频 URL 有效期**：返回的音频 URL 有效期为 24 小时，请及时下载。

5. **存储选项**：可以通过 `storeToMinio: true` 将生成的音频自动存储到 MinIO，系统会自动生成存储路径。

---

## 参考链接

- [PPIO MiniMax Speech-02-turbo 文档](https://ppio.com/docs/models/reference-minimax-speech-02-turbo)
- [PPIO MiniMax Speech-02-hd 异步文档](https://ppio.com/docs/models/reference-minimax-speech-02-hd-async)
- [PPIO 查询任务结果 API](https://ppio.com/docs/models/reference-get-async-task-result)
