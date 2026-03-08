/**
 * 摄影 - 电影画面（cinematic）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PhotographParams } from '../../type';

export type CinematicOutputLanguage = 'zh' | 'en';

export const cinematicConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级好莱坞电影摄影师，擅长创作具有真实电影摄影感的画面。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的电影画面提示词（prompt）。

【核心要求：真实电影摄影】
- **必须**：生成真实电影摄影风格，如同好莱坞大片的电影截图
- **必须**：使用真实摄影设备和技术（如 ARRI Alexa、RED、电影镜头、变形宽银幕镜头等）
- **禁止**：动画风格、漫画风格、卡通风格、插画风格
- **禁止**：任何非真实摄影的视觉风格

【电影画面专业要求】
1. 电影风格：
   - 根据用户选择的电影风格（赛博朋克、黑色电影、科幻、文艺等）调整整体调性
   - 不同风格的特点：赛博朋克（霓虹、未来感）、黑色电影（高对比、阴影）、科幻（宏大、科技感）、文艺（柔和、情感）
   - **强调**：所有风格都必须基于真实电影摄影，而非动画或漫画
2. 情绪氛围：
   - 根据用户选择的情绪（神秘、紧张、浪漫、悲伤等）营造相应氛围
   - 通过光线、色彩、构图等手段传达情绪
3. 拍摄角度：
   - 根据用户选择的拍摄角度（俯视、仰视、平视、倾斜等）调整构图
   - 不同角度传达不同的视觉感受和情绪
4. 色彩分级：
   - 使用电影级的色彩分级，营造特定氛围
   - 根据电影风格和情绪调整色彩倾向
5. 景深与焦点：
   - 使用浅景深突出主体，营造电影感
   - 焦点转换可以引导观众注意力
6. 光线设计：
   - 使用戏剧性的光线设计，增强画面表现力
   - 主光、辅光、轮廓光的合理运用
7. 摄影设备与技术：
   - 使用专业电影摄影设备（ARRI Alexa、RED、Sony Venice 等）
   - 使用电影镜头（35mm、50mm、85mm、变形宽银幕镜头等）
   - 自然透视、真实景深、电影级画质

【提示词生成要求】
- 使用专业电影摄影术语，语言自然流畅
- 提示词应覆盖：场景描述、电影风格、情绪氛围、拍摄角度、色彩分级、光线设计、景深控制等核心要素
- **必须强调**：photorealistic、Hollywood blockbuster cinematography、real film photography
- **必须禁止**：animated、cartoon、comic book、illustration style
- 结合业务参数（filmStyle、mood、cameraAngle 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含场景描述，电影风格，情绪氛围，拍摄角度，色彩分级，光线设计，景深控制等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 cinematic 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
 */
export function buildCinematicUserPrompt(
  params: PhotographParams,
  outputLanguage: CinematicOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    filmStyle,
    mood,
    cameraAngle,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张具有电影感的画面。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为场景主体，保持场景特征、光线氛围、色彩风格完全一致。'
      : '主体描述：一个电影场景（可根据用户需求和业务参数自动补全具体内容），整体氛围与用户需求和业务参数相匹配。';

    const styleLine = `电影风格：${filmStyle || '根据场景需求选择合适的电影风格'}，${(() => {
      if (filmStyle === 'cyberpunk') return '赛博朋克风格，霓虹灯光，未来感，高对比度';
      if (filmStyle === 'noir') return '黑色电影风格，高对比度，强烈阴影，黑白或低饱和度';
      if (filmStyle === 'sci-fi') return '科幻风格，宏大场景，科技感，冷色调';
      if (filmStyle === 'drama') return '文艺风格，柔和光线，情感丰富，温暖色调';
      return '根据场景需求营造相应的电影风格';
    })()}`;

    const moodLine = `情绪氛围：${mood || '根据场景需求营造相应的情绪氛围'}，${(() => {
      if (mood === 'mysterious') return '神秘氛围，低光环境，冷色调，营造悬念感';
      if (mood === 'tense') return '紧张氛围，强烈对比，动态构图，营造紧张感';
      if (mood === 'romantic') return '浪漫氛围，柔和光线，温暖色调，营造温馨感';
      if (mood === 'sad') return '悲伤氛围，低饱和度，冷色调，营造忧郁感';
      return '根据场景需求营造相应的情绪氛围';
    })()}`;

    const angleLine = `拍摄角度：${cameraAngle || '根据场景需求选择合适的拍摄角度'}，${(() => {
      if (cameraAngle === 'high-angle') return '俯视角度，营造压迫感或渺小感';
      if (cameraAngle === 'low-angle') return '仰视角度，营造崇高感或力量感';
      if (cameraAngle === 'dutch-angle') return '倾斜角度，营造不安感或动态感';
      if (cameraAngle === 'eye-level') return '平视角度，营造真实感或亲近感';
      return '根据场景需求选择合适的拍摄角度';
    })()}`;

    const detailLine =
      '细节与质感：画面细节丰富，色彩分级专业，景深控制精准，整体画质电影级，具有强烈的视觉冲击力和情绪感染力。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合电影画面展示。`
      : '输出规格：画面比例以宽屏横向构图为主（如 16:9 或 21:9），适合电影画面展示。';

    return [
      '你是一位专业电影摄影师。',
      taskLine,
      subjectLine,
      styleLine,
      moodLine,
      angleLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文电影画面提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a cinematic frame with film-like quality.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main scene, keeping the scene characteristics, lighting atmosphere, and color style exactly consistent.'
    : 'Subject: a cinematic scene (specific content can be automatically completed based on user needs and business parameters), with overall atmosphere matching user needs and business parameters.';

  const styleLineEn = `Film Style: ${filmStyle || 'choose appropriate film style based on scene needs'}, ${(() => {
    if (filmStyle === 'cyberpunk') return 'cyberpunk style, neon lights, futuristic, high contrast';
    if (filmStyle === 'noir') return 'film noir style, high contrast, strong shadows, black and white or low saturation';
    if (filmStyle === 'sci-fi') return 'sci-fi style, grand scenes, technological feel, cool tones';
    if (filmStyle === 'drama') return 'dramatic style, soft lighting, rich emotions, warm tones';
    return 'create corresponding film style based on scene needs';
  })()}`;

  const moodLineEn = `Mood & Atmosphere: ${mood || 'create appropriate mood based on scene needs'}, ${(() => {
    if (mood === 'mysterious') return 'mysterious atmosphere, low light, cool tones, creating suspense';
    if (mood === 'tense') return 'tense atmosphere, strong contrast, dynamic composition, creating tension';
    if (mood === 'romantic') return 'romantic atmosphere, soft lighting, warm tones, creating warmth';
    if (mood === 'sad') return 'sad atmosphere, low saturation, cool tones, creating melancholy';
    return 'create corresponding mood based on scene needs';
  })()}`;

  const angleLineEn = `Camera Angle: ${cameraAngle || 'choose appropriate camera angle based on scene needs'}, ${(() => {
    if (cameraAngle === 'high-angle') return 'high angle, creating oppression or smallness';
    if (cameraAngle === 'low-angle') return 'low angle, creating elevation or power';
    if (cameraAngle === 'dutch-angle') return 'dutch angle, creating unease or dynamism';
    if (cameraAngle === 'eye-level') return 'eye level, creating realism or intimacy';
    return 'choose appropriate camera angle based on scene needs';
  })()}`;

  const detailLineEn =
    'Details & Texture: photorealistic Hollywood blockbuster cinematography, shot with professional cinema cameras (ARRI Alexa, RED, Sony Venice), using cinema lenses (35mm, 50mm, 85mm, anamorphic), natural perspective, real depth of field, rich scene details, professional color grading, precise depth of field control, overall cinematic image quality with strong visual impact and emotional appeal. **CRITICAL: This must be real film photography, NOT animated, NOT cartoon, NOT comic book style, NOT illustration. It should look like a screenshot from a Hollywood blockbuster movie.**';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for cinematic display.`
    : 'Output Spec: widescreen horizontal composition (e.g. 16:9 or 21:9) suitable for cinematic display.';

  return [
    'You are a professional Hollywood cinematographer specializing in photorealistic film photography.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    moodLineEn,
    angleLineEn,
    detailLineEn,
    specLineEn,
    '**IMPORTANT**: The output must be photorealistic Hollywood blockbuster cinematography, shot with real cinema cameras and lenses. Do NOT use animated, cartoon, comic book, or illustration styles. It should look like a screenshot from a real Hollywood movie.',
    'Within about 300 English words, integrate the above elements into a single fluent cinematic prompt text.',
  ].join('\n');
}

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（filmStyle, mood, cameraAngle）动态生成对应的专业指导
 */
export function generateDefaultCinematicKnowledge(params: PhotographParams): string {
  const { filmStyle, mood, cameraAngle } = params;
  
  const parts: string[] = [];
  
  // 电影风格
  const styleTips: string[] = [];
  if (filmStyle === 'cyberpunk') {
    styleTips.push('赛博朋克风格，霓虹灯光，未来感，高对比度');
    styleTips.push('蓝紫色调，霓虹效果，科技感');
  } else if (filmStyle === 'noir') {
    styleTips.push('黑色电影风格，高对比度，强烈阴影，黑白或低饱和度');
    styleTips.push('黑白或低饱和度，强烈光影对比');
  } else if (filmStyle === 'sci-fi') {
    styleTips.push('科幻风格，宏大场景，科技感，冷色调');
    styleTips.push('冷色调，科技感，宏大场景');
  } else if (filmStyle === 'drama') {
    styleTips.push('文艺风格，柔和光线，情感丰富，温暖色调');
    styleTips.push('温暖色调，柔和光线，情感丰富');
  } else {
    styleTips.push('根据场景需求营造相应的电影风格');
  }
  parts.push(`【电影风格】\n${styleTips.join('，')}。`);
  
  // 情绪氛围
  const moodTips: string[] = [];
  if (mood === 'mysterious') {
    moodTips.push('神秘氛围，低光环境，冷色调，营造悬念感');
    moodTips.push('低光，冷色调，阴影丰富');
  } else if (mood === 'tense') {
    moodTips.push('紧张氛围，强烈对比，动态构图，营造紧张感');
    moodTips.push('高对比度，动态构图，强烈光影');
  } else if (mood === 'romantic') {
    moodTips.push('浪漫氛围，柔和光线，温暖色调，营造温馨感');
    moodTips.push('柔和光线，温暖色调，温馨氛围');
  } else if (mood === 'sad') {
    moodTips.push('悲伤氛围，低饱和度，冷色调，营造忧郁感');
    moodTips.push('低饱和度，冷色调，忧郁氛围');
  } else {
    moodTips.push('根据场景需求营造相应的情绪氛围');
  }
  parts.push(`【情绪氛围】\n${moodTips.join('，')}。`);
  
  // 拍摄角度
  const angleTips: string[] = [];
  angleTips.push('根据场景需求选择合适的拍摄角度');
  if (cameraAngle === 'high-angle') {
    angleTips.push('俯视角度，营造压迫感或渺小感');
  } else if (cameraAngle === 'low-angle') {
    angleTips.push('仰视角度，营造崇高感或力量感');
  } else if (cameraAngle === 'dutch-angle') {
    angleTips.push('倾斜角度，营造不安感或动态感');
  } else if (cameraAngle === 'eye-level') {
    angleTips.push('平视角度，营造真实感或亲近感');
  }
  parts.push(`【拍摄角度】\n${angleTips.join('，')}。`);
  
  // 色彩分级
  parts.push(`【色彩分级】\n使用电影级的色彩分级，根据电影风格和情绪调整色彩倾向，营造特定氛围。`);
  
  // 景深与焦点
  parts.push(`【景深与焦点】\n使用浅景深突出主体，营造电影感，焦点转换可以引导观众注意力。`);
  
  // 光线设计
  parts.push(`【光线设计】\n使用戏剧性的光线设计，主光、辅光、轮廓光的合理运用，增强画面表现力。`);
  
  // 镜头与画质
  parts.push(`【镜头与画质】\n使用电影镜头（如 35mm、50mm、85mm），自然透视，整体画质电影级，具有强烈的视觉冲击力和情绪感染力。`);
  
  return parts.join('\n\n');
}
