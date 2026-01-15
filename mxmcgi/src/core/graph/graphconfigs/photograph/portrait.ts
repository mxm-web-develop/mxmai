/**
 * 摄影 - 人像（portrait）配置
 * 参考 writing/wtconfigs 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PhotographParams } from '../../type';

export type PortraitOutputLanguage = 'zh' | 'en';

export const portraitConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级人像摄影师，擅长创作高质量的人像摄影作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的人像摄影提示词（prompt）。

【人像摄影专业要求】
1. 构图与机位：
   - 遵循三分法、黄金分割等经典构图原则，突出人物主体
   - 根据需求选择合适的机位和视角（半身、全身、近景、远景等）
2. 光线与氛围：
   - 根据用户选择的光线类型（自然光、柔光、硬光、逆光等）营造氛围
   - 清晰描述主光、辅光及环境光的大致方向和强度
3. 背景与环境：
   - 根据 environment（如 indoor/outdoor）选择合适的场景与背景复杂度
   - 避免背景干扰主体，同时保留必要的环境信息
4. 表情与姿势：
   - 根据 pose、氛围和人物设定描述表情与身体姿态（自然、优雅、自信等）
5. 风格与色调：
   - 根据 style（现代、复古、时尚、极简等）和 tone（warm、cool、high contrast 等）统一整体调性与色彩风格
6. 妆容与细节：
   - 根据 makeup 描述妆容风格（自然、精致、浓妆、裸妆等）
   - 注意皮肤质感、面部轮廓、头发与服装细节
7. 参考摄影师：
   - 如果用户提供了参考摄影师或参考作品风格，请在提示词中自然融入（例如“in the style of …”），但避免逐字抄袭

【提示词生成要求】
- 使用专业摄影术语，语言自然流畅
- 提示词应覆盖：人物特征、姿势、表情、服装、环境、光线、构图、风格、色调、画质等核心要素
- 结合业务参数（style、tone、environment、makeup、pose、lighting 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `500字以内,要包含主体描述，场景与构图，光线与氛围，色彩与风格，细节与质感，摄影师风格参考等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 portrait 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
 */
export function buildPortraitUserPrompt(
  params: PhotographParams,
  outputLanguage: PortraitOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    style,
    tone,
    environment,
    makeup,
    pose,
    lighting,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的人像摄影作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为人物主体，保持脸部、五官、发型、身材完全一致。'
      : '主体描述：一位人物主体（性别、年龄感与气质可根据业务场景自动补全），整体气质与用户需求和业务参数相匹配。';

    const sceneLine = `场景与构图：${environment || '根据业务需求选择合适的室内或室外环境'}，使用经典人像构图（如三分法），主体清晰，背景虚化，构图自然协调。`;

    const lightingLine = `光线与氛围：${lighting || '使用柔和的人像光线'}，整体色调偏 ${
      tone || '自然肤色'
    }，营造高级、立体的光影氛围。`;

    const styleLine = `色彩与风格：整体风格偏 ${
      style || '现代时尚'
    }，画面色彩统一，避免杂色干扰，突出人物气质。`;

    const poseLine = `表情与姿势：根据场景与人物设定，安排自然优雅的姿势与表情（例如：轻微微笑、自然放松的身体姿态），避免僵硬。`;

    const detailLine =
      '细节与质感：皮肤保留自然纹理与合理修饰，衣服褶皱与材质质感真实可信，头发与眼神细节清晰，整体画质专业级。';

    const photographerLine =
      '摄影师风格参考：如用户提供了参考摄影师或作品，可在风格上向其靠拢（例如：像时尚杂志封面一样的高级感），但避免直接抄袭。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合人像主体展示。`
      : '输出规格：画面比例以中景人像竖构图为主，适合封面或海报用途。';

    return [
      '你是一位时尚杂志肖像摄影师。',
      taskLine,
      subjectLine,
      sceneLine,
      lightingLine,
      styleLine,
      poseLine,
      detailLine,
      photographerLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文人像摄影提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high‑quality portrait photograph.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main subject, keeping the face, facial features, hairstyle and body shape exactly consistent.'
    : 'Subject: a human portrait whose gender, age impression and temperament should match the business scenario and user intent.';

  const sceneLineEn = `Scene & Composition: ${
    environment || 'choose an appropriate indoor or outdoor setting'
  }, using classic portrait composition (e.g. rule of thirds), clear subject with softly blurred background.`;

  const lightingLineEn = `Lighting & Atmosphere: ${
    lighting || 'soft portrait lighting'
  }, overall color tone tends to ${tone || 'natural skin tone'}, creating a refined, dimensional mood.`;

  const styleLineEn = `Color & Style: overall style ${
    style || 'modern fashion'
  }, with unified color palette and no distracting colors, emphasizing the subject’s temperament.`;

  const poseLineEn =
    'Expression & Pose: natural, elegant poses and expressions that fit the scene (e.g. gentle smile, relaxed body posture), avoiding stiffness.';

  const detailLineEn =
    'Details & Texture: preserve natural skin texture with appropriate retouching, realistic clothing folds and fabric texture, clear hair and eye details, overall professional image quality.';

  const photographerLineEn =
    'Photographer Style Reference: if a reference photographer or work is provided, align the mood and style with it (e.g. like a fashion magazine cover) without directly copying.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for portrait display.`
    : 'Output Spec: vertical portrait composition suitable for cover or poster usage.';

  return [
    'You are a fashion magazine portrait photographer.',
    taskLineEn,
    subjectLineEn,
    sceneLineEn,
    lightingLineEn,
    styleLineEn,
    poseLineEn,
    detailLineEn,
    photographerLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent portrait photography prompt text.',
  ].join('\n');
}

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（style, tone, environment, makeup, pose, lighting）动态生成对应的专业指导
 */
export function generateDefaultPortraitKnowledge(params: PhotographParams): string {
  const { style, tone, environment, makeup, pose, lighting } = params;
  
  const parts: string[] = [];
  
  // 构图与机位
  const compositionTips: string[] = [];
  compositionTips.push('遵循三分法、黄金分割等经典构图原则，突出人物主体');
  if (pose === 'standing') {
    compositionTips.push('全身站立构图，注意人物与背景的比例关系');
  } else if (pose === 'sitting') {
    compositionTips.push('坐姿构图，注意人物姿态的自然与舒适');
  } else if (pose === 'close-up') {
    compositionTips.push('特写构图，突出面部表情和细节');
  } else if (pose === 'full-body') {
    compositionTips.push('全身构图，展现完整的人物形态');
  }
  parts.push(`【构图与机位】\n${compositionTips.join('，')}。`);
  
  // 光线与氛围
  const lightingTips: string[] = [];
  if (lighting === 'soft') {
    lightingTips.push('使用柔光，营造柔和、温暖的光影氛围');
  } else if (lighting === 'natural') {
    lightingTips.push('使用自然光，保持真实自然的光影效果');
  } else if (lighting === 'hard') {
    lightingTips.push('使用硬光，创造强烈的光影对比');
  } else if (lighting === 'rim') {
    lightingTips.push('使用轮廓光，突出人物边缘轮廓');
  } else if (lighting === 'backlight') {
    lightingTips.push('使用逆光，营造戏剧性的光影效果');
  } else if (lighting === 'studio') {
    lightingTips.push('使用影棚光，专业的三点布光系统');
  } else {
    lightingTips.push('使用专业人像光线，营造高级、立体的光影氛围');
  }
  
  if (tone === 'warm') {
    lightingTips.push('整体色调偏暖，营造温暖、舒适的氛围');
  } else if (tone === 'cool') {
    lightingTips.push('整体色调偏冷，营造清新、冷静的氛围');
  } else if (tone === 'high-contrast') {
    lightingTips.push('高对比度色调，增强画面的视觉冲击力');
  } else if (tone === 'muted') {
    lightingTips.push('柔和色调，营造温和、优雅的氛围');
  }
  parts.push(`【光线与氛围】\n${lightingTips.join('，')}。`);
  
  // 背景与环境
  const environmentTips: string[] = [];
  if (environment === 'indoor') {
    environmentTips.push('室内环境，选择简洁、不干扰主体的背景');
  } else if (environment === 'outdoor') {
    environmentTips.push('室外环境，利用自然背景，注意背景虚化');
  } else if (environment === 'studio') {
    environmentTips.push('影棚环境，使用纯色或渐变背景');
  } else if (environment === 'urban') {
    environmentTips.push('城市环境，利用建筑和街道作为背景');
  } else if (environment === 'natural') {
    environmentTips.push('自然环境，利用自然景观作为背景');
  } else {
    environmentTips.push('根据场景选择合适的背景，避免干扰主体');
  }
  environmentTips.push('背景虚化，突出人物主体');
  parts.push(`【背景与环境】\n${environmentTips.join('，')}。`);
  
  // 风格与色调
  const styleTips: string[] = [];
  if (style === 'modern') {
    styleTips.push('现代风格，简洁、时尚的视觉呈现');
  } else if (style === 'vintage') {
    styleTips.push('复古风格，怀旧、经典的视觉呈现');
  } else if (style === 'fashion') {
    styleTips.push('时尚风格，高级、前卫的视觉呈现');
  } else if (style === 'minimalist') {
    styleTips.push('极简风格，简洁、干净的视觉呈现');
  } else if (style === 'classic') {
    styleTips.push('经典风格，优雅、传统的视觉呈现');
  } else if (style === 'artistic') {
    styleTips.push('艺术风格，创意、独特的视觉呈现');
  } else {
    styleTips.push('专业人像风格，突出人物气质');
  }
  styleTips.push('画面色彩统一，避免杂色干扰');
  parts.push(`【风格与色调】\n${styleTips.join('，')}。`);
  
  // 表情与姿势
  const poseTips: string[] = [];
  if (pose === 'standing') {
    poseTips.push('站立姿势，自然、优雅的身体姿态');
  } else if (pose === 'sitting') {
    poseTips.push('坐姿，舒适、自然的身体姿态');
  } else if (pose === 'candid') {
    poseTips.push('抓拍风格，自然、真实的表情和姿态');
  } else if (pose === 'portrait') {
    poseTips.push('肖像风格，正式、专业的表情和姿态');
  } else {
    poseTips.push('自然优雅的姿势与表情');
  }
  poseTips.push('避免僵硬，保持自然放松');
  parts.push(`【表情与姿势】\n${poseTips.join('，')}。`);
  
  // 妆容与细节
  const makeupTips: string[] = [];
  if (makeup === 'natural') {
    makeupTips.push('自然妆容，保持真实自然的皮肤质感');
  } else if (makeup === 'light') {
    makeupTips.push('淡妆，轻微修饰，保持自然感');
  } else if (makeup === 'heavy') {
    makeupTips.push('浓妆，精致修饰，突出面部轮廓');
  } else if (makeup === 'editorial') {
    makeupTips.push('编辑妆，专业、精致的妆容风格');
  } else if (makeup === 'glamour') {
    makeupTips.push('魅力妆，突出女性魅力和气质');
  } else {
    makeupTips.push('专业妆容，突出人物气质');
  }
  makeupTips.push('皮肤保留自然纹理与合理修饰');
  makeupTips.push('衣服褶皱与材质质感真实可信');
  makeupTips.push('头发与眼神细节清晰');
  parts.push(`【妆容与细节】\n${makeupTips.join('，')}。`);
  
  // 镜头与画质
  parts.push(`【镜头与画质】\n使用85mm人像镜头，自然透视，浅景深效果好，整体画质专业级。`);
  
  return parts.join('\n\n');
}