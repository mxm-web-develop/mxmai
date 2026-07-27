/**
 * 设计 - 使用手册（manual）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { DesignParams } from '../../type';

export type ManualOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 manual 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
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
