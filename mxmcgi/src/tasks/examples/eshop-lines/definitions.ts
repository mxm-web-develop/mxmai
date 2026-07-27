import {
  COMMON_TEMPLATE_HEADER,
  CLOTHES_MODEL_PARTICIPATION,
  ENVIRONMENT_IMAGES,
  GARMENT_MATERIAL,
  GENERATE_PARAMS,
  HIDDEN_GRID_FIELDS,
  KIDS_SHOOT_FOCUS,
  MEN_SHOOT_FOCUS,
  MODEL_IMAGES,
  MODEL_PARTICIPATION,
  MODEL_PARTICIPATION_BLOCK,
  OUTPUT_BLOCK,
  OUTPUT_GRID,
  PROMPT_FIELD,
  ROUTING,
  STYLE_IMAGES,
  STYLE_REF_BLOCK,
  TEXT_FORMAT_KEY,
  UI_SCHEMA,
  WOMEN_SHOOT_FOCUS,
  refImagesField,
  shootPresetField,
} from './shared';
import {
  KIDS_SHOOT_PRESET_KEYS,
  KIDS_UNIFIED_TEMPLATE,
  MEN_SHOOT_PRESET_KEYS,
  MEN_UNIFIED_TEMPLATE,
  WOMEN_SHOOT_PRESET_KEYS,
  WOMEN_UNIFIED_TEMPLATE,
} from './clothes-line-templates';

export type EshopLineDef = {
  subtype: string;
  display: { taskLabel: string; subtypeLabel: string; routeHint: string };
  logicalModel: string;
  formSchema: Record<string, unknown>;
  unifiedTemplate: string;
  defaultAspectRatio?: string;
};

const GARMENT_IMAGES_WOMEN = refImagesField({
  key: 'garment_images',
  title: '女装 SKU 参考',
  description:
    '锁定女装款式、配色、面料与结构：领型、袖型、腰线、裙摆/裤脚、开衩、褶裥、辅料；须与参考为同一 SKU，禁止改成男装廓形或改色改款。',
  minItems: 1,
  maxItems: 14,
  defaultType: 'outfits',
});

const GARMENT_IMAGES_MEN = refImagesField({
  key: 'garment_images',
  title: '男装 SKU 参考',
  description:
    '锁定男装款式、配色、面料与结构：肩线、门襟/驳领、胸袋、袖长、裤腰、中缝、break；须与参考为同一 SKU，禁止改成女装软塌腰线或改色改款。',
  minItems: 1,
  maxItems: 14,
  defaultType: 'outfits',
});

const GARMENT_IMAGES_KIDS = refImagesField({
  key: 'garment_images',
  title: '童装 SKU 参考',
  description:
    '锁定童装款式、配色、印花/刺绣与结构：儿童穿着比例、袖长裤长、帽兜与辅料细节；须与参考为同一 SKU，禁止改图案或按成人比例改款。',
  minItems: 1,
  maxItems: 14,
  defaultType: 'outfits',
});

const PRODUCT_IMAGES = refImagesField({
  key: 'product_images',
  title: '商品 SKU 参考',
  description:
    '锁定款式、配色、材质、结构与关键细节（Logo 形态、扣件、纹理、比例）；生成须与参考为同一 SKU，禁止改款改色或替换为近似款。',
  minItems: 1,
  maxItems: 12,
  defaultType: 'main-subject',
});

function clothesFormSchema(opts: {
  garmentImages: ReturnType<typeof refImagesField>;
  shootFocus: Record<string, unknown>;
  defaultShoot: string;
  shootPresetKeys: readonly string[];
  defaultParticipation: string;
  modelParticipation?: Record<string, unknown>;
  defaultAspect: string;
  gridPoses: Record<string, string[]>;
}) {
  return {
    type: 'object',
    required: ['garment_images', 'shoot_focus', 'model_participation', 'shoot_preset', 'output_grid'],
    properties: {
      shoot_focus: opts.shootFocus,
      model_participation: opts.modelParticipation ?? {
        ...CLOTHES_MODEL_PARTICIPATION,
        default: opts.defaultParticipation,
      },
      model_images: MODEL_IMAGES,
      garment_images: opts.garmentImages,
      garment_material: GARMENT_MATERIAL,
      style_images: STYLE_IMAGES,
      environment_images: ENVIRONMENT_IMAGES,
      shoot_preset: shootPresetField(opts.defaultShoot, opts.shootPresetKeys),
      output_grid: OUTPUT_GRID,
      ...HIDDEN_GRID_FIELDS,
      aspect_ratio: { ...HIDDEN_GRID_FIELDS.aspect_ratio, default: opts.defaultAspect },
      prompt: PROMPT_FIELD,
    },
    'x-grid-pose-scripts': opts.gridPoses,
  };
}

function productFormSchema(opts: {
  displayMode: Record<string, unknown>;
  defaultShoot: string;
  defaultDisplay: string;
  includeModel?: boolean;
}) {
  const props: Record<string, unknown> = {
    product_images: PRODUCT_IMAGES,
    display_mode: { ...opts.displayMode, default: opts.defaultDisplay },
    style_images: STYLE_IMAGES,
    environment_images: ENVIRONMENT_IMAGES,
    shoot_preset: shootPresetField(opts.defaultShoot),
    output_grid: OUTPUT_GRID,
    ...HIDDEN_GRID_FIELDS,
    prompt: PROMPT_FIELD,
  };
  const required = ['product_images', 'display_mode', 'shoot_preset', 'output_grid'];
  if (opts.includeModel) {
    props.model_participation = { ...MODEL_PARTICIPATION, default: 'no_model' };
    props.model_images = MODEL_IMAGES;
    required.splice(1, 0, 'model_participation');
  }
  return { type: 'object', required, properties: props };
}

const WOMEN_GRID_POSES = {
  '2x2': [
    'Full-body feminine stride, subtle hip angle, ~32mm eye-level, dress/skirt hem fully visible, soft catalog lighting.',
    'Waist-up hero, hands adjusting neckline or sleeve cuff, ~70mm, emphasize décolletage line and waist seam.',
    'Three-quarter back, hair over shoulder, highlight back drape and slit/hem movement, ~40mm.',
    'Seated elegant three-quarter, smooth fabric fall across lap, ~50mm, camera slightly above eye line.',
  ],
  '3x3': [
    'Full-body establishing walk, gentle sway, ~28mm, feminine silhouette readable.',
    'Waist-up twist, one hand on hip or bag strap, ~65mm, sell-point at bust and waist.',
    'Macro of lace, bow, or delicate trim, ~100mm shallow DoF.',
    'Clean profile full-body, off-camera gaze, ~38mm, emphasize S-curve fit.',
    'Back full-body, natural arm swing, show rear panel and train/hem, ~35mm.',
    'Light twirl or step, dynamic hem flare, ~32mm, motion without blur on garment.',
    'Collarbone-to-waist crop with natural expression, fabric texture hero, ~75mm.',
    'Walking away mid-step turn, wind-touch hem, ~32mm.',
    'Accessory adjacency (belt, scarf, bag) with garment context, ~85mm.',
  ],
};

const MEN_GRID_POSES = {
  '2x2': [
    'Full-body neutral stance, shoulders square, ~32mm eye-level, trouser break and shoe line visible.',
    'Chest-up hero, adjusting lapel or cuff, ~70mm, emphasize shoulder line and chest fit.',
    'Three-quarter back, hands in pockets optional, highlight back yoke and trouser drape, ~40mm.',
    'Seated upright on minimal stool, clean trouser crease, ~50mm, structured tailoring readable.',
  ],
  '3x3': [
    'Full-body establishing, confident walk toward camera, ~28mm, masculine silhouette clear.',
    'Chest-up hero, arms crossed or hand in pocket, ~65mm, sell-point at chest and shoulder.',
    'Macro of weave, button, or stitching, ~100mm shallow DoF.',
    'Clean profile full-body, jawline optional if default, ~38mm, strong vertical lines.',
    'Back full-body, natural stride, show rear panel and hem, ~35mm.',
    'Half-kneel or crouch adjusting shoelace/cuff, ~55mm, low angle emphasizing trouser fit.',
    'Waist-up leaning forward, both hands at belt, ~75mm, emphasize waistband and fly.',
    'Walking away mid-step, structured coat swing, ~32mm.',
    'Detail of tie, watch, or belt zone with adjacent garment, ~85mm.',
  ],
};

const KIDS_GRID_POSES = {
  '2x2': [
    'Full-body cheerful stance, age-appropriate child proportions, natural smile, ~32mm eye-level, hem and shoe visible.',
    'Three-quarter waist-up, playful hand on pocket or waving, ~70mm, emphasize print and cute collar details.',
    'Back view full-body, hood or backpack optional, highlight back print/panel, ~40mm.',
    'Seated on floor or small prop, comfortable natural kid pose, ~50mm, fabric softness readable.',
  ],
  '3x3': [
    'Full-body establishing, small step forward with natural expression, ~28mm, child-scale proportions clear.',
    'Waist-up hero, cheerful gesture, bright expression, ~65mm, sell-point at chest print or graphic.',
    'Macro of appliqué, patch, or soft knit texture, ~100mm.',
    'Profile full-body, natural gaze, ~38mm, readable kid-fit silhouette.',
    'Back full-body, natural arm swing, ~35mm.',
    'Crouch or kneel play pose, pinch hem to show drape, ~55mm low angle.',
    'Hands adjusting hood or zipper, face partially visible OK, ~85mm.',
    'Mid-step hop or walk, dynamic hem, joyful energy, ~32mm.',
    'Flat-lay adjacent detail: socks, hat, or small accessory with outfit context, ~50mm top-down.',
  ],
};

export const ESHOP_LINE_DEFINITIONS: EshopLineDef[] = [
  {
    subtype: 'clothes-women',
    logicalModel: 'graph-eshop-clothes-women',
    display: {
      taskLabel: '电商 · 女装上架图',
      subtypeLabel: 'eshop/clothes-women（女装 · 轮廓/垂坠/腰线）',
      routeHint: '/graph/eshop/clothes-women',
    },
    defaultAspectRatio: '3:4',
    formSchema: clothesFormSchema({
      garmentImages: GARMENT_IMAGES_WOMEN,
      shootFocus: WOMEN_SHOOT_FOCUS,
      defaultShoot: 'studio_soft_gray',
      shootPresetKeys: WOMEN_SHOOT_PRESET_KEYS,
      defaultParticipation: 'default',
      defaultAspect: '3:4',
      gridPoses: WOMEN_GRID_POSES,
    }),
    unifiedTemplate: WOMEN_UNIFIED_TEMPLATE,
  },
  {
    subtype: 'clothes-men',
    logicalModel: 'graph-eshop-clothes-men',
    display: {
      taskLabel: '电商 · 男装上架图',
      subtypeLabel: 'eshop/clothes-men（男装 · 肩胸/结构/break）',
      routeHint: '/graph/eshop/clothes-men',
    },
    defaultAspectRatio: '3:4',
    formSchema: clothesFormSchema({
      garmentImages: GARMENT_IMAGES_MEN,
      shootFocus: MEN_SHOOT_FOCUS,
      defaultShoot: 'studio_white_seamless',
      shootPresetKeys: MEN_SHOOT_PRESET_KEYS,
      defaultParticipation: 'default',
      defaultAspect: '3:4',
      gridPoses: MEN_GRID_POSES,
    }),
    unifiedTemplate: MEN_UNIFIED_TEMPLATE,
  },
  {
    subtype: 'clothes-kids',
    logicalModel: 'graph-eshop-clothes-kids',
    display: {
      taskLabel: '电商 · 童装上架图',
      subtypeLabel: 'eshop/clothes-kids（童装 · 比例/印花/活泼穿拍）',
      routeHint: '/graph/eshop/clothes-kids',
    },
    defaultAspectRatio: '1:1',
    formSchema: clothesFormSchema({
      garmentImages: GARMENT_IMAGES_KIDS,
      shootFocus: KIDS_SHOOT_FOCUS,
      defaultShoot: 'studio_pastel_backdrop',
      shootPresetKeys: KIDS_SHOOT_PRESET_KEYS,
      defaultParticipation: 'default',
      defaultAspect: '1:1',
      gridPoses: KIDS_GRID_POSES,
    }),
    unifiedTemplate: KIDS_UNIFIED_TEMPLATE,
  },
  {
    subtype: 'accessories',
    logicalModel: 'graph-eshop-accessories',
    display: {
      taskLabel: '电商 · 饰品上架图',
      subtypeLabel: 'eshop/accessories（珠宝配饰 · 微距与陈列）',
      routeHint: '/graph/eshop/accessories',
    },
    formSchema: productFormSchema({
      defaultShoot: 'studio_black_dramatic',
      defaultDisplay: 'macro_detail',
      includeModel: true,
      displayMode: {
        type: 'string',
        title: '陈列方式',
        description: '决定饰品在画面中的呈现形态；与「模特参与度」配合（佩戴局部时可选手部/颈部裁切）。',
        'x-ui-type': 'selection',
        enum: ['macro_detail', 'flat_lay', 'jewelry_stand', 'worn_partial', 'lifestyle_prop'],
        'x-enum-labels': ['微距细节', '平铺陈列', '首饰架/托盘', '佩戴局部', '场景道具'],
        'x-enum-descriptions': {
          macro_detail: '微距展示宝石切面、金属拉丝、珐琅、扣头；浅景深但关键细节清晰。',
          flat_lay: '俯视平铺，对称或杂志式排版，背景干净，无文字装饰。',
          jewelry_stand: '项链架、戒指托、耳钉卡纸等专业陈列，电商主图常用。',
          worn_partial: '佩戴在颈/腕/耳/手局部，裁切不含可识别面部；强调比例与光泽。',
          lifestyle_prop: '与书本、花、大理石台等静物搭配，生活感但仍以 SKU 为主体。',
        },
      },
    }),
    unifiedTemplate: `${COMMON_TEMPLATE_HEADER}

一、重要的用户要求（表单 schema 插值，本单硬约束）
- 商品 SKU 参考（摘要/占位）：\${product_images}
- 陈列方式：\${display_mode}
- 模特参与度：\${model_participation}
- 模特参考（摘要/占位）：\${model_images}
- 风格参考（摘要/占位）：\${style_images}
- 场景参考（摘要/占位）：\${environment_images}
- 拍摄场景：\${shoot_preset}
- 输出宫格：\${output_grid}
- 宫格单元约束：\${grid_cell_constraint_preset}
- 画幅：\${aspect_ratio}
- 用户补充说明：\${prompt}

二、任务定义（电商饰品上架图是什么）
- **目标**：为珠宝、首饰、发饰、眼镜等**小件配饰**生成纯摄影商拍图；须展示**材质光泽、尺寸比例、工艺细节**。
- **非画报**：禁止价格牌、促销文案、多段文字排版；仅商品摄影。
- **SKU 锁定（硬）**：同款同色同结构；宝石数量、链长、扣型、镶嵌方式与参考一致。
${STYLE_REF_BLOCK}

${MODEL_PARTICIPATION_BLOCK}

三、任务要求（饰品商拍优秀标准）
- **display_mode**：macro 用 85–135mm 浅景深；flat_lay 俯视均匀光；jewelry_stand 展示立体轮廓；worn_partial 仅颈/腕/耳/手，禁清晰面部。
- **反光控制**：金属高光可控，宝石/fire 可见但不过曝；黑棚/白棚按 shoot_preset。
- **多宫格**：各格不同角度/焦距/陈列方式，同一 SKU 同一光色。

四、相关参考（饰品；用户未指定时补全）
- 布光：softbox + 小反光板；黑背景加轮廓光；macro 可用 light tent 均匀光。
- 平台：Amazon/Shopify/Etsy 主图；1:1 或 4:5 常见。

${OUTPUT_BLOCK}`,
  },
  {
    subtype: 'shoes-hats',
    logicalModel: 'graph-eshop-shoes-hats',
    display: {
      taskLabel: '电商 · 鞋帽上架图',
      subtypeLabel: 'eshop/shoes-hats（鞋靴帽饰 · 轮廓与材质）',
      routeHint: '/graph/eshop/shoes-hats',
    },
    formSchema: productFormSchema({
      defaultShoot: 'studio_white_seamless',
      defaultDisplay: 'hero_45',
      includeModel: true,
      displayMode: {
        type: 'string',
        title: '陈列方式',
        description: '鞋类强调侧轮廓与鞋底；帽类强调帽檐弧度与顶型。与「模特参与度」配合（上脚/头戴时可去脸）。',
        'x-ui-type': 'selection',
        enum: [
          'side_profile_pair',
          'hero_45',
          'top_down_pair',
          'on_foot_partial',
          'hat_form_mannequin',
          'stacked_display',
        ],
        'x-enum-labels': ['侧视成对', '45° 英雄角', '俯视成对', '上脚局部', '帽模/头模', '叠放陈列'],
        'x-enum-descriptions': {
          side_profile_pair: '左右脚侧视并列，鞋底与鞋帮轮廓完整，白底 catalog 标准。',
          hero_45: '单只或成对 45° 三维感，展示鞋头、鞋舌、鞋带/扣件。',
          top_down_pair: '俯视对称，展示鞋口、内衬、配对关系。',
          on_foot_partial: '脚踝以下上脚展示，禁可识别面部与大腿以上；强调真实比例。',
          hat_form_mannequin: '帽模或无头模展示帽檐、冠高、弯檐；禁完整假人头面部。',
          stacked_display: '多色或多只叠放/错层，仍须 SKU 锁定为主款。',
        },
      },
    }),
    unifiedTemplate: `${COMMON_TEMPLATE_HEADER}

一、重要的用户要求（表单 schema 插值，本单硬约束）
- 商品 SKU 参考（摘要/占位）：\${product_images}
- 陈列方式：\${display_mode}
- 模特参与度：\${model_participation}
- 模特参考（摘要/占位）：\${model_images}
- 风格参考（摘要/占位）：\${style_images}
- 场景参考（摘要/占位）：\${environment_images}
- 拍摄场景：\${shoot_preset}
- 输出宫格：\${output_grid}
- 宫格单元约束：\${grid_cell_constraint_preset}
- 画幅：\${aspect_ratio}
- 用户补充说明：\${prompt}

二、任务定义（电商鞋帽上架图是什么）
- **目标**：为鞋靴、帽子、袜套等**鞋帽类**生成纯摄影商拍；须展示**侧轮廓、鞋底纹、帽檐/冠型、材质（皮革/网布/毛呢）**。
- **SKU 锁定（硬）**：同款同色同底型/帽型；鞋带/扣件/帽徽位置与参考一致。
${STYLE_REF_BLOCK}

${MODEL_PARTICIPATION_BLOCK}

三、任务要求（鞋帽商拍优秀标准）
- **鞋类**：白底侧视是主图基准；45° 展示体积；macro 展示缝线/底纹。地面轻反射可选。
- **帽类**：帽模展示帽檐弧度；禁完整假人头；毛呢/棒球/渔夫等按 SKU 结构锁定。
- **on_foot_partial**：仅踝部以下，禁露脸；比例真实。
- **多宫格**：侧/45°/顶视/细节/上脚或帽模各一格。

四、相关参考（鞋帽；用户未指定时补全）
- 布光：均匀 catalog 光或侧光强调皮革质感；运动鞋可用稍硬光展示网眼。
- 画幅：1:1 主图常见；9:16 可用于短视频封面但仍禁文案排版。

${OUTPUT_BLOCK}`,
  },
  {
    subtype: 'product',
    logicalModel: 'graph-eshop-product',
    display: {
      taskLabel: '电商 · 通用品上架图',
      subtypeLabel: 'eshop/product（3C/家居/美妆等 · 白底与场景）',
      routeHint: '/graph/eshop/product',
    },
    formSchema: productFormSchema({
      defaultShoot: 'studio_white_seamless',
      defaultDisplay: 'catalog_hero',
      includeModel: false,
      displayMode: {
        type: 'string',
        title: '陈列方式',
        description: '通用品类商拍：白底主图、角度英雄图、平铺、场景化或细节微距。',
        'x-ui-type': 'selection',
        enum: ['catalog_hero', 'angle_hero', 'flat_lay', 'in_context', 'detail_macro'],
        'x-enum-labels': ['白底主图', '角度英雄图', '平铺', '场景化', '细节微距'],
        'x-enum-descriptions': {
          catalog_hero: '纯白/无缝背景，产品居中，占画面 70–85%，电商主图标准。',
          angle_hero: '3/4 或轻微俯视，展示体积、接口、按钮、包装结构。',
          flat_lay: '俯视组件/配件平铺，整齐对齐，适合套装或多件组合。',
          in_context: '产品置于真实使用环境（桌面、厨房、浴室等），无人物、无文字标签。',
          detail_macro: '材质、接口、按键、纹理微距，浅景深但关键特征可读。',
        },
      },
    }),
    unifiedTemplate: `${COMMON_TEMPLATE_HEADER}

一、重要的用户要求（表单 schema 插值，本单硬约束）
- 商品 SKU 参考（摘要/占位）：\${product_images}
- 陈列方式：\${display_mode}
- 风格参考（摘要/占位）：\${style_images}
- 场景参考（摘要/占位）：\${environment_images}
- 拍摄场景：\${shoot_preset}
- 输出宫格：\${output_grid}
- 宫格单元约束：\${grid_cell_constraint_preset}
- 画幅：\${aspect_ratio}
- 用户补充说明：\${prompt}

二、任务定义（电商通用品上架图是什么）
- **目标**：为 3C、家居、美妆瓶器、食品包装等**非服装鞋帽饰品** SKU 生成纯摄影商拍图；强调**形态、材质、功能结构、比例**。
- **禁止**：营销海报、信息图、价格标签、大段可读文字、人物模特（除非用户补充说明明确要求且与 no-model 默认一致——本业务默认无模特）。
- **SKU 锁定（硬）**：同款同色同结构；按钮/接口/包装/标签图形位置与参考一致（标签文字可虚化不可读）。
${STYLE_REF_BLOCK}

三、任务要求（通用品商拍优秀标准）
- **catalog_hero**：高 key 白底，软阴影 grounding，无 clutter。
- **in_context**：环境衬托但不抢主体；禁可读品牌文字（除非参考 SKU 自带且须 identity lock 同款）。
- **detail_macro**：展示用户决策细节（端口、材质、容量刻度等）。
- **多宫格**：主图/角度/细节/场景/配件平铺组合。

四、相关参考（通用品；用户未指定时补全）
- 布光：softbox 均匀 + 轻微地面反射；透明/玻璃产品控制折射高光。
- 平台：Amazon 主图规范（白底）、淘宝首图；negatives 含 no infographic, no promotional text.

${OUTPUT_BLOCK}`,
  },
];

export function buildBundleItem(def: EshopLineDef) {
  const aspectDefault = def.defaultAspectRatio ?? '1:1';
  const formSchema = { ...def.formSchema } as Record<string, unknown>;
  const props = (formSchema.properties ?? {}) as Record<string, unknown>;
  if (props.aspect_ratio) {
    props.aspect_ratio = { ...(props.aspect_ratio as object), default: aspectDefault };
  }

  return {
    scope: 'graph',
    type: 'eshop',
    subtype: def.subtype,
    is_active: true,
    rules_i18n: { zh: '', en: '' },
    output_format_i18n: { zh: '', en: '' },
    form_options_i18n: null,
    extra: {
      display: def.display,
      promptTextTaskKey: TEXT_FORMAT_KEY,
      taskTemplate: {
        formSchema,
        uiSchema: UI_SCHEMA,
        prompt: { unifiedTemplate: def.unifiedTemplate },
        extra: { generateParams: GENERATE_PARAMS },
      },
    },
    routing: {
      logical_model: def.logicalModel,
      provider: ROUTING.provider,
      model: ROUTING.model,
      enabled: ROUTING.enabled,
      margin: ROUTING.margin,
      charge_metric: ROUTING.charge_metric,
      sensitive_word_lists: ROUTING.sensitive_word_lists,
    },
    businessPricing: [],
    linkedTextFormat: null,
  };
}
