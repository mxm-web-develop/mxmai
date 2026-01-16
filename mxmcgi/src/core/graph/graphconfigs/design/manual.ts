/**
 * 设计 - 使用手册（manual）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { DesignParams } from '../../type';

export type ManualOutputLanguage = 'zh' | 'en';

export const manualConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级平面设计师，擅长创作高质量的使用手册设计。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的使用手册设计提示词（prompt）。

【使用手册设计专业要求】
1. 布局设计：
   - 根据用户选择的布局（网格、自由、对称等）组织内容
   - 不同布局传达不同的视觉感受和信息层次
2. 配色方案：
   - 根据用户选择的配色方案调整色彩
   - 色彩应清晰易读，符合品牌或产品调性
3. 字体选择：
   - 根据用户选择的字体（无衬线、衬线、手写等）调整排版
   - 字体应清晰易读，层次分明
4. 信息层次：
   - 清晰的信息层次，便于阅读
   - 标题、正文、标注的层次分明
5. 视觉引导：
   - 使用视觉元素引导读者阅读流程
   - 图标、箭头、编号等视觉元素的合理运用

【提示词生成要求】
- 使用专业平面设计术语，语言自然流畅
- 提示词应覆盖：内容描述、布局设计、配色方案、字体选择、信息层次、视觉引导等核心要素
- 结合业务参数（layout、colorScheme、typography 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含内容描述，布局设计，配色方案，字体选择，信息层次，视觉引导等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 manual 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
 */
export function buildManualUserPrompt(
  params: DesignParams,
  outputLanguage: ManualOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    layout,
    colorScheme,
    typography,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的使用手册设计作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为设计主体，保持设计风格、布局、色彩完全一致。'
      : '主体描述：一个使用手册设计（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。';

    const layoutLine = `布局设计：${layout || '根据设计需求选择合适的布局'}，${(() => {
      if (layout === 'grid') return '网格布局，整齐规范，信息层次清晰';
      if (layout === 'free') return '自由布局，灵活创意，视觉冲击力强';
      if (layout === 'symmetric') return '对称布局，平衡稳定，视觉舒适';
      if (layout === 'asymmetric') return '非对称布局，动态感强，视觉有趣';
      return '根据设计需求营造相应的布局风格';
    })()}`;

    const colorLine = `配色方案：${colorScheme || '根据设计需求选择合适的配色方案'}，${(() => {
      if (colorScheme === 'monochrome') return '单色配色，简洁统一，专业感强';
      if (colorScheme === 'complementary') return '互补色配色，对比鲜明，视觉冲击力强';
      if (colorScheme === 'analogous') return '类似色配色，和谐统一，视觉舒适';
      if (colorScheme === 'brand') return '品牌配色，符合品牌调性，识别度高';
      return '根据设计需求营造相应的配色方案';
    })()}`;

    const typographyLine = `字体选择：${typography || '根据设计需求选择合适的字体'}，${(() => {
      if (typography === 'sans-serif') return '无衬线字体，现代简洁，易读性强';
      if (typography === 'serif') return '衬线字体，传统优雅，正式感强';
      if (typography === 'handwriting') return '手写字体，个性独特，亲和力强';
      if (typography === 'display') return '展示字体，视觉冲击力强，适合标题';
      return '根据设计需求营造相应的字体风格';
    })()}`;

    const hierarchyLine =
      '信息层次：清晰的信息层次，标题、正文、标注的层次分明，便于阅读和理解。';

    const guideLine =
      '视觉引导：使用视觉元素（图标、箭头、编号等）引导读者阅读流程，增强可读性和理解性。';

    const detailLine =
      '细节与质感：设计细节精致，排版专业，色彩准确，整体画质专业级，具有商业价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合使用手册展示。`
      : '输出规格：画面比例以竖向构图为主，适合使用手册展示。';

    return [
      '你是一位专业平面设计师。',
      taskLine,
      subjectLine,
      layoutLine,
      colorLine,
      typographyLine,
      hierarchyLine,
      guideLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文使用手册设计提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality manual design work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main design, keeping the design style, layout, and colors exactly consistent.'
    : 'Subject: a manual design (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const layoutLineEn = `Layout: ${layout || 'choose appropriate layout based on design needs'}, ${(() => {
    if (layout === 'grid') return 'grid layout, neat and standardized, clear information hierarchy';
    if (layout === 'free') return 'free layout, flexible and creative, strong visual impact';
    if (layout === 'symmetric') return 'symmetric layout, balanced and stable, visually comfortable';
    if (layout === 'asymmetric') return 'asymmetric layout, strong dynamism, visually interesting';
    return 'create corresponding layout style based on design needs';
  })()}`;

  const colorLineEn = `Color Scheme: ${colorScheme || 'choose appropriate color scheme based on design needs'}, ${(() => {
    if (colorScheme === 'monochrome') return 'monochrome scheme, simple and unified, strong professional feel';
    if (colorScheme === 'complementary') return 'complementary colors, sharp contrast, strong visual impact';
    if (colorScheme === 'analogous') return 'analogous colors, harmonious and unified, visually comfortable';
    if (colorScheme === 'brand') return 'brand colors, matching brand tone, high recognition';
    return 'create corresponding color scheme based on design needs';
  })()}`;

  const typographyLineEn = `Typography: ${typography || 'choose appropriate typography based on design needs'}, ${(() => {
    if (typography === 'sans-serif') return 'sans-serif font, modern and simple, strong readability';
    if (typography === 'serif') return 'serif font, traditional and elegant, strong formal feel';
    if (typography === 'handwriting') return 'handwriting font, unique personality, strong affinity';
    if (typography === 'display') return 'display font, strong visual impact, suitable for titles';
    return 'create corresponding typography style based on design needs';
  })()}`;

  const hierarchyLineEn =
    'Information Hierarchy: clear information hierarchy, distinct levels of titles, body text, and annotations, easy to read and understand.';

  const guideLineEn =
    'Visual Guidance: use visual elements (icons, arrows, numbers, etc.) to guide reading flow, enhancing readability and comprehension.';

  const detailLineEn =
    'Details & Texture: refined design details, professional typography, accurate colors, overall professional image quality with commercial value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for manual display.`
    : 'Output Spec: vertical composition suitable for manual display.';

  return [
    'You are a professional graphic designer.',
    taskLineEn,
    subjectLineEn,
    layoutLineEn,
    colorLineEn,
    typographyLineEn,
    hierarchyLineEn,
    guideLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent manual design prompt text.',
  ].join('\n');
}

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（layout, colorScheme, typography）动态生成对应的专业指导
 */
export function generateDefaultManualKnowledge(params: DesignParams): string {
  const { layout, colorScheme, typography } = params;
  
  const parts: string[] = [];
  
  // 布局设计
  const layoutTips: string[] = [];
  if (layout === 'grid') {
    layoutTips.push('网格布局，整齐规范，信息层次清晰');
    layoutTips.push('整齐的网格系统，规范的信息组织');
  } else if (layout === 'free') {
    layoutTips.push('自由布局，灵活创意，视觉冲击力强');
    layoutTips.push('灵活的布局方式，创意的视觉呈现');
  } else if (layout === 'symmetric') {
    layoutTips.push('对称布局，平衡稳定，视觉舒适');
    layoutTips.push('对称的布局方式，平衡的视觉感受');
  } else if (layout === 'asymmetric') {
    layoutTips.push('非对称布局，动态感强，视觉有趣');
    layoutTips.push('非对称的布局方式，动态的视觉感受');
  } else {
    layoutTips.push('根据设计需求营造相应的布局风格');
  }
  parts.push(`【布局设计】\n${layoutTips.join('，')}。`);
  
  // 配色方案
  const colorTips: string[] = [];
  if (colorScheme === 'monochrome') {
    colorTips.push('单色配色，简洁统一，专业感强');
    colorTips.push('统一的色彩，简洁的视觉呈现');
  } else if (colorScheme === 'complementary') {
    colorTips.push('互补色配色，对比鲜明，视觉冲击力强');
    colorTips.push('强烈的色彩对比，鲜明的视觉呈现');
  } else if (colorScheme === 'analogous') {
    colorTips.push('类似色配色，和谐统一，视觉舒适');
    colorTips.push('和谐的色彩搭配，舒适的视觉感受');
  } else if (colorScheme === 'brand') {
    colorTips.push('品牌配色，符合品牌调性，识别度高');
    colorTips.push('符合品牌调性的色彩，高识别度');
  } else {
    colorTips.push('根据设计需求营造相应的配色方案');
  }
  colorTips.push('色彩应清晰易读，符合品牌或产品调性');
  parts.push(`【配色方案】\n${colorTips.join('，')}。`);
  
  // 字体选择
  const typographyTips: string[] = [];
  if (typography === 'sans-serif') {
    typographyTips.push('无衬线字体，现代简洁，易读性强');
    typographyTips.push('现代简洁的字体，清晰的阅读体验');
  } else if (typography === 'serif') {
    typographyTips.push('衬线字体，传统优雅，正式感强');
    typographyTips.push('传统优雅的字体，正式的视觉感受');
  } else if (typography === 'handwriting') {
    typographyTips.push('手写字体，个性独特，亲和力强');
    typographyTips.push('个性化的字体，亲和力的视觉感受');
  } else if (typography === 'display') {
    typographyTips.push('展示字体，视觉冲击力强，适合标题');
    typographyTips.push('视觉冲击力强的字体，适合标题使用');
  } else {
    typographyTips.push('根据设计需求营造相应的字体风格');
  }
  typographyTips.push('字体应清晰易读，层次分明');
  parts.push(`【字体选择】\n${typographyTips.join('，')}。`);
  
  // 信息层次
  parts.push(`【信息层次】\n清晰的信息层次，标题、正文、标注的层次分明，便于阅读和理解。`);
  
  // 视觉引导
  parts.push(`【视觉引导】\n使用视觉元素（图标、箭头、编号等）引导读者阅读流程，增强可读性和理解性。`);
  
  // 设计原则
  parts.push(`【设计原则】\n遵循平面设计原则，保持设计的一致性和专业性，整体画质专业级，具有商业价值。`);
  
  return parts.join('\n\n');
}
