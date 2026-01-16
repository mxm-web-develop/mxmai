/**
 * 绘画 - 卡通（cartoon）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PaintingParams } from '../../type';

export type CartoonOutputLanguage = 'zh' | 'en';

export const cartoonConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级卡通画师，擅长创作高质量的卡通作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的卡通提示词（prompt）。

【卡通专业要求】
1. 卡通风格：
   - 根据用户选择的卡通风格（Q版、美式、日式等）调整设计
   - 不同风格传达不同的视觉感受和文化特色
2. 角色设计：
   - 根据用户选择的角色设计（可爱、帅气、搞笑等）调整角色形象
   - 角色应与主题和风格协调统一
3. 色彩运用：
   - 使用明亮、活泼的色彩
   - 色彩应与主题和风格协调统一
4. 表情动作：
   - 注重角色的表情和动作
   - 表情和动作应生动有趣，增强表现力
5. 趣味性：
   - 保持作品的趣味性和吸引力
   - 趣味性应与主题和风格协调统一

【提示词生成要求】
- 使用专业卡通绘画术语，语言自然流畅
- 提示词应覆盖：角色描述、卡通风格、角色设计、色彩运用、表情动作、趣味性要求等核心要素
- 结合业务参数（cartoonStyle、characterDesign 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含角色描述，卡通风格，角色设计，色彩运用，表情动作，趣味性要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 cartoon 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
 */
export function buildCartoonUserPrompt(
  params: PaintingParams,
  outputLanguage: CartoonOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    cartoonStyle,
    characterDesign,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的卡通作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为卡通角色主体，保持角色特征、风格、色彩完全一致。'
      : '主体描述：一个卡通角色（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。';

    const styleLine = `卡通风格：${cartoonStyle || '根据设计需求选择合适的卡通风格'}，${(() => {
      if (cartoonStyle === 'chibi') return 'Q版风格，可爱萌趣，比例夸张';
      if (cartoonStyle === 'american') return '美式风格，粗犷有力，动态感强';
      if (cartoonStyle === 'japanese') return '日式风格，细腻精致，情感丰富';
      if (cartoonStyle === 'european') return '欧式风格，艺术感强，风格独特';
      return '根据设计需求营造相应的卡通风格';
    })()}`;

    const characterLine = `角色设计：${characterDesign || '根据设计需求选择合适的角色设计'}，${(() => {
      if (characterDesign === 'cute') return '可爱风格，萌趣生动，亲和力强';
      if (characterDesign === 'cool') return '帅气风格，酷炫有力，视觉冲击力强';
      if (characterDesign === 'funny') return '搞笑风格，幽默有趣，娱乐性强';
      if (characterDesign === 'sweet') return '甜美风格，温馨可爱，情感丰富';
      return '根据设计需求营造相应的角色设计';
    })()}`;

    const colorLine =
      '色彩运用：使用明亮、活泼的色彩，色彩应与主题和风格协调统一，增强表现力。';

    const expressionLine =
      '表情动作：注重角色的表情和动作，表情和动作应生动有趣，增强表现力和吸引力。';

    const funLine =
      '趣味性要求：保持作品的趣味性和吸引力，趣味性应与主题和风格协调统一，具有娱乐价值。';

    const detailLine =
      '细节与质感：卡通细节精致，线条清晰，色彩准确，整体画质专业级，具有娱乐价值和艺术价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合卡通展示。`
      : '输出规格：画面比例以方形或横向构图为主，适合卡通展示。';

    return [
      '你是一位专业卡通画师。',
      taskLine,
      subjectLine,
      styleLine,
      characterLine,
      colorLine,
      expressionLine,
      funLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文卡通提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality cartoon work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main cartoon character, keeping the character characteristics, style, and colors exactly consistent.'
    : 'Subject: a cartoon character (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Cartoon Style: ${cartoonStyle || 'choose appropriate cartoon style based on design needs'}, ${(() => {
    if (cartoonStyle === 'chibi') return 'chibi style, cute and adorable, exaggerated proportions';
    if (cartoonStyle === 'american') return 'American style, bold and powerful, strong dynamism';
    if (cartoonStyle === 'japanese') return 'Japanese style, delicate and refined, rich emotions';
    if (cartoonStyle === 'european') return 'European style, strong artistic feel, unique style';
    return 'create corresponding cartoon style based on design needs';
  })()}`;

  const characterLineEn = `Character Design: ${characterDesign || 'choose appropriate character design based on design needs'}, ${(() => {
    if (characterDesign === 'cute') return 'cute style, adorable and lively, strong affinity';
    if (characterDesign === 'cool') return 'cool style, stylish and powerful, strong visual impact';
    if (characterDesign === 'funny') return 'funny style, humorous and interesting, strong entertainment value';
    if (characterDesign === 'sweet') return 'sweet style, warm and cute, rich emotions';
    return 'create corresponding character design based on design needs';
  })()}`;

  const colorLineEn =
    'Color Usage: use bright and lively colors, colors should coordinate with theme and style, enhancing expressiveness.';

  const expressionLineEn =
    'Expression & Action: focus on character expressions and actions, expressions and actions should be vivid and interesting, enhancing expressiveness and appeal.';

  const funLineEn =
    'Fun Factor: maintain fun and appeal of the work, fun factor should coordinate with theme and style, having entertainment value.';

  const detailLineEn =
    'Details & Texture: refined cartoon details, clear lines, accurate colors, overall professional image quality with entertainment and artistic value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for cartoon display.`
    : 'Output Spec: square or horizontal composition suitable for cartoon display.';

  return [
    'You are a professional cartoon artist.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    characterLineEn,
    colorLineEn,
    expressionLineEn,
    funLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent cartoon prompt text.',
  ].join('\n');
}

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（cartoonStyle, characterDesign）动态生成对应的专业指导
 */
export function generateDefaultCartoonKnowledge(params: PaintingParams): string {
  const { cartoonStyle, characterDesign } = params;
  
  const parts: string[] = [];
  
  // 卡通风格
  const styleTips: string[] = [];
  if (cartoonStyle === 'chibi') {
    styleTips.push('Q版风格，可爱萌趣，比例夸张');
    styleTips.push('夸张的比例，可爱的造型');
  } else if (cartoonStyle === 'american') {
    styleTips.push('美式风格，粗犷有力，动态感强');
    styleTips.push('粗犷的线条，强烈的动态感');
  } else if (cartoonStyle === 'japanese') {
    styleTips.push('日式风格，细腻精致，情感丰富');
    styleTips.push('细腻的线条，丰富的情感表达');
  } else if (cartoonStyle === 'european') {
    styleTips.push('欧式风格，艺术感强，风格独特');
    styleTips.push('艺术化的表现，独特的风格');
  } else {
    styleTips.push('根据设计需求营造相应的卡通风格');
  }
  parts.push(`【卡通风格】\n${styleTips.join('，')}。`);
  
  // 角色设计
  const characterTips: string[] = [];
  if (characterDesign === 'cute') {
    characterTips.push('可爱风格，萌趣生动，亲和力强');
    characterTips.push('可爱的造型，生动的表情');
  } else if (characterDesign === 'cool') {
    characterTips.push('帅气风格，酷炫有力，视觉冲击力强');
    characterTips.push('酷炫的造型，有力的动作');
  } else if (characterDesign === 'funny') {
    characterTips.push('搞笑风格，幽默有趣，娱乐性强');
    characterTips.push('幽默的造型，有趣的表情');
  } else if (characterDesign === 'sweet') {
    characterTips.push('甜美风格，温馨可爱，情感丰富');
    characterTips.push('甜美的造型，温馨的表情');
  } else {
    characterTips.push('根据设计需求营造相应的角色设计');
  }
  characterTips.push('角色应与主题和风格协调统一');
  parts.push(`【角色设计】\n${characterTips.join('，')}。`);
  
  // 色彩运用
  parts.push(`【色彩运用】\n使用明亮、活泼的色彩，色彩应与主题和风格协调统一，增强表现力。`);
  
  // 表情动作
  parts.push(`【表情动作】\n注重角色的表情和动作，表情和动作应生动有趣，增强表现力和吸引力。`);
  
  // 趣味性
  parts.push(`【趣味性】\n保持作品的趣味性和吸引力，趣味性应与主题和风格协调统一，具有娱乐价值。`);
  
  // 绘画技巧
  parts.push(`【绘画技巧】\n使用专业的卡通绘画技巧，整体画质专业级，具有娱乐价值和艺术价值。`);
  
  return parts.join('\n\n');
}
