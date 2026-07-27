/**
 * 设计 - 3D（3d）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { DesignParams } from '../../type';

export type Design3dOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 3d 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function build3dUserPrompt(
  params: DesignParams,
  outputLanguage: Design3dOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    modelStyle,
    material,
    lighting,
    perspective,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的3D设计作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为3D模型主体，保持模型特征、材质、风格完全一致。'
      : `主体描述：一个3D模型（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。`;

    const styleLine = `模型风格：${modelStyle || '根据设计需求选择合适的模型风格'}，${(() => {
      if (modelStyle === 'low-poly') return '低多边形风格，简洁几何，现代感强';
      if (modelStyle === 'realistic') return '写实风格，真实质感，细节丰富';
      if (modelStyle === 'cartoon') return '卡通风格，风格化，色彩丰富';
      if (modelStyle === 'abstract') return '抽象风格，艺术化，创意独特';
      return '根据设计需求营造相应的模型风格';
    })()}`;

    const materialLine = `材质表现：${material || '根据模型需求选择合适的材质'}，${(() => {
      if (material === 'metal') return '金属材质，高反射，金属质感，光泽明显';
      if (material === 'glass') return '玻璃材质，透明或半透明，折射效果，清晰质感';
      if (material === 'plastic') return '塑料材质，柔和反射，光滑或磨砂质感';
      if (material === 'wood') return '木材材质，自然纹理，温暖质感';
      return '根据模型需求营造相应的材质质感';
    })()}`;

    const lightingLine = `光照设计：${lighting || '使用专业的三点光照系统'}，主光、辅光、轮廓光的合理运用，突出模型细节，展现模型立体感。`;

    const perspectiveLine = `视角选择：${perspective || '根据模型需求选择合适的视角'}，${(() => {
      if (perspective === 'isometric') return '等轴测视角，无透视变形，适合技术展示';
      if (perspective === 'perspective') return '透视视角，真实感强，适合场景展示';
      if (perspective === 'orthographic') return '正交视角，无透视，适合技术图纸';
      return '根据模型需求选择合适的视角';
    })()}`;

    const detailLine =
      '细节与质感：模型细节丰富，纹理清晰，材质质感真实，整体画质专业级，具有3D设计感。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合3D设计展示。`
      : '输出规格：画面比例以方形或横向构图为主，适合3D设计展示。';

    return [
      '你是一位专业3D设计师。',
      taskLine,
      subjectLine,
      styleLine,
      materialLine,
      lightingLine,
      perspectiveLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文3D设计提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality 3D design work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main 3D model, keeping the model characteristics, material, and style exactly consistent.'
    : 'Subject: a 3D model (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Model Style: ${modelStyle || 'choose appropriate model style based on design needs'}, ${(() => {
    if (modelStyle === 'low-poly') return 'low-poly style, simple geometry, strong modern feel';
    if (modelStyle === 'realistic') return 'realistic style, authentic texture, rich details';
    if (modelStyle === 'cartoon') return 'cartoon style, stylized, rich colors';
    if (modelStyle === 'abstract') return 'abstract style, artistic, unique creativity';
    return 'create corresponding model style based on design needs';
  })()}`;

  const materialLineEn = `Material: ${material || 'choose appropriate material based on model needs'}, ${(() => {
    if (material === 'metal') return 'metal material, high reflection, metallic texture, obvious gloss';
    if (material === 'glass') return 'glass material, transparent or semi-transparent, refraction effect, clear texture';
    if (material === 'plastic') return 'plastic material, soft reflection, smooth or matte texture';
    if (material === 'wood') return 'wood material, natural texture, warm texture';
    return 'create corresponding material texture based on model needs';
  })()}`;

  const lightingLineEn = `Lighting: ${lighting || 'use professional three-point lighting system'}, proper use of key light, fill light, and rim light, highlighting model details, showing model dimensionality.`;

  const perspectiveLineEn = `Perspective: ${perspective || 'choose appropriate perspective based on model needs'}, ${(() => {
    if (perspective === 'isometric') return 'isometric perspective, no perspective distortion, suitable for technical display';
    if (perspective === 'perspective') return 'perspective view, strong realism, suitable for scene display';
    if (perspective === 'orthographic') return 'orthographic view, no perspective, suitable for technical drawings';
    return 'choose appropriate perspective based on model needs';
  })()}`;

  const detailLineEn =
    'Details & Texture: rich model details, clear textures, realistic material texture, overall professional image quality with 3D design feel.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for 3D design display.`
    : 'Output Spec: square or horizontal composition suitable for 3D design display.';

  return [
    'You are a professional 3D designer.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    materialLineEn,
    lightingLineEn,
    perspectiveLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent 3D design prompt text.',
  ].join('\n');
}
