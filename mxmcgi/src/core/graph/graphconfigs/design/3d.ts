/**
 * 设计 - 3D（3d）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { DesignParams } from '../../type';

export type Design3dOutputLanguage = 'zh' | 'en';

export const design3dConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级3D设计师，擅长创作高质量的3D设计作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的3D设计提示词（prompt）。

【3D设计专业要求】
1. 模型风格：
   - 根据用户选择的模型风格（低多边形、写实、卡通、抽象等）调整设计
   - 不同风格的特点：低多边形（简洁几何）、写实（真实质感）、卡通（风格化）、抽象（艺术化）
2. 材质表现：
   - 根据用户选择的材质（金属、玻璃、塑料、木材等）调整质感
   - 不同材质需要不同的反射、折射、粗糙度等属性
3. 光照设计：
   - 使用专业的三点光照或环境光照，突出模型细节
   - 主光、辅光、轮廓光的合理运用，展现模型立体感
4. 视角选择：
   - 根据用户选择的视角（等轴测、透视、正交等）调整构图
   - 不同视角传达不同的视觉感受
5. 细节表现：
   - 注重模型的细节表现，确保质量
   - 纹理、贴图、细节的合理运用

【提示词生成要求】
- 使用专业3D设计术语，语言自然流畅
- 提示词应覆盖：模型描述、模型风格、材质表现、光照设计、视角选择、细节表现等核心要素
- 结合业务参数（modelStyle、material、lighting、perspective 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含模型描述，模型风格，材质表现，光照设计，视角选择，细节表现等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 3d 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（modelStyle, material, lighting, perspective）动态生成对应的专业指导
 */
export function generateDefault3dKnowledge(params: DesignParams): string {
  const { modelStyle, material, lighting, perspective } = params;
  
  const parts: string[] = [];
  
  // 模型风格
  const styleTips: string[] = [];
  if (modelStyle === 'low-poly') {
    styleTips.push('低多边形风格，简洁几何，现代感强');
    styleTips.push('简洁的几何形状，清晰的边缘');
  } else if (modelStyle === 'realistic') {
    styleTips.push('写实风格，真实质感，细节丰富');
    styleTips.push('真实的光影和材质，丰富的细节');
  } else if (modelStyle === 'cartoon') {
    styleTips.push('卡通风格，风格化，色彩丰富');
    styleTips.push('风格化的造型，丰富的色彩');
  } else if (modelStyle === 'abstract') {
    styleTips.push('抽象风格，艺术化，创意独特');
    styleTips.push('抽象化的造型，艺术化的表现');
  } else {
    styleTips.push('根据设计需求营造相应的模型风格');
  }
  parts.push(`【模型风格】\n${styleTips.join('，')}。`);
  
  // 材质表现
  const materialTips: string[] = [];
  if (material === 'metal') {
    materialTips.push('金属材质，高反射，金属质感，光泽明显');
    materialTips.push('高反射率，金属光泽，质感真实');
  } else if (material === 'glass') {
    materialTips.push('玻璃材质，透明或半透明，折射效果，清晰质感');
    materialTips.push('透明或半透明，折射和反射效果');
  } else if (material === 'plastic') {
    materialTips.push('塑料材质，柔和反射，光滑或磨砂质感');
    materialTips.push('柔和反射，光滑或磨砂表面');
  } else if (material === 'wood') {
    materialTips.push('木材材质，自然纹理，温暖质感');
    materialTips.push('自然纹理，温暖质感，细节丰富');
  } else {
    materialTips.push('根据模型需求营造相应的材质质感');
  }
  parts.push(`【材质表现】\n${materialTips.join('，')}。`);
  
  // 光照设计
  const lightingTips: string[] = [];
  lightingTips.push('使用专业的三点光照系统');
  if (lighting === 'three-point') {
    lightingTips.push('三点光照，主光、辅光、轮廓光的合理运用');
  } else if (lighting === 'environment') {
    lightingTips.push('环境光照，柔和均匀，适合产品展示');
  } else if (lighting === 'dramatic') {
    lightingTips.push('戏剧性光照，强烈对比，增强视觉冲击力');
  } else {
    lightingTips.push('根据模型需求选择合适的光照方式');
  }
  lightingTips.push('突出模型细节，展现模型立体感');
  parts.push(`【光照设计】\n${lightingTips.join('，')}。`);
  
  // 视角选择
  const perspectiveTips: string[] = [];
  if (perspective === 'isometric') {
    perspectiveTips.push('等轴测视角，无透视变形，适合技术展示');
  } else if (perspective === 'perspective') {
    perspectiveTips.push('透视视角，真实感强，适合场景展示');
  } else if (perspective === 'orthographic') {
    perspectiveTips.push('正交视角，无透视，适合技术图纸');
  } else {
    perspectiveTips.push('根据模型需求选择合适的视角');
  }
  parts.push(`【视角选择】\n${perspectiveTips.join('，')}。`);
  
  // 细节表现
  parts.push(`【细节表现】\n注重模型的细节表现，纹理、贴图、细节的合理运用，确保质量。`);
  
  // 渲染与画质
  parts.push(`【渲染与画质】\n使用专业3D渲染，整体画质专业级，具有3D设计感和视觉冲击力。`);
  
  return parts.join('\n\n');
}
