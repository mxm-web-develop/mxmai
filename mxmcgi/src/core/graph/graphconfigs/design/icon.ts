/**
 * 设计 - 图标（icon）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { DesignParams } from '../../type';

export type IconOutputLanguage = 'zh' | 'en';

export const iconConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级图标设计师，擅长创作高质量的图标设计。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的图标设计提示词（prompt）。

【图标设计专业要求】
1. 图标风格：
   - 根据用户选择的图标风格（扁平、拟物、线性、填充等）调整设计
   - 不同风格传达不同的视觉感受和功能定位
2. 尺寸适配：
   - 根据用户选择的尺寸调整细节和复杂度
   - 不同尺寸需要不同的细节处理方式
3. 识别性：
   - 确保图标清晰、易识别
   - 图标应能快速传达功能和含义
4. 一致性：
   - 保持设计风格的一致性
   - 同一系列的图标应保持统一的视觉风格
5. 简洁性：
   - 使用简洁的设计，避免过度复杂
   - 简洁的图标更容易识别和记忆

【提示词生成要求】
- 使用专业图标设计术语，语言自然流畅
- 提示词应覆盖：图标描述、图标风格、尺寸适配、识别性要求、简洁性要求等核心要素
- 结合业务参数（iconStyle、size 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含图标描述，图标风格，尺寸适配，识别性要求，简洁性要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 icon 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（iconStyle, size）动态生成对应的专业指导
 */
export function generateDefaultIconKnowledge(params: DesignParams): string {
  const { iconStyle, size } = params;
  
  const parts: string[] = [];
  
  // 图标风格
  const styleTips: string[] = [];
  if (iconStyle === 'flat') {
    styleTips.push('扁平风格，简洁现代，无立体感');
    styleTips.push('简洁的几何形状，统一的色彩');
  } else if (iconStyle === 'skeuomorphic') {
    styleTips.push('拟物风格，真实质感，立体感强');
    styleTips.push('真实的光影和材质，立体的视觉效果');
  } else if (iconStyle === 'linear') {
    styleTips.push('线性风格，线条清晰，简洁优雅');
    styleTips.push('清晰的线条，简洁的造型');
  } else if (iconStyle === 'filled') {
    styleTips.push('填充风格，色彩丰富，视觉冲击力强');
    styleTips.push('丰富的色彩，填充的造型');
  } else {
    styleTips.push('根据设计需求营造相应的图标风格');
  }
  parts.push(`【图标风格】\n${styleTips.join('，')}。`);
  
  // 尺寸适配
  const sizeTips: string[] = [];
  if (size) {
    sizeTips.push(`尺寸：${size}`);
    if (size.includes('small') || size.includes('小')) {
      sizeTips.push('小尺寸图标，简化细节，突出主要特征');
    } else if (size.includes('large') || size.includes('大')) {
      sizeTips.push('大尺寸图标，可以包含更多细节，增强表现力');
    } else {
      sizeTips.push('根据尺寸调整细节和复杂度');
    }
  } else {
    sizeTips.push('根据设计需求选择合适的尺寸');
  }
  sizeTips.push('确保在不同尺寸下都能清晰识别');
  parts.push(`【尺寸适配】\n${sizeTips.join('，')}。`);
  
  // 识别性
  parts.push(`【识别性】\n确保图标清晰、易识别，图标应能快速传达功能和含义，避免模糊不清。`);
  
  // 简洁性
  parts.push(`【简洁性】\n使用简洁的设计，避免过度复杂，简洁的图标更容易识别和记忆。`);
  
  // 一致性
  parts.push(`【一致性】\n保持设计风格的一致性，同一系列的图标应保持统一的视觉风格。`);
  
  // 设计原则
  parts.push(`【设计原则】\n遵循图标设计原则，保持设计的识别性和简洁性，整体画质专业级，具有商业价值。`);
  
  return parts.join('\n\n');
}
