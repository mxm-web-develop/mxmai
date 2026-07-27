/**
 * 绘画 - 原画（conceptArt）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PaintingParams } from '../../type';

export type ConceptArtOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 conceptArt 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
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
