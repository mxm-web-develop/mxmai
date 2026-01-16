/**
 * 摄影 - 风景（landscape）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PhotographParams } from '../../type';

export type LandscapeOutputLanguage = 'zh' | 'en';

export const landscapeConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级风景摄影师，擅长创作高质量的风景摄影作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的风景摄影提示词（prompt）。

【风景摄影专业要求】
1. 时间与光线：
   - 根据用户选择的时间（清晨、正午、黄昏、夜晚）调整光线方向和强度
   - 不同时间的光线特点：清晨柔和温暖、正午强烈明亮、黄昏金色温暖、夜晚冷调神秘
2. 天气与氛围：
   - 根据用户选择的天气（晴天、阴天、雨天、雪天等）营造相应的氛围
   - 晴天：明亮清晰，阴影明显；阴天：柔和均匀，对比度低；雨天：湿润质感，氛围感强
3. 季节与色彩：
   - 根据用户选择的季节调整色彩和植被状态
   - 春季：新绿、花朵、生机；夏季：浓绿、阳光、活力；秋季：金黄、红叶、温暖；冬季：雪白、冷调、宁静
4. 构图与视角：
   - 使用经典构图原则（三分法、引导线、前景中景背景层次等）
   - 根据 composition 参数选择合适的构图方式
5. 景深与焦点：
   - 合理控制景深，突出主体或营造层次感
   - 使用小光圈（f/8-f/16）获得大景深，或使用大光圈突出前景
6. 色彩与色调：
   - 根据时间和天气调整色彩饱和度、对比度
   - 保持画面色彩和谐统一

【提示词生成要求】
- 使用专业摄影术语，语言自然流畅
- 提示词应覆盖：场景描述、时间天气、季节特征、构图方式、光线氛围、色彩色调、画质要求等核心要素
- 结合业务参数（timeOfDay、weather、season、composition 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含场景描述，时间与光线，天气与氛围，季节与色彩，构图与视角，景深与焦点，色彩与色调等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 landscape 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（timeOfDay, weather, season, composition）动态生成对应的专业指导
 */
export function generateDefaultLandscapeKnowledge(params: PhotographParams): string {
  const { timeOfDay, weather, season, composition } = params;
  
  const parts: string[] = [];
  
  // 时间与光线
  const timeTips: string[] = [];
  if (timeOfDay === 'dawn') {
    timeTips.push('清晨柔和温暖的光线，营造宁静、希望的氛围');
    timeTips.push('低角度光线，长阴影，温暖色调');
  } else if (timeOfDay === 'noon') {
    timeTips.push('正午强烈明亮的光线，展现清晰、活力的场景');
    timeTips.push('高角度光线，短阴影，高对比度');
  } else if (timeOfDay === 'dusk') {
    timeTips.push('黄昏金色温暖的光线，营造浪漫、温暖的氛围');
    timeTips.push('低角度光线，金色色调，温暖氛围');
  } else if (timeOfDay === 'night') {
    timeTips.push('夜晚冷调神秘的光线，营造宁静、神秘的氛围');
    timeTips.push('低光环境，冷色调，神秘氛围');
  } else {
    timeTips.push('根据场景需求选择合适的时间，营造相应的光线氛围');
  }
  parts.push(`【时间与光线】\n${timeTips.join('，')}。`);
  
  // 天气与氛围
  const weatherTips: string[] = [];
  if (weather === 'sunny') {
    weatherTips.push('晴天明亮清晰，阴影明显，对比度高');
    weatherTips.push('色彩饱和，细节清晰');
  } else if (weather === 'cloudy') {
    weatherTips.push('阴天柔和均匀，对比度低，氛围温和');
    weatherTips.push('色彩柔和，细节丰富');
  } else if (weather === 'rainy') {
    weatherTips.push('雨天湿润质感，氛围感强，色彩饱和');
    weatherTips.push('反射光线，湿润质感');
  } else if (weather === 'snowy') {
    weatherTips.push('雪天纯净明亮，冷调氛围，对比鲜明');
    weatherTips.push('高亮度，冷色调');
  } else {
    weatherTips.push('根据场景需求营造相应的天气氛围');
  }
  parts.push(`【天气与氛围】\n${weatherTips.join('，')}。`);
  
  // 季节与色彩
  const seasonTips: string[] = [];
  if (season === 'spring') {
    seasonTips.push('春季新绿、花朵、生机勃勃的色彩');
    seasonTips.push('清新明亮，充满生机');
  } else if (season === 'summer') {
    seasonTips.push('夏季浓绿、阳光、活力四射的色彩');
    seasonTips.push('浓绿茂盛，阳光强烈');
  } else if (season === 'autumn') {
    seasonTips.push('秋季金黄、红叶、温暖丰富的色彩');
    seasonTips.push('金黄红色，温暖丰富');
  } else if (season === 'winter') {
    seasonTips.push('冬季雪白、冷调、宁静纯净的色彩');
    seasonTips.push('雪白冷调，宁静纯净');
  } else {
    seasonTips.push('根据场景需求调整季节特征和色彩');
  }
  parts.push(`【季节与色彩】\n${seasonTips.join('，')}。`);
  
  // 构图与视角
  const compositionTips: string[] = [];
  compositionTips.push('使用经典构图原则（三分法、引导线、前景中景背景层次）');
  if (composition === 'rule-of-thirds') {
    compositionTips.push('三分法构图，主体位于黄金分割点');
  } else if (composition === 'leading-lines') {
    compositionTips.push('引导线构图，利用线条引导视线');
  } else if (composition === 'symmetry') {
    compositionTips.push('对称构图，营造平衡感');
  } else if (composition === 'framing') {
    compositionTips.push('框架构图，利用前景框架突出主体');
  } else {
    compositionTips.push('根据场景选择合适的构图方式');
  }
  compositionTips.push('主体清晰，层次分明');
  parts.push(`【构图与视角】\n${compositionTips.join('，')}。`);
  
  // 景深与焦点
  parts.push(`【景深与焦点】\n使用小光圈（f/8-f/16）获得大景深，或使用大光圈突出前景，合理控制景深，突出主体或营造层次感。`);
  
  // 镜头与画质
  parts.push(`【镜头与画质】\n使用广角镜头（16-35mm）或标准镜头（24-70mm），自然透视，整体画质专业级，具有视觉冲击力。`);
  
  return parts.join('\n\n');
}
