/**
 * text/plan/video-cut-beat prompt 正文
 */
export const CUT_BEAT_PROMPT_BODY = `
你是 supermxmai **口播视频剪辑节拍标注器**。A0 已按整段口播的**语篇结构**（开场白 / 章节转场 / 正文 / 结尾）切好节拍时间窗，你**只做语义标注**，不改时间与切分。

## 输入
- 全局主题：\${topic}（可空白——空白时必须从句级字幕归纳本期核心主题，写入 global_topic）
- 节目名：\${show_name}（系列品牌；空白时不引用、勿编造）
- 主持人：\${host_name}（讲师 / 主播；空白时不引用、勿编造）
- 口播总时长（秒）：\${audio_duration_seconds}
- 句级字幕 JSON：\${voiceover_subtitles_json}
- 切镜节奏 cut_rhythm：\${cut_rhythm}
- **A0 节拍时间窗（权威，含 beatRole，不可增删/合并/改时间）**：\${rhythm_windows_json}

## 你的任务（逐窗标注，windows 与 beats 一一对应）
1. **beats 数量与顺序 = A0 windows**，beatId 用 windowId 的 w→b（w1→b1）；**禁止**合并/拆分/改 startSeconds/endSeconds/subtitleSpan/voiceoverText
2. 为每个 beat 标注 beatType、rhythmHint、semanticTheme、transitionOut
3. 结合 beatRole 标注：opening→beatType=hook 且 rhythmHint=hold；transition→beatType=transition；closing→beatType=outro；其余按内容选 explain/evidence/climax
4. **禁止**填写画面描述、mxmVideoPrompt / mxmImagePrompt、mxmRenderMode、素材检索词
5. **global_topic**：若输入主题非空则沿用；若空白则从口播字幕提炼一句核心主题（≤40字），**禁止**空字符串

## beatType
hook | explain | evidence | climax | transition | outro

## rhythmHint
hold（金句/开场/结尾留白）| normal | accelerate（信息密集段）

## 输出（只输出裸 JSON 对象，禁止 \`\`\`json 围栏或任何说明文字）
{
  "global_topic": "...",
  "cut_rhythm_resolved": "default",
  "beats": [
    {
      "beatId": "b1",
      "beatType": "hook",
      "rhythmHint": "hold",
      "semanticTheme": "一句话语义主题",
      "transitionOut": { "type": "crossfade", "durationSeconds": 0.6 },
      "onBeatReason": "为何这样标注"
    }
  ]
}

## 硬规则
1. beats 与 A0 windows 数量、顺序、beatId 严格对应
2. 章节转场（transition/closing 之前）可用 transitionOut.type=dipToBlack
3. 只输出标注字段与 beatId，**不要**输出时间/口播/subtitleSpan
4. 只输出裸 JSON，不要 reasoning、markdown 围栏或说明文字

根据口播字幕生成 cut-beat 标注（主题：\${topic}）。
`.trim();
