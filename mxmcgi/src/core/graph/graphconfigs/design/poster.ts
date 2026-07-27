/**
 * 设计 - 画报（poster）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { DesignParams } from '../../type';

export type PosterOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 poster 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildPosterUserPrompt(
  params: DesignParams,
  outputLanguage: PosterOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    artStyle,
    theme,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的画报设计作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为设计主体，保持设计风格、色彩、构图完全一致。'
      : `主体描述：一个画报设计（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。`;

    const styleLine = `艺术风格：${artStyle || '根据设计需求选择合适的艺术风格'}，${(() => {
      if (artStyle === 'vintage') return '复古风格，怀旧经典，温暖色调';
      if (artStyle === 'modern') return '现代风格，简洁时尚，强烈对比';
      if (artStyle === 'abstract') return '抽象风格，艺术化，创意独特';
      if (artStyle === 'minimalist') return '极简风格，简洁干净，留白丰富';
      return '根据设计需求营造相应的艺术风格';
    })()}`;

    const themeLine = theme
      ? `主题表达：${theme}，主题应与设计风格和视觉元素协调统一，增强表现力。`
      : '主题表达：根据设计需求选择合适的主题，主题应与设计风格和视觉元素协调统一。';

    const visualLine =
      '视觉冲击力：使用强烈的视觉元素，通过色彩、构图、字体等手段吸引注意力，增强视觉冲击力。';

    const colorLine =
      '色彩运用：使用大胆的色彩搭配，增强表现力，色彩应与主题和风格协调统一，避免杂乱。';

    const typographyLine =
      '排版设计：使用创意的排版方式，突出主题，文字与图像的合理结合，增强表现力。';

    const detailLine =
      '细节与质感：设计细节精致，视觉元素丰富，色彩饱和，整体画质专业级，具有强烈的视觉冲击力。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合画报展示。`
      : '输出规格：画面比例以竖向构图为主，适合画报展示。';

    return [
      '你是一位专业画报设计师。',
      taskLine,
      subjectLine,
      styleLine,
      themeLine,
      visualLine,
      colorLine,
      typographyLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文画报设计提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality poster design work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main design, keeping the design style, colors, and composition exactly consistent.'
    : 'Subject: a poster design (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Art Style: ${artStyle || 'choose appropriate art style based on design needs'}, ${(() => {
    if (artStyle === 'vintage') return 'vintage style, nostalgic and classic, warm tones';
    if (artStyle === 'modern') return 'modern style, simple and fashionable, strong contrast';
    if (artStyle === 'abstract') return 'abstract style, artistic, unique creativity';
    if (artStyle === 'minimalist') return 'minimalist style, simple and clean, rich white space';
    return 'create corresponding art style based on design needs';
  })()}`;

  const themeLineEn = theme
    ? `Theme: ${theme}, the theme should coordinate with design style and visual elements, enhancing expressiveness.`
    : 'Theme: choose appropriate theme based on design needs, the theme should coordinate with design style and visual elements.';

  const visualLineEn =
    'Visual Impact: use strong visual elements, attract attention through colors, composition, typography, etc., enhancing visual impact.';

  const colorLineEn =
    'Color Usage: use bold color combinations, enhancing expressiveness, colors should coordinate with theme and style, avoiding clutter.';

  const typographyLineEn =
    'Typography: use creative typography, highlighting theme, proper combination of text and images, enhancing expressiveness.';

  const detailLineEn =
    'Details & Texture: refined design details, rich visual elements, saturated colors, overall professional image quality with strong visual impact.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for poster display.`
    : 'Output Spec: vertical composition suitable for poster display.';

  return [
    'You are a professional poster designer.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    themeLineEn,
    visualLineEn,
    colorLineEn,
    typographyLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent poster design prompt text.',
  ].join('\n');
}
