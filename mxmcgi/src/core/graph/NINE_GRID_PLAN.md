# 九宫格图片生成方案

## 需求概述

利用 nano-banana-pro 的 4K 画质能力，一次性生成一张包含 9 个内容的九宫格图片，然后通过图片切割技术将大图分割成 9 张小图，实现一次请求生成 9 张图片的效果。

## 技术方案

### 1. 核心思路

- **生成阶段**：在 prompt 中明确描述九宫格布局，要求模型生成 3x3 网格布局的图片
- **固定比例**：确保每个格子占据固定的位置和尺寸（每个格子占 1/3 宽度和 1/3 高度）
- **切割阶段**：生成后使用 sharp 库将大图按 3x3 网格切割成 9 张独立图片
- **结果处理**：将 9 张切割后的图片作为任务结果返回

### 2. 实现架构

```
用户请求 (grid9: true)
    ↓
生成九宫格 Prompt (包含布局描述)
    ↓
调用 nano-banana-pro (4K, 1:1 比例)
    ↓
生成一张 4K 九宫格大图
    ↓
图片切割 (3x3 网格)
    ↓
返回 9 张独立图片
```

### 3. 详细设计

#### 3.1 参数扩展

在 `PhotographParams`、`DesignParams`、`PaintingParams` 中添加：

```typescript
interface Grid9Params {
  grid9?: boolean; // 是否启用九宫格模式
  grid9Mode?: 'variation' | 'sequence' | 'combination'; // 变体模式（可选，系统会根据类型自动选择）
}
```

**变体模式说明**：
- `variation`（变体选择模式）：9个不同的效果，方便用户选择最好的（适用于设计、插画等）
- `sequence`（序列模式）：9个有逻辑关系的图片，如分镜、故事线、因果关系（适用于电影画面、漫画等）
- `combination`（组合模式）：混合不同的参数组合，展示不同技术参数的效果（适用于摄影等）

#### 3.2 动态变体生成系统

**核心原则**：根据不同的类型和场景，动态生成不同的变体策略。

**变体模式自动选择规则**：

1. **设计类型 (Design)**：
   - `illustration`（插画）→ `variation`：9个不同风格/色彩/构图的变体，方便选择
   - `3d` → `variation`：9个不同视角/材质/光照的变体
   - `poster` → `variation`：9个不同艺术风格/主题/色彩的变体
   - `manual` → `variation`：9个不同布局/配色/字体的变体
   - `icon` → `variation`：9个不同风格/尺寸的变体
   - `coverImage` → `variation`：9个不同布局/文字样式/视觉效果的变体

2. **绘画类型 (Painting)**：
   - `illustration`（插画）→ `variation`：9个不同风格/色彩的变体
   - `comic`（漫画）→ `sequence`：9个分镜图片，展现故事线
   - `conceptArt`（原画）→ `variation`：9个不同风格/细节程度的变体
   - `cartoon`（卡通）→ `variation`：9个不同风格/角色设计的变体

3. **摄影类型 (Photograph)**：
   - `portrait`（人像）→ `combination`：9个不同镜头/景深/角度/构图的组合
   - `landscape`（风景）→ `combination`：9个不同镜头/时间/构图的组合
   - `cinematic`（电影画面）→ `sequence`：9个分镜图片，展现电影场景序列
   - `commercial`（商业）→ `variation`：9个不同背景/光线/产品位置的变体
   - `documentary`（纪事）→ `sequence`：9个事件序列图片，展现故事线

**变体维度**（根据类型和模式动态选择）：

1. **人像摄影 (Portrait)**：
   - 镜头类型：广角 (16-24mm)、标准 (35-50mm)、中焦 (85mm)、长焦 (135-200mm)
   - 景深：浅景深 (f/1.4-f/2.8)、中景深 (f/4-f/5.6)、深景深 (f/8-f/16)
   - 拍摄角度：俯视、平视、仰视、侧面
   - 构图：特写、半身、全身、环境人像
   - 光线方向：正面光、侧光、逆光、顶光
   - 背景元素：不同背景元素或道具

2. **风景摄影 (Landscape)**：
   - 镜头类型：超广角 (14-20mm)、广角 (24-35mm)、标准 (50mm)、长焦 (70-200mm)
   - 景深：浅景深、中景深、深景深
   - 拍摄角度：俯视、平视、仰视
   - 构图：三分法、引导线、对称、框架
   - 时间：清晨、正午、黄昏、夜晚
   - 前景元素：不同的前景元素（树木、岩石、水面等）

3. **电影画面 (Cinematic)**：
   - 镜头类型：广角、标准、长焦
   - 景深：浅景深（电影感）、深景深
   - 拍摄角度：俯视、平视、仰视、倾斜
   - 色彩分级：不同色调（暖调、冷调、高对比等）
   - 光线设计：主光、辅光、轮廓光的不同组合
   - 画面元素：不同的场景元素

4. **商业拍摄 (Commercial)**：
   - 镜头类型：标准、微距、长焦
   - 景深：浅景深、深景深
   - 拍摄角度：俯视、平视、仰视
   - 背景：不同背景或道具
   - 光线：不同光线设置
   - 产品位置：不同的产品摆放位置

#### 3.3 动态变体生成逻辑

**变体配置接口**：

```typescript
type Grid9Mode = 'variation' | 'sequence' | 'combination';

interface Grid9Variant {
  cellIndex: number; // 0-8 (9个格子)
  position: { row: number; col: number }; // 位置
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
    // 绘画参数
    artStyle?: string;
    colorPalette?: string;
    // 序列参数（sequence模式）
    sequenceIndex?: number; // 在序列中的位置
    sequenceDescription?: string; // 序列描述（如"开场"、"冲突"、"高潮"等）
    narrativeRelation?: string; // 与前一张的关系（如"因果关系"、"时间推进"等）
  };
}

/**
 * 根据类型自动选择变体模式
 */
function getDefaultGrid9Mode(
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
 */
function generateGrid9Variants(
  baseParams: PhotographParams | DesignParams | PaintingParams,
  graphType: 'photograph' | 'design' | 'painting',
  type: string,
  userMode?: Grid9Mode // 用户指定的模式（可选）
): Grid9Variant[] {
  // 1. 确定变体模式
  const mode = userMode || getDefaultGrid9Mode(graphType, type);
  
  // 2. 根据模式和类型生成变体
  if (mode === 'sequence') {
    return generateSequenceVariants(baseParams, graphType, type);
  } else if (mode === 'variation') {
    return generateVariationVariants(baseParams, graphType, type);
  } else {
    return generateCombinationVariants(baseParams, graphType, type);
  }
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
        composition: ['centered', 'rule-of-thirds', 'asymmetric', 'symmetrical', 'diagonal', 'grid', 'flowing', 'minimal', 'complex'],
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
        theme: ['dark', 'light', 'colorful', 'monochrome', 'gradient', 'textured', 'geometric', 'organic', 'mixed'],
        layout: ['centered', 'asymmetric', 'grid', 'flowing', 'minimal', 'complex', 'layered', 'overlapping', 'sparse'],
      };
    }
  } else if (graphType === 'painting') {
    if (type === 'illustration') {
      variationDimensions = {
        illustrationStyle: ['flat', 'realistic', 'watercolor', 'digital', 'sketch', 'vector', 'mixed-media', 'stylized', 'photorealistic'],
        colorPalette: ['warm', 'cool', 'vibrant', 'muted', 'monochrome', 'pastel', 'high-saturation', 'earth-tone', 'neon'],
        composition: ['centered', 'rule-of-thirds', 'asymmetric', 'symmetrical', 'diagonal', 'flowing', 'minimal', 'complex', 'layered'],
      };
    }
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
  // 使用原有的组合逻辑（镜头、景深、角度等）
  // ... 参考之前的实现
  return [];
}
```

#### 3.4 Prompt 生成规则

**根据变体模式生成不同的 Prompt**：

2. **Prompt 生成**：

**根据变体模式生成不同的 Prompt 描述**：

```typescript
function buildGrid9Prompt(
  basePrompt: string,
  params: any,
  variants: Grid9Variant[],
  outputLanguage: 'zh' | 'en'
): string {
  const isZh = outputLanguage === 'zh';
  const mode = variants[0].mode;
  
  let prompt = isZh 
    ? '【九宫格布局要求】\n请生成一张 3x3 网格布局的图片，具体要求：\n'
    : '【Nine Grid Layout Requirements】\nPlease generate an image with a strict 3x3 grid layout, with the following requirements:\n';
  
  prompt += isZh
    ? '1. 整张图片必须严格划分为 3 行 3 列，共 9 个等大小的格子\n'
    : '1. The entire image must be strictly divided into 3 rows and 3 columns, totaling 9 equal-sized cells\n';
  
  prompt += isZh
    ? '2. 每个格子占据图片的 1/3 宽度和 1/3 高度\n'
    : '2. Each cell occupies exactly 1/3 of the image width and 1/3 of the image height\n';
  
  prompt += isZh
    ? '3. 格子之间可以有细线分隔（可选），但必须保证每个格子内容独立\n'
    : '3. Cells can have thin dividing lines (optional), but each cell\'s content must be independent\n';
  
  prompt += isZh
    ? `4. 9 个格子的内容都基于相同的基础描述："${basePrompt}"\n`
    : `4. All 9 cells are based on the same base description: "${basePrompt}"\n`;
  
  // 根据模式生成不同的描述
  if (mode === 'sequence') {
    // 序列模式：强调逻辑关系和故事线
    prompt += isZh
      ? '5. 9 个格子展现一个完整的故事序列，每个格子是故事中的一个场景，具体要求：\n'
      : '5. The 9 cells represent a complete story sequence, with each cell being a scene in the story, with the following requirements:\n';
    
    variants.forEach((variant, index) => {
      const { row, col } = variant.position;
      const posName = isZh ? getPositionNameZh(row, col) : getPositionNameEn(row, col);
      const seqDesc = variant.variations.sequenceDescription || `scene ${index + 1}`;
      const relation = variant.variations.narrativeRelation || '';
      
      prompt += isZh
        ? `   - ${posName}：${seqDesc}${relation ? `，${relation}` : ''}\n`
        : `   - ${posName}: ${seqDesc}${relation ? `, ${relation}` : ''}\n`;
    });
    
    prompt += isZh
      ? '6. 确保每个场景在视觉上连贯，展现故事的因果关系和时间推进\n'
      : '6. Ensure each scene is visually coherent, showing causal relationships and temporal progression\n';
  } else if (mode === 'variation') {
    // 变体模式：强调不同的效果选择
    prompt += isZh
      ? '5. 9 个格子展现不同的设计效果，每个格子是同一主题的不同变体，方便选择最好的效果，具体要求：\n'
      : '5. The 9 cells show different design variations, with each cell being a different variant of the same theme, for easy selection of the best effect, with the following requirements:\n';
    
    variants.forEach((variant) => {
      const { row, col } = variant.position;
      const posName = isZh ? getPositionNameZh(row, col) : getPositionNameEn(row, col);
      const varDesc = buildVariationDescription(variant.variations, isZh);
      
      prompt += `   - ${posName}：${varDesc}\n`;
    });
    
    prompt += isZh
      ? '6. 确保每个变体在风格、色彩、构图等维度上有明显差异，但保持整体主题一致\n'
      : '6. Ensure each variant has distinct differences in style, color, composition, etc., while maintaining overall theme consistency\n';
  } else {
    // 组合模式：强调不同参数组合
    prompt += isZh
      ? '5. 9 个格子展现不同的参数组合效果，每个格子使用不同的技术参数，具体要求：\n'
      : '5. The 9 cells show different parameter combinations, with each cell using different technical parameters, with the following requirements:\n';
    
    variants.forEach((variant) => {
      const { row, col } = variant.position;
      const posName = isZh ? getPositionNameZh(row, col) : getPositionNameEn(row, col);
      const varDesc = buildCombinationDescription(variant.variations, isZh);
      
      prompt += `   - ${posName}：${varDesc}\n`;
    });
    
    prompt += isZh
      ? '6. 确保每个组合在镜头、景深、角度、构图等维度上有差异，展示不同技术参数的效果\n'
      : '6. Ensure each combination differs in lens, depth of field, angle, composition, etc., showing the effects of different technical parameters\n';
  }
  
  prompt += isZh
    ? '7. 确保每个格子的内容完整且独立，适合后续切割\n'
    : '7. Ensure each cell\'s content is complete and independent, suitable for subsequent cropping\n';
  
  return prompt;
}
```

**英文版本**：
```
【Nine Grid Layout Requirements】
Please generate an image with a strict 3x3 grid layout, with the following requirements:
1. The entire image must be strictly divided into 3 rows and 3 columns, totaling 9 equal-sized cells
2. Each cell occupies exactly 1/3 of the image width and 1/3 of the image height
3. Cells can have thin dividing lines (optional), but each cell's content must be independent
4. All 9 cells are based on the same base description: "[User's base prompt and parameters]"
5. However, each cell should have variations in details:
   - Top-left (Row 1, Column 1): using [lens type 1], [depth of field 1], [angle 1], [composition 1], [lighting 1], [element variation 1]
   - Top-center (Row 1, Column 2): using [lens type 2], [depth of field 2], [angle 2], [composition 2], [lighting 2], [element variation 2]
   - Top-right (Row 1, Column 3): using [lens type 3], [depth of field 3], [angle 3], [composition 3], [lighting 3], [element variation 3]
   - Middle-left (Row 2, Column 1): using [lens type 4], [depth of field 4], [angle 4], [composition 4], [lighting 4], [element variation 4]
   - Center (Row 2, Column 2): using [lens type 5], [depth of field 5], [angle 5], [composition 5], [lighting 5], [element variation 5]
   - Middle-right (Row 2, Column 3): using [lens type 6], [depth of field 6], [angle 6], [composition 6], [lighting 6], [element variation 6]
   - Bottom-left (Row 3, Column 1): using [lens type 7], [depth of field 7], [angle 7], [composition 7], [lighting 7], [element variation 7]
   - Bottom-center (Row 3, Column 2): using [lens type 8], [depth of field 8], [angle 8], [composition 8], [lighting 8], [element variation 8]
   - Bottom-right (Row 3, Column 3): using [lens type 9], [depth of field 9], [angle 9], [composition 9], [lighting 9], [element variation 9]
6. Ensure each cell's content is complete and independent, suitable for subsequent cropping
7. All cells maintain consistent overall style, but show diversity through variations in lens, depth of field, angle, composition, lighting, and elements
```

#### 3.4 变体生成实现

创建 `src/core/graph/graphconfigs/grid9-variants.ts`：

```typescript
export interface Grid9Variant {
  cellIndex: number; // 0-8
  position: { row: number; col: number };
  variations: {
    lens?: string;
    depthOfField?: string;
    angle?: string;
    composition?: string;
    lighting?: string;
    elements?: string;
    colorGrading?: string; // 电影画面专用
    timeOfDay?: string;    // 风景专用
  };
}

// 镜头类型选项
const LENS_TYPES = {
  portrait: ['wide-angle (16-24mm)', 'standard (35-50mm)', 'medium-telephoto (85mm)', 'telephoto (135-200mm)'],
  landscape: ['ultra-wide (14-20mm)', 'wide-angle (24-35mm)', 'standard (50mm)', 'telephoto (70-200mm)'],
  cinematic: ['wide-angle', 'standard', 'telephoto'],
  commercial: ['standard', 'macro', 'telephoto'],
};

// 景深选项
const DEPTH_OF_FIELD = [
  'shallow depth of field (f/1.4-f/2.8)',
  'medium depth of field (f/4-f/5.6)',
  'deep depth of field (f/8-f/16)',
];

// 拍摄角度选项
const CAMERA_ANGLES = [
  'bird\'s eye view (overhead)',
  'eye level (straight-on)',
  'low angle (from below)',
  'dutch angle (tilted)',
];

// 构图选项
const COMPOSITIONS = {
  portrait: ['close-up', 'half-body', 'full-body', 'environmental portrait'],
  landscape: ['rule of thirds', 'leading lines', 'symmetry', 'framing'],
  cinematic: ['wide shot', 'medium shot', 'close-up', 'extreme close-up'],
  commercial: ['product centered', 'lifestyle', 'minimalist', 'editorial'],
};

/**
 * 生成 9 个格子的变体配置
 */
export function generateGrid9Variants(
  graphType: 'photograph' | 'design' | 'painting',
  type: string
): Grid9Variant[] {
  const variants: Grid9Variant[] = [];
  
  // 根据类型选择变体维度
  const lensTypes = LENS_TYPES[type as keyof typeof LENS_TYPES] || LENS_TYPES.portrait;
  const compositions = COMPOSITIONS[type as keyof typeof COMPOSITIONS] || COMPOSITIONS.portrait;
  
  // 生成 9 个变体
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      
      // 为每个格子分配不同的变体组合
      const variant: Grid9Variant = {
        cellIndex,
        position: { row: row + 1, col: col + 1 },
        variations: {
          lens: lensTypes[cellIndex % lensTypes.length],
          depthOfField: DEPTH_OF_FIELD[cellIndex % DEPTH_OF_FIELD.length],
          angle: CAMERA_ANGLES[cellIndex % CAMERA_ANGLES.length],
          composition: compositions[cellIndex % compositions.length],
          lighting: getLightingVariant(cellIndex, type),
          elements: getElementVariant(cellIndex, type),
        },
      };
      
      // 根据类型添加特定变体
      if (type === 'cinematic') {
        variant.variations.colorGrading = getColorGradingVariant(cellIndex);
      }
      if (type === 'landscape') {
        variant.variations.timeOfDay = getTimeOfDayVariant(cellIndex);
      }
      
      variants.push(variant);
    }
  }
  
  return variants;
}

function getLightingVariant(index: number, type: string): string {
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
  return lightingOptions[index % lightingOptions.length];
}

function getElementVariant(index: number, type: string): string {
  // 根据类型返回不同的元素描述
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
  }
  // ... 其他类型的元素变体
  return '';
}

function getColorGradingVariant(index: number): string {
  const colorGradings = [
    'warm color grading',
    'cool color grading',
    'high contrast',
    'desaturated',
    'vibrant',
    'cinematic teal and orange',
    'monochrome',
    'vintage film look',
    'modern digital look',
  ];
  return colorGradings[index % colorGradings.length];
}

function getTimeOfDayVariant(index: number): string {
  const times = ['dawn', 'morning', 'noon', 'afternoon', 'golden hour', 'dusk', 'blue hour', 'night', 'midnight'];
  return times[index % times.length];
}
```

#### 3.5 图片生成参数

当 `grid9: true` 时：
- `aspect_ratio: '1:1'`（固定为正方形，便于切割）
- `image_size: '4K'`（使用 4K 画质，确保每个格子都有足够分辨率）
- 4K 分辨率：4096x4096 像素
- 每个格子：约 1365x1365 像素（足够清晰）

#### 3.6 图片切割实现

创建 `src/core/utils/grid9-splitter.ts`：

```typescript
import sharp from 'sharp';

export interface Grid9SplitResult {
  images: string[]; // base64 数组，9 张图片
  metadata: {
    originalSize: { width: number; height: number };
    cellSize: { width: number; height: number };
    format: string;
  };
}

/**
 * 将九宫格图片切割成 9 张独立图片
 * @param imageInput 图片 URL 或 base64 或 Buffer
 * @returns 切割后的 9 张图片（base64 格式）
 */
export async function splitGrid9Image(
  imageInput: string | Buffer
): Promise<Grid9SplitResult> {
  // 1. 加载图片
  let imageBuffer: Buffer;
  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('data:')) {
      // Base64
      const base64Data = imageInput.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // URL - 需要下载
      const response = await fetch(imageInput);
      imageBuffer = Buffer.from(await response.arrayBuffer());
    }
  } else {
    imageBuffer = imageInput;
  }

  // 2. 获取图片元数据
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height, format } = metadata;
  
  if (!width || !height) {
    throw new Error('无法获取图片尺寸');
  }

  // 3. 计算每个格子的尺寸
  const cellWidth = Math.floor(width / 3);
  const cellHeight = Math.floor(height / 3);

  // 4. 切割 9 个格子
  const images: string[] = [];
  
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const left = col * cellWidth;
      const top = row * cellHeight;
      
      // 使用 sharp 裁剪
      const cellBuffer = await sharp(imageBuffer)
        .extract({
          left,
          top,
          width: cellWidth,
          height: cellHeight,
        })
        .toBuffer();
      
      // 转换为 base64
      const base64 = cellBuffer.toString('base64');
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      images.push(`data:${mimeType};base64,${base64}`);
    }
  }

  return {
    images,
    metadata: {
      originalSize: { width, height },
      cellSize: { width: cellWidth, height: cellHeight },
      format: format || 'unknown',
    },
  };
}
```

#### 3.5 任务处理流程修改

在 `graph-task.ts` 中：

1. **检测九宫格模式**：
```typescript
const isGrid9 = (params as any).grid9 === true;
```

2. **生成后处理**：
```typescript
if (isGrid9 && result.image_urls.length > 0) {
  // 只处理第一张图片（九宫格大图）
  const grid9ImageUrl = result.image_urls[0];
  
  // 切割图片
  const { splitGrid9Image } = await import('../utils/grid9-splitter');
  const splitResult = await splitGrid9Image(grid9ImageUrl);
  
  // 将切割后的 9 张图片作为结果
  finalMediaUrls = splitResult.images.map(img => {
    // 如果需要上传到 MinIO，先上传
    // 否则直接返回 base64
    return img;
  });
  
  console.log(`[GraphTask] 九宫格图片已切割为 9 张 (taskId: ${taskId})`);
}
```

3. **存储处理**：
   - 如果启用 MinIO 存储，需要将 9 张 base64 图片上传
   - 更新任务结果中的 `image_urls` 为 9 张图片的 URL

### 4. Prompt 生成集成

在 `graph-service.ts` 的 `generateGraphPrompt` 函数中：

```typescript
// 检测是否为九宫格模式
const isGrid9 = (params as any).grid9 === true;

if (isGrid9) {
  // 1. 生成基础 prompt（正常流程）
  const basePrompt = await generateGraphPrompt(...);
  
  // 2. 生成 9 个变体配置
  const { generateGrid9Variants } = await import('./graphconfigs/grid9-variants');
  const variants = generateGrid9Variants(graphType, params.type);
  
  // 3. 构建九宫格 prompt
  const grid9Prompt = buildGrid9Prompt(
    basePrompt.prompt,
    params,
    variants,
    outputLanguage
  );
  
  return {
    prompt: grid9Prompt,
    knowledgeRecallMetadata: basePrompt.knowledgeRecallMetadata,
  };
}
```

创建 `buildGrid9Prompt` 函数：

```typescript
function buildGrid9Prompt(
  basePrompt: string,
  params: PhotographParams | DesignParams | PaintingParams,
  variants: Grid9Variant[],
  outputLanguage: 'zh' | 'en'
): string {
  const isZh = outputLanguage === 'zh';
  
  let prompt = isZh 
    ? '【九宫格布局要求】\n请生成一张 3x3 网格布局的图片，具体要求：\n'
    : '【Nine Grid Layout Requirements】\nPlease generate an image with a strict 3x3 grid layout, with the following requirements:\n';
  
  prompt += isZh
    ? '1. 整张图片必须严格划分为 3 行 3 列，共 9 个等大小的格子\n'
    : '1. The entire image must be strictly divided into 3 rows and 3 columns, totaling 9 equal-sized cells\n';
  
  prompt += isZh
    ? '2. 每个格子占据图片的 1/3 宽度和 1/3 高度\n'
    : '2. Each cell occupies exactly 1/3 of the image width and 1/3 of the image height\n';
  
  prompt += isZh
    ? '3. 格子之间可以有细线分隔（可选），但必须保证每个格子内容独立\n'
    : '3. Cells can have thin dividing lines (optional), but each cell\'s content must be independent\n';
  
  prompt += isZh
    ? `4. 9 个格子的内容都基于相同的基础描述："${basePrompt}"\n`
    : `4. All 9 cells are based on the same base description: "${basePrompt}"\n`;
  
  prompt += isZh
    ? '5. 但每个格子在细节上要有差异，具体如下：\n'
    : '5. However, each cell should have variations in details:\n';
  
  // 为每个格子添加变体描述
  variants.forEach((variant, index) => {
    const { row, col } = variant.position;
    const posName = isZh 
      ? getPositionNameZh(row, col)
      : getPositionNameEn(row, col);
    
    const varDesc = buildVariantDescription(variant, isZh);
    
    prompt += `   - ${posName}: ${varDesc}\n`;
  });
  
  prompt += isZh
    ? '6. 确保每个格子的内容完整且独立，适合后续切割\n'
    : '6. Ensure each cell\'s content is complete and independent, suitable for subsequent cropping\n';
  
  prompt += isZh
    ? '7. 所有格子保持整体风格一致，但通过镜头、景深、角度、构图、光线、元素等细节差异展现多样性\n'
    : '7. All cells maintain consistent overall style, but show diversity through variations in lens, depth of field, angle, composition, lighting, and elements\n';
  
  return prompt;
}

function buildVariantDescription(variant: Grid9Variant, isZh: boolean): string {
  const parts: string[] = [];
  const { variations } = variant;
  
  if (variations.lens) {
    parts.push(isZh ? `使用${variations.lens}镜头` : `using ${variations.lens} lens`);
  }
  if (variations.depthOfField) {
    parts.push(isZh ? variations.depthOfField : variations.depthOfField);
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
  if (variations.colorGrading) {
    parts.push(isZh ? `${variations.colorGrading}色彩分级` : `${variations.colorGrading}`);
  }
  if (variations.timeOfDay) {
    parts.push(isZh ? `${variations.timeOfDay}时段` : `at ${variations.timeOfDay}`);
  }
  
  return parts.join('，') || (isZh ? '标准配置' : 'standard configuration');
}
```

### 5. 前端集成

#### 4.1 UI 添加

在 `moblie/app/create/photo.tsx` 中添加：

```typescript
// 在参数接口中添加
interface PhotographParams {
  // ... 现有参数
  grid9?: boolean; // 九宫格模式
}

// 在表单中添加开关
<View style={styles.fieldRow}>
  <ThemedText style={{ width: 72 }}>九宫格模式</ThemedText>
  <Switch
    value={photographParams.grid9 || false}
    onValueChange={(value) => 
      setPhotographParams({ ...photographParams, grid9: value })
    }
  />
  <ThemedText style={{ fontSize: 12, color: muted, marginLeft: 8 }}>
    一次生成 9 张图片
  </ThemedText>
</View>
```

#### 4.2 API 调用

在 `createPhotographTask` 等函数中传递 `grid9` 参数。

### 5. 优势分析

1. **成本效益**：
   - 一次 API 调用生成 9 张图片
   - 相比 9 次独立调用，成本降低约 89%

2. **速度提升**：
   - 一次生成比 9 次串行调用快得多
   - 切割操作本地完成，速度快

3. **一致性**：
   - 9 张图片来自同一张图，风格统一
   - 适合需要系列图片的场景

### 6. 限制和注意事项

1. **内容限制**：
   - 9 个格子的内容需要在 prompt 中明确描述
   - 如果用户没有提供 9 个不同的描述，可能需要自动生成或重复使用

2. **切割精度**：
   - 依赖模型生成的网格是否严格对齐
   - 可能需要微调切割边界（添加容错机制）

3. **存储空间**：
   - 4K 图片较大，切割后 9 张图片需要更多存储空间
   - 考虑压缩选项

4. **错误处理**：
   - 如果生成的图片不是严格的 3x3 网格，切割可能失败
   - 需要添加验证和容错机制

### 7. 实施步骤

1. ✅ **阶段 1：后端核心功能**
   - [ ] 创建 `grid9-variants.ts` 变体生成函数
   - [ ] 创建 `grid9-splitter.ts` 工具函数
   - [ ] 修改 `graph-service.ts` 添加九宫格 prompt 生成（包含变体描述）
   - [ ] 修改 `graph-task.ts` 添加切割逻辑
   - [ ] 添加参数类型定义

2. ✅ **阶段 2：测试验证**
   - [ ] 单元测试：切割功能测试
   - [ ] 集成测试：完整流程测试
   - [ ] 验证 4K 图片切割效果

3. ✅ **阶段 3：前端集成**
   - [ ] 添加 UI 开关
   - [ ] 更新 API 接口
   - [ ] 测试端到端流程

4. ✅ **阶段 4：优化和文档**
   - [ ] 性能优化
   - [ ] 错误处理完善
   - [ ] 用户文档

### 8. 扩展可能性

1. **自定义布局**：
   - 支持 2x2、4x4 等其他网格布局
   - 支持非均匀网格

2. **智能切割**：
   - 使用图像识别检测网格线
   - 自动调整切割边界

3. **批量处理**：
   - 支持一次生成多个九宫格
   - 批量切割和处理

## 总结

这个方案充分利用了 nano-banana-pro 的 4K 能力，通过一次生成 + 智能切割的方式，实现了高效的多图生成。关键是要确保 prompt 中明确描述九宫格布局，并在切割时保证精度。
