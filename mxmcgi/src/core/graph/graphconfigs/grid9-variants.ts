/**
 * 九宫格变体生成系统
 * 根据不同的类型和场景，动态生成不同的变体策略
 */

import type { PhotographParams, DesignParams, PaintingParams } from '../type';

export type Grid9Mode = 'variation' | 'sequence' | 'combination';

/** 多图用途：9方案 / 分镜 / 同set变体 / 角色画像多角度 */
export type Grid9Purpose = 'options' | 'storyboard' | 'variants' | 'character';

export interface Grid9Variant {
  cellIndex: number; // 0-8 (9个格子)
  position: { row: number; col: number }; // 位置 (1-3, 1-3)
  mode: Grid9Mode; // 变体模式
  variations: {
    // 摄影参数
    lens?: string;
    depthOfField?: string;
    angle?: string;
    composition?: string;
    lighting?: string;
    elements?: string;
    // 设计参数
    style?: string;
    colorScheme?: string;
    layout?: string;
    typography?: string;
    perspective?: string;
    material?: string;
    layoutStyle?: string;
    textStyle?: string;
    visualEffects?: string;
    background?: string;
    // 绘画参数
    artStyle?: string;
    colorPalette?: string;
    // 序列参数（sequence模式）
    sequenceIndex?: number;
    sequenceDescription?: string;
    narrativeRelation?: string;
    // 角色画像（character 模式）：该格子的景别+角度描述
    characterShot?: string; // e.g. "close-up front view", "full body side profile"
    [key: string]: any;
  };
}

/**
 * purpose 映射到内部 mode（用于生成变体）
 */
export function purposeToMode(purpose: Grid9Purpose): Grid9Mode {
  switch (purpose) {
    case 'options': return 'variation';
    case 'storyboard': return 'sequence';
    case 'variants':
    case 'character': return 'combination';
    default: return 'variation';
  }
}

/**
 * 按 (graphType, type) 返回默认的 grid9 用途
 */
export function getDefaultGrid9Purpose(
  graphType: 'photograph' | 'design' | 'painting',
  type: string
): Grid9Purpose {
  if (graphType === 'design') return 'options';
  if (graphType === 'painting') {
    if (type === 'comic') return 'storyboard';
    return 'options';
  }
  if (graphType === 'photograph') {
    if (type === 'cinematic' || type === 'documentary') return 'storyboard';
    if (type === 'commercial') return 'variants';
    if (type === 'portrait') return 'character'; // 人像默认角色画像多角度
    return 'variants';
  }
  return 'options';
}

/**
 * 根据类型自动选择变体模式
 */
export function getDefaultGrid9Mode(
  graphType: 'photograph' | 'design' | 'painting',
  type: string
): Grid9Mode {
  // 设计类型：默认 variation
  if (graphType === 'design') {
    return 'variation';
  }
  
  // 绘画类型
  if (graphType === 'painting') {
    if (type === 'comic') {
      return 'sequence'; // 漫画用序列模式
    }
    return 'variation';
  }
  
  // 摄影类型
  if (graphType === 'photograph') {
    if (type === 'cinematic' || type === 'documentary') {
      return 'sequence'; // 电影和纪事用序列模式
    }
    if (type === 'commercial') {
      return 'variation'; // 商业用变体模式
    }
    return 'combination'; // 其他用组合模式
  }
  
  return 'variation'; // 默认
}

/**
 * 生成 9 个变体配置
 * @param userPurpose 用户指定的用途（可选），未传时从 baseParams.grid9Purpose 或按 (graphType, type) 默认
 */
export function generateGrid9Variants(
  baseParams: PhotographParams | DesignParams | PaintingParams,
  graphType: 'photograph' | 'design' | 'painting',
  type: string,
  userMode?: Grid9Mode,
  userPurpose?: Grid9Purpose
): Grid9Variant[] {
  const purpose = userPurpose ?? (baseParams as any).grid9Purpose ?? getDefaultGrid9Purpose(graphType, type);
  if (purpose === 'character') {
    return generateCharacterAngleVariants();
  }
  const mode = userMode || (baseParams as any).grid9Mode || purposeToMode(purpose);
  if (mode === 'sequence') {
    return generateSequenceVariants(baseParams, graphType, type);
  } else if (mode === 'variation') {
    return generateVariationVariants(baseParams, graphType, type);
  } else {
    return generateCombinationVariants(baseParams, graphType, type);
  }
}

/**
 * 角色画像：9 宫格为同一角色的近/远、正/侧/背等多角度
 */
function generateCharacterAngleVariants(): Grid9Variant[] {
  const shots: string[] = [
    'close-up face, front view',
    'bust shot, front view',
    'half-body, front view',
    '3/4 view from left',
    'full body, front view',
    '3/4 view from right',
    'side profile',
    'back view',
    'low angle or overhead variation',
  ];
  const variants: Grid9Variant[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      variants.push({
        cellIndex,
        position: { row: row + 1, col: col + 1 },
        mode: 'combination',
        variations: { characterShot: shots[cellIndex] },
      });
    }
  }
  return variants;
}

/**
 * 生成序列模式变体（用于分镜、故事线等）
 */
function generateSequenceVariants(
  baseParams: any,
  graphType: string,
  type: string
): Grid9Variant[] {
  const variants: Grid9Variant[] = [];
  
  // 根据类型定义序列描述
  let sequenceDescriptions: string[] = [];
  
  if (type === 'cinematic') {
    // 电影分镜序列
    sequenceDescriptions = [
      'opening shot (establishing scene)',
      'character introduction',
      'rising action',
      'conflict setup',
      'climax moment',
      'resolution',
      'emotional moment',
      'transition scene',
      'closing shot'
    ];
  } else if (type === 'comic') {
    // 漫画分镜序列
    sequenceDescriptions = [
      'panel 1 (establishing)',
      'panel 2 (character reaction)',
      'panel 3 (action)',
      'panel 4 (consequence)',
      'panel 5 (climax)',
      'panel 6 (resolution)',
      'panel 7 (transition)',
      'panel 8 (next scene setup)',
      'panel 9 (closing)'
    ];
  } else if (type === 'documentary') {
    // 纪事事件序列
    sequenceDescriptions = [
      'event beginning',
      'initial development',
      'key moment 1',
      'escalation',
      'peak moment',
      'consequence',
      'aftermath',
      'reflection',
      'conclusion'
    ];
  } else {
    // 默认序列
    sequenceDescriptions = [
      'scene 1', 'scene 2', 'scene 3',
      'scene 4', 'scene 5', 'scene 6',
      'scene 7', 'scene 8', 'scene 9'
    ];
  }
  
  // 生成9个序列变体
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      const sequenceIndex = cellIndex;
      
      variants.push({
        cellIndex,
        position: { row: row + 1, col: col + 1 },
        mode: 'sequence',
        variations: {
          sequenceIndex,
          sequenceDescription: sequenceDescriptions[cellIndex],
          narrativeRelation: cellIndex === 0 
            ? 'opening' 
            : `follows from previous scene, leading to next`,
        },
      });
    }
  }
  
  return variants;
}

/**
 * 生成变体选择模式（用于设计、插画等）
 */
function generateVariationVariants(
  baseParams: any,
  graphType: string,
  type: string
): Grid9Variant[] {
  const variants: Grid9Variant[] = [];
  
  // 根据类型定义变体维度
  let variationDimensions: Record<string, string[]> = {};
  
  if (graphType === 'design') {
    if (type === 'illustration' || type === 'icon') {
      variationDimensions = {
        style: ['flat', 'realistic', 'watercolor', 'minimalist', 'vintage', 'modern', 'abstract', 'geometric', 'hand-drawn'],
        colorScheme: ['warm', 'cool', 'vibrant', 'muted', 'monochrome', 'pastel', 'high-contrast', 'gradient', 'earth-tone'],
        layout: ['centered', 'rule-of-thirds', 'asymmetric', 'symmetrical', 'diagonal', 'grid', 'flowing', 'minimal', 'complex'],
      };
    } else if (type === '3d') {
      variationDimensions = {
        perspective: ['isometric', 'perspective', 'orthographic', 'bird-eye', 'worm-eye', 'side-view', 'top-view', 'front-view', 'angled'],
        material: ['metal', 'glass', 'plastic', 'wood', 'fabric', 'ceramic', 'stone', 'neon', 'matte'],
        lighting: ['three-point', 'rim', 'ambient', 'dramatic', 'soft', 'hard', 'colored', 'natural', 'studio'],
      };
    } else if (type === 'poster') {
      variationDimensions = {
        artStyle: ['retro', 'modern', 'abstract', 'minimalist', 'vintage', 'futuristic', 'grunge', 'elegant', 'bold'],
        colorScheme: ['dark', 'light', 'colorful', 'monochrome', 'gradient', 'textured', 'geometric', 'organic', 'mixed'],
        layout: ['centered', 'asymmetric', 'grid', 'flowing', 'minimal', 'complex', 'layered', 'overlapping', 'sparse'],
      };
    } else if (type === 'manual') {
      variationDimensions = {
        layout: ['grid', 'free', 'symmetric', 'asymmetric', 'modular', 'hierarchical', 'minimal', 'complex', 'flowing'],
        colorScheme: ['monochrome', 'duotone', 'triadic', 'complementary', 'analogous', 'warm', 'cool', 'vibrant', 'muted'],
        typography: ['sans-serif', 'serif', 'handwritten', 'monospace', 'decorative', 'modern', 'classic', 'bold', 'light'],
      };
    } else if (type === 'coverImage') {
      variationDimensions = {
        layoutStyle: ['left-right', 'top-bottom', 'centered', 'asymmetric', 'grid', 'overlapping', 'minimal', 'complex', 'layered'],
        textStyle: ['bold', 'shadow', 'outline', 'gradient', 'minimal', 'decorative', 'modern', 'classic', 'artistic'],
        visualEffects: ['blur', 'gradient', 'overlay', 'texture', 'minimal', 'dramatic', 'subtle', 'bold', 'mixed'],
      };
    }
  } else if (graphType === 'painting') {
    if (type === 'illustration') {
      variationDimensions = {
        artStyle: ['flat', 'realistic', 'watercolor', 'digital', 'sketch', 'vector', 'mixed-media', 'stylized', 'photorealistic'],
        colorPalette: ['warm', 'cool', 'vibrant', 'muted', 'monochrome', 'pastel', 'high-saturation', 'earth-tone', 'neon'],
        layout: ['centered', 'rule-of-thirds', 'asymmetric', 'symmetrical', 'diagonal', 'flowing', 'minimal', 'complex', 'layered'],
      };
    } else if (type === 'conceptArt') {
      variationDimensions = {
        artStyle: ['realistic', 'stylized', 'sci-fi', 'fantasy', 'cyberpunk', 'steampunk', 'minimalist', 'detailed', 'atmospheric'],
        colorPalette: ['warm', 'cool', 'monochrome', 'vibrant', 'muted', 'high-contrast', 'gradient', 'earth-tone', 'neon'],
      };
    } else if (type === 'cartoon') {
      variationDimensions = {
        artStyle: ['cute', 'realistic', 'chibi', 'anime', 'western', 'minimalist', 'detailed', 'stylized', 'vintage'],
        colorPalette: ['bright', 'pastel', 'vibrant', 'muted', 'warm', 'cool', 'monochrome', 'gradient', 'earth-tone'],
      };
    }
  } else if (graphType === 'photograph' && type === 'commercial') {
    variationDimensions = {
      background: ['minimal', 'textured', 'gradient', 'pattern', 'natural', 'urban', 'studio', 'abstract', 'colorful'],
      lighting: ['natural', 'soft', 'dramatic', 'rim', 'backlight', 'side', 'studio', 'golden-hour', 'blue-hour'],
      composition: ['centered', 'rule-of-thirds', 'asymmetric', 'symmetrical', 'diagonal', 'minimal', 'complex', 'layered', 'sparse'],
    };
  }
  
  // 如果没有找到对应的变体维度，使用通用变体
  if (Object.keys(variationDimensions).length === 0) {
    variationDimensions = {
      style: ['modern', 'vintage', 'minimalist', 'complex', 'abstract', 'realistic', 'artistic', 'bold', 'elegant'],
      colorScheme: ['warm', 'cool', 'vibrant', 'muted', 'monochrome', 'pastel', 'high-contrast', 'gradient', 'earth-tone'],
    };
  }
  
  // 生成9个变体
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      const variations: any = {};
      
      // 为每个维度分配不同的值
      Object.keys(variationDimensions).forEach((dimension, dimIndex) => {
        const options = variationDimensions[dimension];
        const valueIndex = (cellIndex + dimIndex) % options.length;
        variations[dimension] = options[valueIndex];
      });
      
      variants.push({
        cellIndex,
        position: { row: row + 1, col: col + 1 },
        mode: 'variation',
        variations,
      });
    }
  }
  
  return variants;
}

/**
 * 生成组合模式（用于摄影等）
 */
function generateCombinationVariants(
  baseParams: any,
  graphType: string,
  type: string
): Grid9Variant[] {
  const variants: Grid9Variant[] = [];
  
  // 镜头类型选项
  const lensTypes: Record<string, string[]> = {
    portrait: ['wide-angle (16-24mm)', 'standard (35-50mm)', 'medium-telephoto (85mm)', 'telephoto (135-200mm)'],
    landscape: ['ultra-wide (14-20mm)', 'wide-angle (24-35mm)', 'standard (50mm)', 'telephoto (70-200mm)'],
  };
  
  // 景深选项
  const depthOfField = [
    'shallow depth of field (f/1.4-f/2.8)',
    'medium depth of field (f/4-f/5.6)',
    'deep depth of field (f/8-f/16)',
  ];
  
  // 拍摄角度选项
  const cameraAngles = [
    'bird\'s eye view (overhead)',
    'eye level (straight-on)',
    'low angle (from below)',
    'dutch angle (tilted)',
  ];
  
  // 构图选项
  const compositions: Record<string, string[]> = {
    portrait: ['close-up', 'half-body', 'full-body', 'environmental portrait'],
    landscape: ['rule of thirds', 'leading lines', 'symmetry', 'framing'],
  };
  
  // 光线选项
  const lightingOptions = [
    'natural lighting',
    'soft lighting',
    'dramatic lighting',
    'rim lighting',
    'backlighting',
    'side lighting',
    'studio lighting',
    'golden hour lighting',
    'blue hour lighting',
  ];
  
  // 根据类型选择变体维度
  const lensTypeList = lensTypes[type] || lensTypes.portrait;
  const compositionList = compositions[type] || compositions.portrait;
  
  // 生成9个变体
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      
      variants.push({
        cellIndex,
        position: { row: row + 1, col: col + 1 },
        mode: 'combination',
        variations: {
          lens: lensTypeList[cellIndex % lensTypeList.length],
          depthOfField: depthOfField[cellIndex % depthOfField.length],
          angle: cameraAngles[cellIndex % cameraAngles.length],
          composition: compositionList[cellIndex % compositionList.length],
          lighting: lightingOptions[cellIndex % lightingOptions.length],
          elements: getElementVariant(cellIndex, type),
        },
      });
    }
  }
  
  return variants;
}

/**
 * 获取元素变体
 */
function getElementVariant(index: number, type: string): string {
  if (type === 'portrait') {
    const elements = [
      'with subtle background elements',
      'with minimal background',
      'with environmental context',
      'with props',
      'with natural elements',
      'with urban elements',
      'with abstract background',
      'with textured background',
      'with color-blocked background',
    ];
    return elements[index % elements.length];
  } else if (type === 'landscape') {
    const elements = [
      'with foreground elements (trees, rocks)',
      'with minimal foreground',
      'with water elements',
      'with sky elements',
      'with natural textures',
      'with man-made structures',
      'with wildlife',
      'with atmospheric effects',
      'with dramatic clouds',
    ];
    return elements[index % elements.length];
  }
  return '';
}
