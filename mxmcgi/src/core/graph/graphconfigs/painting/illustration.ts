/**
 * 绘画 - 插图（illustration）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PaintingParams } from '../../type';

export type IllustrationOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 illustration 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildIllustrationUserPrompt(
  params: PaintingParams,
  outputLanguage: IllustrationOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    illustrationStyle,
    colorPalette,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的插画作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为插画主体，保持插画特征、风格、色彩完全一致。'
      : '主体描述：一个插画场景（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。';

    const styleLine = `插图风格：${illustrationStyle || '根据设计需求选择合适的插图风格'}，${(() => {
      if (illustrationStyle === 'flat') return '扁平风格，简洁现代，色彩丰富';
      if (illustrationStyle === 'realistic') return '写实风格，真实质感，细节丰富';
      if (illustrationStyle === 'watercolor') return '水彩风格，柔和自然，艺术感强';
      if (illustrationStyle === 'digital') return '数字绘画风格，精细质感，现代感强';
      return '根据设计需求营造相应的插图风格';
    })()}`;

    const colorLine = `色彩搭配：${colorPalette || '根据设计需求选择合适的色彩搭配'}，${(() => {
      if (colorPalette === 'warm') return '温暖色调，温馨舒适，情感丰富';
      if (colorPalette === 'cool') return '冷色调，清新冷静，现代感强';
      if (colorPalette === 'high-saturation') return '高饱和色彩，视觉冲击力强，活力四射';
      if (colorPalette === 'low-saturation') return '低饱和色彩，柔和优雅，高级感强';
      return '根据设计需求营造相应的色彩搭配';
    })()}`;

    const compositionLine =
      '构图方式：使用创意的构图方式，突出主题，构图应服务于内容，增强表现力。';

    const detailLine =
      '细节表现：注重细节表现，确保画面质量，细节应与整体风格协调统一，整体画质专业级。';

    const artLine =
      '艺术性要求：保持作品的艺术性和表现力，艺术表现应与主题和风格协调统一，具有艺术价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合插画展示。`
      : '输出规格：画面比例以横向或方形构图为主，适合插画展示。';

    return [
      '你是一位专业插画师。',
      taskLine,
      subjectLine,
      styleLine,
      colorLine,
      compositionLine,
      detailLine,
      artLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文插画提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality illustration work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main illustration, keeping the illustration characteristics, style, and colors exactly consistent.'
    : 'Subject: an illustration scene (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Illustration Style: ${illustrationStyle || 'choose appropriate illustration style based on design needs'}, ${(() => {
    if (illustrationStyle === 'flat') return 'flat style, simple and modern, rich colors';
    if (illustrationStyle === 'realistic') return 'realistic style, authentic texture, rich details';
    if (illustrationStyle === 'watercolor') return 'watercolor style, soft and natural, strong artistic feel';
    if (illustrationStyle === 'digital') return 'digital painting style, fine texture, strong modern feel';
    return 'create corresponding illustration style based on design needs';
  })()}`;

  const colorLineEn = `Color Palette: ${colorPalette || 'choose appropriate color palette based on design needs'}, ${(() => {
    if (colorPalette === 'warm') return 'warm tones, warm and comfortable, rich emotions';
    if (colorPalette === 'cool') return 'cool tones, fresh and calm, strong modern feel';
    if (colorPalette === 'high-saturation') return 'high saturation colors, strong visual impact, energetic';
    if (colorPalette === 'low-saturation') return 'low saturation colors, soft and elegant, strong premium feel';
    return 'create corresponding color palette based on design needs';
  })()}`;

  const compositionLineEn =
    'Composition: use creative composition, highlighting theme, composition should serve content, enhancing expressiveness.';

  const detailLineEn =
    'Details: focus on detail expression, ensuring image quality, details should coordinate with overall style, overall professional image quality.';

  const artLineEn =
    'Artistic Quality: maintain artistic quality and expressiveness, artistic expression should coordinate with theme and style, having artistic value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for illustration display.`
    : 'Output Spec: horizontal or square composition suitable for illustration display.';

  return [
    'You are a professional illustrator.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    colorLineEn,
    compositionLineEn,
    detailLineEn,
    artLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent illustration prompt text.',
  ].join('\n');
}
