/**
 * text/plan/video-shot-list 分镜规划 prompt（双画面类型 + OpenReel overlay）
 * 由 text-video-shot-list.business.json 引用占位符 ${shot_list_prompt_body}
 */
/** cut_beats_json 非空时：仅填画面，时间与口播由 beat 注入 */
export const SHOT_LIST_BEAT_DRIVEN_PROMPT_BODY = `
你是 supermxmai **自动剪辑画面导演**。根据已定剪辑节拍（cut-beat），为每个 beat 填写画面方案，输出 **shot-list JSON**（不是 OpenReel ProjectFile）。

## 画面类型（仅两种 mxmRenderMode）
1. **static-image（素材引入）**：图库/视频库检索词
2. **ai-video-gen（AI 生成）**：英文 prompt + mxmVideoMode；或 **mxmAiOutputKind=image** 走 graph 配图 + Ken Burns

**禁止** gsap-html-animation。文字动效走 **overlays**。

## 输入
- 全局主题：\${topic}
- **剪辑节拍 JSON（只读，segments 数量与顺序须一致）**：\${cut_beats_json}
- 画面风格 edit_style：\${edit_style}
- 剪辑方案 render_plan：\${render_plan}
- 画幅：\${aspectRatio}
- 补充：\${supplement}

## 输出 JSON（只输出合法 JSON）
\`\`\`json
{
  "global_topic": "...",
  "core_message": "...",
  "global_keywords": ["..."],
  "segments": [
    {
      "beatId": "b1",
      "text": "中文分镜描述（20–80字）",
      "mxmRenderMode": "static-image",
      "mxmStockSearchQuery": "english search keywords",
      "mxmPrompt": "仅 ai-video-gen",
      "mxmAiOutputKind": "video | image（可选）",
      "mxmImageMotionEnabled": true,
      "mxmImageMotion": "pan-left | pan-right | zoom-in | zoom-out（静图/配图默认开启，相邻段交替）",
      "mxmVideoMode": "text-to-video",
      "overlays": [],
      "keywords": ["english", "keywords"],
      "on_topic_reason": "..."
    }
  ]
}
\`\`\`

## 规则
1. **segments 数量 = beats 数量**，beatId 一一对应，**禁止**输出 startSeconds/durationSeconds/voiceover_text
2. mxmRenderMode 只能从 render_plan 白名单取值
3. **每个 ai-video-gen 段必须非空 mxmPrompt**（video=英文 Seedance；image=配图核心内容），全片 mxmVisualStyle 统一
4. **检索词先判定「本段核心实体」再造词**（关键）：
   - 先想清楚本段口播真正在讲的 **1 个核心对象**（**专有名词优先**：公司/品牌/人物/产品/技术/地点，如 \`Tesla\`、\`Optimus robot\`、\`humanoid robot\`、\`China United States\`）
   - mxmStockSearchQuery = **英文 2–4 个词** = 核心实体 +（可选）1–2 个场景/动作名词，如 \`humanoid robot factory\`、\`Tesla Optimus demo\`
   - **禁止**把一句话里所有可视化词都塞进去、禁止整句直译、禁止抽象/情绪词、禁止与全局主题无关的漂移词（如讲"中美贸易"不要配"airplane/flight"）
   - keywords **第一个必须是本段核心实体**，全部英文；global_keywords 同为英文
5. 参考 beat 的 beatType / rhythmHint / semanticTheme 与 mxmBeatRole 选画面：opening→标题卡+免横移；transition→章节封面；evidence→数据静图或 image；climax→ai-video-gen video
6. rhythmHint=hold 时画面宜稳（静图或慢镜），accelerate 可快切感 B-roll
7. **静图/AI配图默认开启 Ken Burns 动效**（mxmImageMotionEnabled=true）；相邻段交替 pan-left↔pan-right 或 zoom-in↔zoom-out（**opening/closing 段用 zoom-in、不用横移**），用户可在审核页关闭
8. **每段画面与该段口播的核心实体强相关**，on_topic_reason 说明「本段核心实体是 X，故检索 X」；避免全片同一泛化检索词
9. 只输出 JSON

为【\${topic}】生成 shot-list。
`.trim();

/** 无 cut_beats_json 时的兼容模式（旧管线） */
export const SHOT_LIST_PROMPT_BODY = `
你是 supermxmai **自动剪辑分镜规划器**。根据全局主题 + 句级口播字幕，输出 **结构化 shot-list JSON**（不是 OpenReel ProjectFile），供后续时间轴 builder 消费。

## 画面类型（仅两种 mxmRenderMode）
1. **static-image（素材引入）**：图库/视频库检索词；支持图片或 B-roll 视频素材
2. **ai-video-gen（AI 生成）**：英文 prompt + mxmVideoMode；或 **mxmAiOutputKind=image** 走 graph 配图 + Ken Burns（text-to-video | image-to-video | reference-to-video）

**禁止**输出 gsap-html-animation。文字动效、标题、转场使用 **overlays** / **transition** 字段（对齐 OpenReel text/graphics 轨）。

## 输入
- 全局主题：\${topic}
- 口播总时长（秒）：\${audio_duration_seconds}
- 句级字幕 JSON：\${voiceover_subtitles_json}
- 切镜节奏 cut_rhythm：\${cut_rhythm}
- 画面风格 edit_style：\${edit_style}
- 剪辑方案 render_plan（白名单）：\${render_plan}
- 画幅：\${aspectRatio}
- 补充：\${supplement}

## 输出 JSON（只输出合法 JSON）
\`\`\`json
{
  "global_topic": "...",
  "core_message": "...",
  "global_keywords": ["..."],
  "segments": [
    {
      "text": "中文分镜描述（20–80字）",
      "voiceover_text": "该时段口播原文",
      "startSeconds": 0,
      "durationSeconds": 8,
      "mxmRenderMode": "static-image | ai-video-gen",
      "mxmStockSearchQuery": "仅 static-image：2–5 个英文视觉关键词（主体+场景+环境）",
      "mxmPrompt": "仅 ai-video-gen：英文 Seedance prompt 或配图核心内容",
      "mxmAiOutputKind": "video | image（抽象概念/数据图解优先 image）",
      "mxmImageMotionEnabled": true,
      "mxmImageMotion": "pan-left | pan-right | zoom-in | zoom-out（静图/配图默认开启，相邻段交替）",
      "mxmVideoMode": "仅 ai-video-gen 且 video：text-to-video | image-to-video | reference-to-video",
      "overlays": [
        {
          "kind": "text",
          "text": "关键词或短标题",
          "animationPreset": "fade | slide-up | pop | typewriter",
          "position": "top | center | bottom",
          "startOffsetSeconds": 0.3,
          "durationSeconds": 4
        }
      ],
      "transition": { "type": "crossfade", "durationSeconds": 0.5 },
      "keywords": ["..."],
      "on_topic_reason": "..."
    }
  ]
}
\`\`\`

## 规则
1. segments 时长之和 = \${audio_duration_seconds}s（误差 ≤1s）
2. mxmRenderMode 只能从 render_plan 白名单取值
3. **每个 ai-video-gen 段必须非空 mxmPrompt**（video=英文 Seedance；image=配图核心内容），全片 mxmVisualStyle 统一
4. **检索词先判定「本段核心实体」再造词**：先确定本段真正在讲的 1 个核心对象（**专有名词优先**：公司/品牌/人物/产品/技术/地点，如 \`Tesla\`、\`humanoid robot\`）；mxmStockSearchQuery = **英文 2–4 个词** = 核心实体 +（可选）1–2 个场景/动作名词，如 \`humanoid robot factory\`；**禁止**堆砌整句可视化词、禁止整句直译、禁止抽象/情绪词、禁止与主题无关的漂移词；keywords 第一个必须是核心实体，全为英文
5. 抽象概念/数据 → static-image + text overlay 或 mxmAiOutputKind=image；具体场景/动作 → ai-video-gen video
6. **每段画面与该段口播的核心实体强相关**，on_topic_reason 说明「本段核心实体是 X，故检索 X」；避免全片同一泛化检索词
7. 开场/收尾可加 overlays 标题卡（fade/pop），不要用独立「动画块」
8. 相邻段 transition 默认 crossfade 0.5s，章节切换可用 dipToBlack
9. 单镜 4–12 秒，最长 15 秒
10. **静图/AI配图默认开启 Ken Burns 动效**（mxmImageMotionEnabled=true）；相邻段交替 pan-left↔pan-right 或 zoom-in↔zoom-out，用户可在审核页关闭

为【\${topic}】生成 shot-list。
`.trim();
