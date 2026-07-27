/**
 * 设计 - 图标（icon）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { DesignParams } from '../../type';

export type IconOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 icon 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildIconUserPrompt(
  params: DesignParams,
  outputLanguage: IconOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    iconStyle,
    size,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的图标设计作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为图标主体，保持图标特征、风格、细节完全一致。'
      : '主体描述：一个图标设计（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。';

    const styleLine = `图标风格：${iconStyle || '根据设计需求选择合适的图标风格'}，${(() => {
      if (iconStyle === 'flat') return '扁平风格，简洁现代，无立体感';
      if (iconStyle === 'skeuomorphic') return '拟物风格，真实质感，立体感强';
      if (iconStyle === 'linear') return '线性风格，线条清晰，简洁优雅';
      if (iconStyle === 'filled') return '填充风格，色彩丰富，视觉冲击力强';
      return '根据设计需求营造相应的图标风格';
    })()}`;

    const sizeLine = size
      ? `尺寸适配：${size}，根据尺寸调整细节和复杂度，确保在不同尺寸下都能清晰识别。`
      : '尺寸适配：根据设计需求选择合适的尺寸，确保在不同尺寸下都能清晰识别。';

    const recognitionLine =
      '识别性要求：确保图标清晰、易识别，图标应能快速传达功能和含义，避免模糊不清。';

    const simplicityLine =
      '简洁性要求：使用简洁的设计，避免过度复杂，简洁的图标更容易识别和记忆。';

    const consistencyLine =
      '一致性要求：保持设计风格的一致性，同一系列的图标应保持统一的视觉风格。';

    const detailLine =
      '细节与质感：图标细节精致，边缘清晰，色彩准确，整体画质专业级，具有商业价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合图标展示。`
      : '输出规格：画面比例以方形构图为主，适合图标展示。';

    return [
      '你是一位专业图标设计师。',
      taskLine,
      subjectLine,
      styleLine,
      sizeLine,
      recognitionLine,
      simplicityLine,
      consistencyLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文图标设计提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality icon design work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main icon, keeping the icon characteristics, style, and details exactly consistent.'
    : 'Subject: an icon design (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Icon Style: ${iconStyle || 'choose appropriate icon style based on design needs'}, ${(() => {
    if (iconStyle === 'flat') return 'flat style, simple and modern, no dimensionality';
    if (iconStyle === 'skeuomorphic') return 'skeuomorphic style, realistic texture, strong dimensionality';
    if (iconStyle === 'linear') return 'linear style, clear lines, simple and elegant';
    if (iconStyle === 'filled') return 'filled style, rich colors, strong visual impact';
    return 'create corresponding icon style based on design needs';
  })()}`;

  const sizeLineEn = size
    ? `Size: ${size}, adjust details and complexity based on size, ensuring clear recognition at different sizes.`
    : 'Size: choose appropriate size based on design needs, ensuring clear recognition at different sizes.';

  const recognitionLineEn =
    'Recognition: ensure the icon is clear and easily recognizable, the icon should quickly convey function and meaning, avoiding ambiguity.';

  const simplicityLineEn =
    'Simplicity: use simple design, avoid excessive complexity, simple icons are easier to recognize and remember.';

  const consistencyLineEn =
    'Consistency: maintain design style consistency, icons in the same series should maintain unified visual style.';

  const detailLineEn =
    'Details & Texture: refined icon details, clear edges, accurate colors, overall professional image quality with commercial value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for icon display.`
    : 'Output Spec: square composition suitable for icon display.';

  return [
    'You are a professional icon designer.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    sizeLineEn,
    recognitionLineEn,
    simplicityLineEn,
    consistencyLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent icon design prompt text.',
  ].join('\n');
}
