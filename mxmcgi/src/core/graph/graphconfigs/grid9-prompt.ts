/**
 * 九宫格 Prompt 构建函数
 * 根据变体模式生成不同的 Prompt 描述
 */

import type { Grid9Purpose, Grid9Variant } from './grid9-variants';

/**
 * 构建九宫格 Prompt
 */
export function buildGrid9Prompt(
  basePrompt: string,
  params: any,
  variants: Grid9Variant[],
  outputLanguage: 'zh' | 'en',
  purpose?: Grid9Purpose
): string {
  // 强制使用英文，因为 Gemini 模型对英文 prompt 支持更好
  // 简化 prompt，使其更直接、更易理解
  // 注意：Gemini 可能无法完美生成九宫格，我们简化要求，主要依赖后续切割
  
  // 获取宽高比（支持 1:1、16:9、9:16）
  const aspectRatio = params.aspect_ratio || '1:1';
  let aspectDescription = 'square image';
  if (aspectRatio === '16:9') {
    aspectDescription = 'wide landscape image (16:9 aspect ratio)';
  } else if (aspectRatio === '9:16') {
    aspectDescription = 'tall portrait image (9:16 aspect ratio)';
  } else {
    aspectDescription = 'square image (1:1 aspect ratio)';
  }
  
  const resolvedPurpose: Grid9Purpose =
    purpose || params?.grid9Purpose || (variants?.[0]?.mode === 'sequence' ? 'storyboard' : variants?.[0]?.mode === 'variation' ? 'options' : 'variants');

  let prompt = `Create a ${aspectDescription} with a strict 3x3 grid layout. `;
  prompt += `Base description: "${basePrompt}". `;
  prompt += `Divide the image into 9 equal cells (3 rows x 3 columns). `;

  // 用途语义
  if (resolvedPurpose === 'options') {
    prompt += `Goal: produce 9 distinct options for the same brief (each cell is one option). `;
    prompt += `Make each option clearly different in style, composition, color, or layout, while staying on-brief. `;
  } else if (resolvedPurpose === 'storyboard') {
    prompt += `Goal: produce a coherent 9-panel storyboard sequence (each cell is one shot in order). `;
    prompt += `Maintain consistent characters, style, and scene continuity across all cells. `;
  } else if (resolvedPurpose === 'character') {
    prompt += `Goal: produce a character sheet with 9 angles/shots of the SAME character (each cell is one view). `;
    prompt += `Keep identity, face, hairstyle, outfit, and overall style consistent across all cells. Only change camera angle / distance / viewpoint. `;
  } else {
    // variants
    prompt += `Goal: produce 9 related variations of the same set (each cell is one variation). `;
    prompt += `Vary lens/angle/lighting/composition/shot details while keeping the subject and style consistent. `;
  }

  // 逐格描述（使用 variants）
  prompt += `Cell-by-cell requirements: `;
  variants.forEach((v, idx) => {
    const { row, col } = v.position;
    const pos = getPositionName(row, col, false);
    const cellLabel = `Cell ${idx + 1} (${pos})`;
    let desc = '';
    if (resolvedPurpose === 'storyboard') {
      desc = v.variations.sequenceDescription || `shot ${idx + 1}`;
    } else if (resolvedPurpose === 'options') {
      desc = buildVariationDescription(v.variations, false) || `distinct option ${idx + 1}`;
    } else if (resolvedPurpose === 'character') {
      desc = v.variations.characterShot || `different character view ${idx + 1}`;
    } else {
      desc = buildCombinationDescription(v.variations, false) || `variation ${idx + 1}`;
    }
    prompt += `${cellLabel}: ${desc}. `;
  });

  prompt += `**CRITICAL REQUIREMENTS FOR CELLS:** `;
  prompt += `1. NO borders, NO white edges, NO margins, NO gaps between cells. `;
  prompt += `2. Content must fill the entire cell area edge-to-edge with no empty spaces. `;
  prompt += `3. Each cell must be seamless and complete, with content extending to all edges. `;
  prompt += `4. Ensure cells are clearly separated visually but can be cropped independently without any white borders or edges. `;
  prompt += `5. The grid should appear as 9 complete, edge-to-edge images that can be perfectly cropped without any borders or margins.`;
  
  return prompt;
}

/**
 * 获取位置名称
 */
function getPositionName(row: number, col: number, isZh: boolean): string {
  const positions = [
    ['top-left', 'top-center', 'top-right'],
    ['middle-left', 'center', 'middle-right'],
    ['bottom-left', 'bottom-center', 'bottom-right'],
  ];
  
  const positionsZh = [
    ['左上角', '中上', '右上角'],
    ['左中', '中心', '右中'],
    ['左下角', '中下', '右下角'],
  ];
  
  if (isZh) {
    return positionsZh[row - 1][col - 1];
  } else {
    const pos = positions[row - 1][col - 1];
    if (pos === 'center') {
      return 'Center (Row 2, Column 2)';
    }
    return `${pos.charAt(0).toUpperCase() + pos.slice(1)} (Row ${row}, Column ${col})`;
  }
}

/**
 * 构建变体描述
 */
function buildVariationDescription(variations: any, isZh: boolean): string {
  const parts: string[] = [];
  
  if (variations.style) {
    parts.push(isZh ? `风格：${variations.style}` : `style: ${variations.style}`);
  }
  if (variations.colorScheme) {
    parts.push(isZh ? `配色：${variations.colorScheme}` : `color scheme: ${variations.colorScheme}`);
  }
  if (variations.colorPalette) {
    parts.push(isZh ? `色彩：${variations.colorPalette}` : `color palette: ${variations.colorPalette}`);
  }
  if (variations.layout) {
    parts.push(isZh ? `布局：${variations.layout}` : `layout: ${variations.layout}`);
  }
  if (variations.typography) {
    parts.push(isZh ? `字体：${variations.typography}` : `typography: ${variations.typography}`);
  }
  if (variations.perspective) {
    parts.push(isZh ? `视角：${variations.perspective}` : `perspective: ${variations.perspective}`);
  }
  if (variations.material) {
    parts.push(isZh ? `材质：${variations.material}` : `material: ${variations.material}`);
  }
  if (variations.lighting) {
    parts.push(isZh ? `光照：${variations.lighting}` : `lighting: ${variations.lighting}`);
  }
  if (variations.artStyle) {
    parts.push(isZh ? `艺术风格：${variations.artStyle}` : `art style: ${variations.artStyle}`);
  }
  if (variations.layoutStyle) {
    parts.push(isZh ? `布局风格：${variations.layoutStyle}` : `layout style: ${variations.layoutStyle}`);
  }
  if (variations.textStyle) {
    parts.push(isZh ? `文字样式：${variations.textStyle}` : `text style: ${variations.textStyle}`);
  }
  if (variations.visualEffects) {
    parts.push(isZh ? `视觉效果：${variations.visualEffects}` : `visual effects: ${variations.visualEffects}`);
  }
  if (variations.background) {
    parts.push(isZh ? `背景：${variations.background}` : `background: ${variations.background}`);
  }
  
  return parts.join(isZh ? '，' : ', ') || (isZh ? '标准配置' : 'standard configuration');
}

/**
 * 构建组合描述
 */
function buildCombinationDescription(variations: any, isZh: boolean): string {
  const parts: string[] = [];
  
  if (variations.lens) {
    parts.push(isZh ? `使用${variations.lens}镜头` : `using ${variations.lens} lens`);
  }
  if (variations.depthOfField) {
    parts.push(variations.depthOfField);
  }
  if (variations.angle) {
    parts.push(isZh ? `采用${variations.angle}角度` : `from ${variations.angle} angle`);
  }
  if (variations.composition) {
    parts.push(isZh ? `${variations.composition}构图` : `${variations.composition} composition`);
  }
  if (variations.lighting) {
    parts.push(isZh ? `${variations.lighting}光线` : `${variations.lighting}`);
  }
  if (variations.elements) {
    parts.push(variations.elements);
  }
  
  return parts.join(isZh ? '，' : ', ') || (isZh ? '标准配置' : 'standard configuration');
}
