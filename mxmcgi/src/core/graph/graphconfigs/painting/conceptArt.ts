/**
 * 绘画 - 原画（conceptArt）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PaintingParams } from '../../type';

export type ConceptArtOutputLanguage = 'zh' | 'en';

export const conceptArtConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级概念艺术家，擅长创作高质量的原画作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的原画提示词（prompt）。

【原画专业要求】
1. 概念艺术风格：
   - 根据用户选择的概念艺术风格（写实、风格化、科幻、奇幻等）调整设计
   - 不同风格传达不同的视觉感受和创意表达
2. 细节程度：
   - 根据用户选择的细节程度（高、中、低）调整画面复杂度
   - 细节应与整体风格和主题协调统一
3. 氛围营造：
   - 营造特定的氛围和情绪
   - 氛围应与主题和风格协调统一
4. 设计感：
   - 注重设计感和创意性
   - 设计应与主题和风格协调统一
5. 专业性：
   - 保持专业的概念艺术水准
   - 专业表现应与主题和风格协调统一

【提示词生成要求】
- 使用专业概念艺术术语，语言自然流畅
- 提示词应覆盖：主题描述、概念艺术风格、细节程度、氛围营造、设计感、专业性要求等核心要素
- 结合业务参数（conceptArtStyle、detailLevel 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含主题描述，概念艺术风格，细节程度，氛围营造，设计感，专业性要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 conceptArt 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
 */
export function buildConceptArtUserPrompt(
  params: PaintingParams,
  outputLanguage: ConceptArtOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    conceptArtStyle,
    detailLevel,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的原画作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为原画主体，保持原画特征、风格、细节完全一致。'
      : '主体描述：一个原画场景（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。';

    const styleLine = `概念艺术风格：${conceptArtStyle || '根据设计需求选择合适的概念艺术风格'}，${(() => {
      if (conceptArtStyle === 'realistic') return '写实风格，真实质感，细节丰富';
      if (conceptArtStyle === 'stylized') return '风格化，艺术感强，创意独特';
      if (conceptArtStyle === 'sci-fi') return '科幻风格，未来感强，科技感突出';
      if (conceptArtStyle === 'fantasy') return '奇幻风格，魔幻感强，想象力丰富';
      return '根据设计需求营造相应的概念艺术风格';
    })()}`;

    const detailLine = `细节程度：${detailLevel || '根据设计需求选择合适的细节程度'}，${(() => {
      if (detailLevel === 'high') return '高细节，画面丰富，质感精细';
      if (detailLevel === 'medium') return '中等细节，画面平衡，质感适中';
      if (detailLevel === 'low') return '低细节，画面简洁，重点突出';
      return '根据设计需求营造相应的细节程度';
    })()}`;

    const atmosphereLine =
      '氛围营造：营造特定的氛围和情绪，氛围应与主题和风格协调统一，增强表现力。';

    const designLine =
      '设计感：注重设计感和创意性，设计应与主题和风格协调统一，具有创意价值。';

    const professionalLine =
      '专业性要求：保持专业的概念艺术水准，专业表现应与主题和风格协调统一，具有专业价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合原画展示。`
      : '输出规格：画面比例以横向或方形构图为主，适合原画展示。';

    return [
      '你是一位专业概念艺术家。',
      taskLine,
      subjectLine,
      styleLine,
      detailLine,
      atmosphereLine,
      designLine,
      professionalLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文原画提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality concept art work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main concept art, keeping the concept art characteristics, style, and details exactly consistent.'
    : 'Subject: a concept art scene (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Concept Art Style: ${conceptArtStyle || 'choose appropriate concept art style based on design needs'}, ${(() => {
    if (conceptArtStyle === 'realistic') return 'realistic style, authentic texture, rich details';
    if (conceptArtStyle === 'stylized') return 'stylized, strong artistic feel, unique creativity';
    if (conceptArtStyle === 'sci-fi') return 'sci-fi style, strong futuristic feel, prominent technological sense';
    if (conceptArtStyle === 'fantasy') return 'fantasy style, strong magical feel, rich imagination';
    return 'create corresponding concept art style based on design needs';
  })()}`;

  const detailLineEn = `Detail Level: ${detailLevel || 'choose appropriate detail level based on design needs'}, ${(() => {
    if (detailLevel === 'high') return 'high detail, rich frame, fine texture';
    if (detailLevel === 'medium') return 'medium detail, balanced frame, moderate texture';
    if (detailLevel === 'low') return 'low detail, simple frame, highlighting key points';
    return 'create corresponding detail level based on design needs';
  })()}`;

  const atmosphereLineEn =
    'Atmosphere: create specific atmosphere and mood, atmosphere should coordinate with theme and style, enhancing expressiveness.';

  const designLineEn =
    'Design Sense: focus on design sense and creativity, design should coordinate with theme and style, having creative value.';

  const professionalLineEn =
    'Professional Quality: maintain professional concept art standards, professional expression should coordinate with theme and style, having professional value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for concept art display.`
    : 'Output Spec: horizontal or square composition suitable for concept art display.';

  return [
    'You are a professional concept artist.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    detailLineEn,
    atmosphereLineEn,
    designLineEn,
    professionalLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent concept art prompt text.',
  ].join('\n');
}

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（conceptArtStyle, detailLevel）动态生成对应的专业指导
 */
export function generateDefaultConceptArtKnowledge(params: PaintingParams): string {
  const { conceptArtStyle, detailLevel } = params;
  
  const parts: string[] = [];
  
  // 概念艺术风格
  const styleTips: string[] = [];
  if (conceptArtStyle === 'realistic') {
    styleTips.push('写实风格，真实质感，细节丰富');
    styleTips.push('真实的光影和材质，丰富的细节');
  } else if (conceptArtStyle === 'stylized') {
    styleTips.push('风格化，艺术感强，创意独特');
    styleTips.push('艺术化的表现，独特的风格');
  } else if (conceptArtStyle === 'sci-fi') {
    styleTips.push('科幻风格，未来感强，科技感突出');
    styleTips.push('未来感的视觉元素，科技感的材质');
  } else if (conceptArtStyle === 'fantasy') {
    styleTips.push('奇幻风格，魔幻感强，想象力丰富');
    styleTips.push('魔幻的视觉元素，丰富的想象力');
  } else {
    styleTips.push('根据设计需求营造相应的概念艺术风格');
  }
  parts.push(`【概念艺术风格】\n${styleTips.join('，')}。`);
  
  // 细节程度
  const detailTips: string[] = [];
  if (detailLevel === 'high') {
    detailTips.push('高细节，画面丰富，质感精细');
    detailTips.push('丰富的细节，精细的质感');
  } else if (detailLevel === 'medium') {
    detailTips.push('中等细节，画面平衡，质感适中');
    detailTips.push('平衡的细节，适中的质感');
  } else if (detailLevel === 'low') {
    detailTips.push('低细节，画面简洁，重点突出');
    detailTips.push('简洁的细节，突出的重点');
  } else {
    detailTips.push('根据设计需求营造相应的细节程度');
  }
  detailTips.push('细节应与整体风格和主题协调统一');
  parts.push(`【细节程度】\n${detailTips.join('，')}。`);
  
  // 氛围营造
  parts.push(`【氛围营造】\n营造特定的氛围和情绪，氛围应与主题和风格协调统一，增强表现力。`);
  
  // 设计感
  parts.push(`【设计感】\n注重设计感和创意性，设计应与主题和风格协调统一，具有创意价值。`);
  
  // 专业性
  parts.push(`【专业性】\n保持专业的概念艺术水准，专业表现应与主题和风格协调统一，具有专业价值。`);
  
  // 绘画技巧
  parts.push(`【绘画技巧】\n使用专业的概念艺术技巧，整体画质专业级，具有专业价值和艺术价值。`);
  
  return parts.join('\n\n');
}
