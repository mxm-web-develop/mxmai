/**
 * 摄影 - 风景（landscape）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PhotographParams } from '../../type';

export type LandscapeOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 landscape 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildLandscapeUserPrompt(
  params: PhotographParams,
  outputLanguage: LandscapeOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    timeOfDay,
    weather,
    season,
    composition,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的风景摄影作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为场景主体，保持场景特征、光线氛围、色彩风格完全一致。'
      : '主体描述：一个风景场景（可根据用户需求和业务参数自动补全具体内容），整体氛围与用户需求和业务参数相匹配。';

    const timeLine = `时间与光线：${timeOfDay || '根据场景需求选择合适的时间'}，${(() => {
      if (timeOfDay === 'dawn') return '清晨柔和温暖的光线，营造宁静、希望的氛围';
      if (timeOfDay === 'noon') return '正午强烈明亮的光线，展现清晰、活力的场景';
      if (timeOfDay === 'dusk') return '黄昏金色温暖的光线，营造浪漫、温暖的氛围';
      if (timeOfDay === 'night') return '夜晚冷调神秘的光线，营造宁静、神秘的氛围';
      return '根据场景需求选择合适的光线';
    })()}`;

    const weatherLine = `天气与氛围：${weather || '根据场景需求选择合适的天气'}，${(() => {
      if (weather === 'sunny') return '晴天明亮清晰，阴影明显，对比度高';
      if (weather === 'cloudy') return '阴天柔和均匀，对比度低，氛围温和';
      if (weather === 'rainy') return '雨天湿润质感，氛围感强，色彩饱和';
      if (weather === 'snowy') return '雪天纯净明亮，冷调氛围，对比鲜明';
      return '根据场景需求营造相应的天气氛围';
    })()}`;

    const seasonLine = `季节与色彩：${season || '根据场景需求选择合适的季节'}，${(() => {
      if (season === 'spring') return '春季新绿、花朵、生机勃勃的色彩';
      if (season === 'summer') return '夏季浓绿、阳光、活力四射的色彩';
      if (season === 'autumn') return '秋季金黄、红叶、温暖丰富的色彩';
      if (season === 'winter') return '冬季雪白、冷调、宁静纯净的色彩';
      return '根据场景需求调整季节特征和色彩';
    })()}`;

    const compositionLine = `构图与视角：${composition || '使用经典风景构图（如三分法、引导线、前景中景背景层次）'}，主体清晰，层次分明，构图自然协调。`;

    const detailLine =
      '细节与质感：画面细节丰富，纹理清晰，色彩饱和度和对比度适中，整体画质专业级，具有视觉冲击力。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合风景展示。`
      : '输出规格：画面比例以横向构图为主，适合风景摄影展示。';

    return [
      '你是一位专业风景摄影师。',
      taskLine,
      subjectLine,
      timeLine,
      weatherLine,
      seasonLine,
      compositionLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文风景摄影提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality landscape photograph.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main scene, keeping the scene characteristics, lighting atmosphere, and color style exactly consistent.'
    : 'Subject: a landscape scene (specific content can be automatically completed based on user needs and business parameters), with overall atmosphere matching user needs and business parameters.';

  const timeLineEn = `Time & Lighting: ${timeOfDay || 'choose appropriate time based on scene needs'}, ${(() => {
    if (timeOfDay === 'dawn') return 'soft warm morning light, creating a peaceful, hopeful atmosphere';
    if (timeOfDay === 'noon') return 'strong bright noon light, showing clear, vibrant scenes';
    if (timeOfDay === 'dusk') return 'golden warm dusk light, creating a romantic, warm atmosphere';
    if (timeOfDay === 'night') return 'cool mysterious night light, creating a peaceful, mysterious atmosphere';
    return 'choose appropriate lighting based on scene needs';
  })()}`;

  const weatherLineEn = `Weather & Atmosphere: ${weather || 'choose appropriate weather based on scene needs'}, ${(() => {
    if (weather === 'sunny') return 'bright clear sunny day, obvious shadows, high contrast';
    if (weather === 'cloudy') return 'soft even cloudy day, low contrast, gentle atmosphere';
    if (weather === 'rainy') return 'moist rainy texture, strong atmosphere, saturated colors';
    if (weather === 'snowy') return 'pure bright snowy day, cool atmosphere, sharp contrast';
    return 'create corresponding weather atmosphere based on scene needs';
  })()}`;

  const seasonLineEn = `Season & Colors: ${season || 'choose appropriate season based on scene needs'}, ${(() => {
    if (season === 'spring') return 'fresh green, flowers, vibrant spring colors';
    if (season === 'summer') return 'rich green, sunlight, energetic summer colors';
    if (season === 'autumn') return 'golden, red leaves, warm rich autumn colors';
    if (season === 'winter') return 'snow white, cool tones, peaceful pure winter colors';
    return 'adjust seasonal characteristics and colors based on scene needs';
  })()}`;

  const compositionLineEn = `Composition & Perspective: ${composition || 'use classic landscape composition (e.g. rule of thirds, leading lines, foreground-middle-background layers)'}, clear subject, distinct layers, natural and harmonious composition.`;

  const detailLineEn =
    'Details & Texture: rich scene details, clear textures, moderate color saturation and contrast, overall professional image quality with visual impact.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for landscape display.`
    : 'Output Spec: horizontal composition suitable for landscape photography display.';

  return [
    'You are a professional landscape photographer.',
    taskLineEn,
    subjectLineEn,
    timeLineEn,
    weatherLineEn,
    seasonLineEn,
    compositionLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent landscape photography prompt text.',
  ].join('\n');
}
