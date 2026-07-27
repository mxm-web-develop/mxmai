/**
 * 摄影 - 产品商业拍摄（commercial）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PhotographParams } from '../../type';

export type CommercialOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 commercial 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildCommercialUserPrompt(
  params: PhotographParams,
  outputLanguage: CommercialOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    productType,
    background,
    props,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的产品商业拍摄作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为产品主体，保持产品特征、细节、质感完全一致。'
      : `主体描述：${productType || '一个产品'}（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。`;

    const backgroundLine = `背景环境：${background || '根据产品需求选择合适的背景'}，${(() => {
      if (background === 'simple') return '简约背景，纯色或渐变，突出产品主体';
      if (background === 'complex') return '复杂背景，丰富场景，增强画面层次';
      if (background === 'white') return '白色背景，专业商业拍摄，突出产品细节';
      if (background === 'gradient') return '渐变背景，柔和过渡，营造高级感';
      return '根据产品需求选择合适的背景，不干扰产品主体';
    })()}`;

    const propsLine = props
      ? `道具搭配：${props}，与产品风格一致，增强画面表现力。`
      : '道具搭配：根据产品需求适当添加道具，增强画面表现力，但不干扰产品主体。';

    const lightingLine =
      '光线设计：使用专业的产品拍摄光线，主光、辅光、轮廓光的合理运用，突出产品细节和质感，展现产品立体感。';

    const compositionLine =
      '构图方式：使用产品摄影的经典构图，突出产品主体，根据产品特点选择合适的构图方式，画面平衡协调。';

    const detailLine =
      '细节与质感：产品细节清晰，质感真实，色彩准确，符合商业标准，整体画质专业级，具有商业价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合产品展示。`
      : '输出规格：画面比例以方形或横向构图为主，适合产品商业拍摄展示。';

    return [
      '你是一位专业产品商业摄影师。',
      taskLine,
      subjectLine,
      backgroundLine,
      propsLine,
      lightingLine,
      compositionLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文产品商业拍摄提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality commercial product photograph.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main product, keeping the product characteristics, details, and texture exactly consistent.'
    : `Subject: ${productType || 'a product'} (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.`;

  const backgroundLineEn = `Background: ${background || 'choose appropriate background based on product needs'}, ${(() => {
    if (background === 'simple') return 'simple background, solid color or gradient, highlighting the product';
    if (background === 'complex') return 'complex background, rich scene, enhancing visual layers';
    if (background === 'white') return 'white background, professional commercial photography, highlighting product details';
    if (background === 'gradient') return 'gradient background, soft transition, creating premium feel';
    return 'choose appropriate background based on product needs, not interfering with the product';
  })()}`;

  const propsLineEn = props
    ? `Props: ${props}, consistent with product style, enhancing visual appeal.`
    : 'Props: add appropriate props based on product needs to enhance visual appeal, but not interfering with the product.';

  const lightingLineEn =
    'Lighting: use professional product photography lighting, proper use of key light, fill light, and rim light, highlighting product details and texture, showing product dimensionality.';

  const compositionLineEn =
    'Composition: use classic product photography composition, highlighting the product, choosing appropriate composition based on product characteristics, balanced and harmonious frame.';

  const detailLineEn =
    'Details & Texture: clear product details, realistic texture, accurate colors, meeting commercial standards, overall professional image quality with commercial value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for product display.`
    : 'Output Spec: square or horizontal composition suitable for commercial product photography display.';

  return [
    'You are a professional commercial product photographer.',
    taskLineEn,
    subjectLineEn,
    backgroundLineEn,
    propsLineEn,
    lightingLineEn,
    compositionLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent commercial product photography prompt text.',
  ].join('\n');
}
