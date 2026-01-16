/**
 * 摄影 - 产品商业拍摄（commercial）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PhotographParams } from '../../type';

export type CommercialOutputLanguage = 'zh' | 'en';

export const commercialConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级产品商业摄影师，擅长创作高质量的产品商业拍摄作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的产品商业拍摄提示词（prompt）。

【产品商业拍摄专业要求】
1. 产品类型：
   - 根据用户选择的产品类型（电子产品、食品、服装、化妆品等）调整拍摄方式
   - 不同产品需要不同的展示重点和拍摄技巧
2. 背景选择：
   - 根据用户要求选择背景（简约、复杂、纯色、渐变等）
   - 背景不应干扰产品主体，突出产品特征
3. 道具搭配：
   - 根据用户要求添加或移除道具
   - 道具应与产品风格一致，增强画面表现力
4. 光线设计：
   - 使用专业的产品拍摄光线，突出产品细节和质感
   - 主光、辅光、轮廓光的合理运用，展现产品立体感
5. 构图方式：
   - 使用产品摄影的经典构图，突出产品主体
   - 根据产品特点选择合适的构图方式
6. 色彩准确：
   - 确保产品色彩准确，符合商业标准
   - 色彩还原真实，避免色偏

【提示词生成要求】
- 使用专业商业摄影术语，语言自然流畅
- 提示词应覆盖：产品描述、背景环境、道具搭配、光线设计、构图方式、色彩准确、画质要求等核心要素
- 结合业务参数（productType、background、props 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含产品描述，背景环境，道具搭配，光线设计，构图方式，色彩准确，画质要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 commercial 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（productType, background, props）动态生成对应的专业指导
 */
export function generateDefaultCommercialKnowledge(params: PhotographParams): string {
  const { productType, background, props } = params;
  
  const parts: string[] = [];
  
  // 产品类型
  const productTips: string[] = [];
  if (productType) {
    productTips.push(`产品类型：${productType}`);
    if (productType.includes('电子') || productType.includes('electronic')) {
      productTips.push('电子产品，注重科技感和现代感，突出产品细节和质感');
    } else if (productType.includes('食品') || productType.includes('food')) {
      productTips.push('食品，注重新鲜感和食欲感，突出色彩和质感');
    } else if (productType.includes('服装') || productType.includes('clothing')) {
      productTips.push('服装，注重质感和版型，突出细节和风格');
    } else if (productType.includes('化妆品') || productType.includes('cosmetic')) {
      productTips.push('化妆品，注重精致感和高级感，突出包装和质感');
    }
  } else {
    productTips.push('根据产品类型调整拍摄方式，突出产品特征');
  }
  parts.push(`【产品类型】\n${productTips.join('，')}。`);
  
  // 背景选择
  const backgroundTips: string[] = [];
  if (background === 'simple') {
    backgroundTips.push('简约背景，纯色或渐变，突出产品主体');
    backgroundTips.push('不干扰产品，保持画面简洁');
  } else if (background === 'complex') {
    backgroundTips.push('复杂背景，丰富场景，增强画面层次');
    backgroundTips.push('注意背景与产品的协调，不喧宾夺主');
  } else if (background === 'white') {
    backgroundTips.push('白色背景，专业商业拍摄，突出产品细节');
    backgroundTips.push('纯白背景，专业标准');
  } else if (background === 'gradient') {
    backgroundTips.push('渐变背景，柔和过渡，营造高级感');
    backgroundTips.push('色彩过渡自然，不干扰产品');
  } else {
    backgroundTips.push('根据产品需求选择合适的背景，不干扰产品主体');
  }
  parts.push(`【背景选择】\n${backgroundTips.join('，')}。`);
  
  // 道具搭配
  const propsTips: string[] = [];
  if (props) {
    propsTips.push(`道具：${props}`);
    propsTips.push('道具应与产品风格一致，增强画面表现力');
  } else {
    propsTips.push('根据产品需求适当添加道具，增强画面表现力');
    propsTips.push('道具不应干扰产品主体');
  }
  parts.push(`【道具搭配】\n${propsTips.join('，')}。`);
  
  // 光线设计
  parts.push(`【光线设计】\n使用专业的产品拍摄光线，主光、辅光、轮廓光的合理运用，突出产品细节和质感，展现产品立体感。`);
  
  // 构图方式
  parts.push(`【构图方式】\n使用产品摄影的经典构图，突出产品主体，根据产品特点选择合适的构图方式，画面平衡协调。`);
  
  // 色彩准确
  parts.push(`【色彩准确】\n确保产品色彩准确，符合商业标准，色彩还原真实，避免色偏。`);
  
  // 镜头与画质
  parts.push(`【镜头与画质】\n使用标准镜头（50mm）或微距镜头，自然透视，整体画质专业级，具有商业价值。`);
  
  return parts.join('\n\n');
}
