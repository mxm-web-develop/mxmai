/**
 * 摄影 - 电影画面（cinematic）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PhotographParams } from '../../type';

export type CinematicOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 cinematic 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
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
