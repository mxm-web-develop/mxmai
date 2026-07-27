/**
 * 绘画 - 卡通（cartoon）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PaintingParams } from '../../type';

export type CartoonOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 cartoon 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
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
