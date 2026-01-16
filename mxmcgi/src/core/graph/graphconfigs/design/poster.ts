/**
 * 设计 - 画报（poster）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { DesignParams } from '../../type';

export type PosterOutputLanguage = 'zh' | 'en';

export const posterConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级画报设计师，擅长创作高质量的画报设计作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的画报设计提示词（prompt）。

【画报设计专业要求】
1. 艺术风格：
   - 根据用户选择的艺术风格（复古、现代、抽象、极简等）调整设计
   - 不同风格传达不同的视觉感受和情感
2. 主题表达：
   - 根据用户选择的主题调整整体调性
   - 主题应与设计风格和视觉元素协调统一
3. 视觉冲击力：
   - 使用强烈的视觉元素，吸引注意力
   - 通过色彩、构图、字体等手段增强视觉冲击力
4. 色彩运用：
   - 使用大胆的色彩搭配，增强表现力
   - 色彩应与主题和风格协调统一
5. 排版设计：
   - 使用创意的排版方式，突出主题
   - 文字与图像的合理结合，增强表现力

【提示词生成要求】
- 使用专业画报设计术语，语言自然流畅
- 提示词应覆盖：主题描述、艺术风格、视觉元素、色彩运用、排版设计、视觉冲击力等核心要素
- 结合业务参数（artStyle、theme 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含主题描述，艺术风格，视觉元素，色彩运用，排版设计，视觉冲击力等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 poster 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（artStyle, theme）动态生成对应的专业指导
 */
export function generateDefaultPosterKnowledge(params: DesignParams): string {
  const { artStyle, theme } = params;
  
  const parts: string[] = [];
  
  // 艺术风格
  const styleTips: string[] = [];
  if (artStyle === 'vintage') {
    styleTips.push('复古风格，怀旧经典，温暖色调');
    styleTips.push('怀旧的视觉元素，经典的色彩搭配');
  } else if (artStyle === 'modern') {
    styleTips.push('现代风格，简洁时尚，强烈对比');
    styleTips.push('简洁的视觉元素，时尚的色彩搭配');
  } else if (artStyle === 'abstract') {
    styleTips.push('抽象风格，艺术化，创意独特');
    styleTips.push('抽象化的视觉元素，艺术化的表现');
  } else if (artStyle === 'minimalist') {
    styleTips.push('极简风格，简洁干净，留白丰富');
    styleTips.push('简洁的视觉元素，丰富的留白');
  } else {
    styleTips.push('根据设计需求营造相应的艺术风格');
  }
  parts.push(`【艺术风格】\n${styleTips.join('，')}。`);
  
  // 主题表达
  const themeTips: string[] = [];
  if (theme) {
    themeTips.push(`主题：${theme}`);
    themeTips.push('主题应与设计风格和视觉元素协调统一');
  } else {
    themeTips.push('根据设计需求选择合适的主题');
    themeTips.push('主题应与设计风格和视觉元素协调统一');
  }
  parts.push(`【主题表达】\n${themeTips.join('，')}。`);
  
  // 视觉冲击力
  parts.push(`【视觉冲击力】\n使用强烈的视觉元素，通过色彩、构图、字体等手段吸引注意力，增强视觉冲击力。`);
  
  // 色彩运用
  parts.push(`【色彩运用】\n使用大胆的色彩搭配，增强表现力，色彩应与主题和风格协调统一，避免杂乱。`);
  
  // 排版设计
  parts.push(`【排版设计】\n使用创意的排版方式，突出主题，文字与图像的合理结合，增强表现力。`);
  
  // 设计原则
  parts.push(`【设计原则】\n遵循画报设计原则，保持设计的视觉冲击力和表现力，整体画质专业级，具有强烈的视觉吸引力。`);
  
  return parts.join('\n\n');
}
