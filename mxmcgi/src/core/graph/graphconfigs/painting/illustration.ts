/**
 * 绘画 - 插图（illustration）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PaintingParams } from '../../type';

export type IllustrationOutputLanguage = 'zh' | 'en';

export const illustrationConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级插画师，擅长创作高质量的插画作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的插画提示词（prompt）。

【插画专业要求】
1. 插图风格：
   - 根据用户选择的插图风格（扁平、写实、水彩、数字绘画等）调整设计
   - 不同风格传达不同的视觉感受和艺术表现
2. 色彩搭配：
   - 根据用户选择的色彩搭配（温暖、冷调、高饱和、低饱和等）调整色彩
   - 色彩应与主题和风格协调统一
3. 构图方式：
   - 使用创意的构图方式，突出主题
   - 构图应服务于内容，增强表现力
4. 细节表现：
   - 注重细节表现，确保画面质量
   - 细节应与整体风格协调统一
5. 艺术性：
   - 保持作品的艺术性和表现力
   - 艺术表现应与主题和风格协调统一

【提示词生成要求】
- 使用专业插画术语，语言自然流畅
- 提示词应覆盖：主题描述、插图风格、色彩搭配、构图方式、细节表现、艺术性要求等核心要素
- 结合业务参数（illustrationStyle、colorPalette 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含主题描述，插图风格，色彩搭配，构图方式，细节表现，艺术性要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 illustration 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（illustrationStyle, colorPalette）动态生成对应的专业指导
 */
export function generateDefaultIllustrationKnowledge(params: PaintingParams): string {
  const { illustrationStyle, colorPalette } = params;
  
  const parts: string[] = [];
  
  // 插图风格
  const styleTips: string[] = [];
  if (illustrationStyle === 'flat') {
    styleTips.push('扁平风格，简洁现代，色彩丰富');
    styleTips.push('简洁的几何形状，统一的色彩');
  } else if (illustrationStyle === 'realistic') {
    styleTips.push('写实风格，真实质感，细节丰富');
    styleTips.push('真实的光影和材质，丰富的细节');
  } else if (illustrationStyle === 'watercolor') {
    styleTips.push('水彩风格，柔和自然，艺术感强');
    styleTips.push('柔和的色彩过渡，自然的笔触');
  } else if (illustrationStyle === 'digital') {
    styleTips.push('数字绘画风格，精细质感，现代感强');
    styleTips.push('精细的笔触，现代的数字质感');
  } else {
    styleTips.push('根据设计需求营造相应的插图风格');
  }
  parts.push(`【插图风格】\n${styleTips.join('，')}。`);
  
  // 色彩搭配
  const colorTips: string[] = [];
  if (colorPalette === 'warm') {
    colorTips.push('温暖色调，温馨舒适，情感丰富');
    colorTips.push('温暖的色彩，舒适的氛围');
  } else if (colorPalette === 'cool') {
    colorTips.push('冷色调，清新冷静，现代感强');
    colorTips.push('清新的色彩，冷静的氛围');
  } else if (colorPalette === 'high-saturation') {
    colorTips.push('高饱和色彩，视觉冲击力强，活力四射');
    colorTips.push('鲜艳的色彩，强烈的视觉冲击');
  } else if (colorPalette === 'low-saturation') {
    colorTips.push('低饱和色彩，柔和优雅，高级感强');
    colorTips.push('柔和的色彩，优雅的氛围');
  } else {
    colorTips.push('根据设计需求营造相应的色彩搭配');
  }
  colorTips.push('色彩应与主题和风格协调统一');
  parts.push(`【色彩搭配】\n${colorTips.join('，')}。`);
  
  // 构图方式
  parts.push(`【构图方式】\n使用创意的构图方式，突出主题，构图应服务于内容，增强表现力。`);
  
  // 细节表现
  parts.push(`【细节表现】\n注重细节表现，确保画面质量，细节应与整体风格协调统一。`);
  
  // 艺术性
  parts.push(`【艺术性】\n保持作品的艺术性和表现力，艺术表现应与主题和风格协调统一，具有艺术价值。`);
  
  // 绘画技巧
  parts.push(`【绘画技巧】\n使用专业的插画技巧，整体画质专业级，具有艺术价值和视觉吸引力。`);
  
  return parts.join('\n\n');
}
