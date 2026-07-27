/** 电商 Graph 子业务 bundle 共享 schema 片段 */

export const REF_IMAGE_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: { type: 'string', title: '图片 URL / Base64' },
    type: {
      type: 'string',
      title: '用途类型',
      enum: ['main-subject', 'background', 'outfits', 'color-reference', 'style-reference'],
      default: 'main-subject',
    },
    purpose: { type: 'string', title: '用途说明（可选）' },
    groupKey: { type: 'string', title: '槽位键' },
    groupTitle: { type: 'string', title: '分组标题' },
    groupDesc: { type: 'string', title: '分组说明（可选）' },
  },
  required: ['content', 'type'],
} as const;

export function refImagesField(opts: {
  key: string;
  title: string;
  description: string;
  minItems: number;
  maxItems: number;
  defaultType: string;
}) {
  return {
    type: 'array',
    title: opts.title,
    description: opts.description,
    'x-ui-type': 'referenceImages',
    minItems: opts.minItems,
    maxItems: opts.maxItems,
    items: {
      ...REF_IMAGE_ITEM,
      properties: {
        ...REF_IMAGE_ITEM.properties,
        type: { ...REF_IMAGE_ITEM.properties.type, default: opts.defaultType },
      },
    },
  };
}

export const MODEL_PARTICIPATION = {
  type: 'string',
  title: '模特参与度',
  description: '控制画面中是否出现真人模特；与「模特参考」配合使用。',
  'x-ui-type': 'selection',
  enum: ['default', 'face_hidden', 'no_model'],
  'x-enum-labels': ['默认', '去模特身份', '无模特'],
  default: 'default',
  'x-enum-descriptions': {
    default: '根据描述或模特参考完整展示人物；须保证与参考为同一人（identity lock）。',
    face_hidden:
      '强去脸：画面裁切在下巴/下唇以下，或纯背影/侧后景，商品与穿着部位为绝对主体；禁止清晰双眼与五官入镜。',
    no_model: '画面中不出现真人；仅展示商品本体或静物陈列，以多角度与细节为主，仍须遵守 SKU 锁定。',
  },
} as const;

/** 服装三线：默认模特穿拍，不提供去脸选项 */
export const CLOTHES_MODEL_PARTICIPATION = {
  type: 'string',
  title: '展示方式',
  description: '默认模特穿拍；无模特仅用于挂拍/平铺 catalog。',
  'x-ui-type': 'selection',
  enum: ['default', 'no_model'],
  'x-enum-labels': ['模特穿拍', '无模特挂拍/平铺'],
  default: 'default',
  'x-enum-descriptions': {
    default: '真人模特穿着展示 SKU；有模特参考时须 identity lock（同一人）；面部自然入镜，姿态与景别服务于拍摄侧重点。',
    no_model: '无真人；衣架、鬼影人台或平铺，以多角度展示版型与细节，仍须 SKU 锁定。',
  },
} as const;

export const HIDDEN_GRID_FIELDS = {
  grid_cell_constraint_preset: {
    type: 'string',
    title: '宫格单元约束',
    'x-user-visible': false,
    enum: ['strict_seamless', 'standard', 'none'],
    default: 'strict_seamless',
    'x-enum-prompt-append': {
      strict_seamless:
        '**CRITICAL REQUIREMENTS FOR CELLS:** 1. NO borders, NO white edges, NO margins, NO gaps between cells. 2. Content must fill the entire cell area edge-to-edge with no empty spaces. 3. Each cell must be seamless and complete, with content extending to all edges. 4. Ensure cells are clearly separated visually but can be cropped independently without any white borders or edges. 5. The grid should appear as ${total_cells} complete, edge-to-edge images that can be perfectly cropped without any borders or margins.',
      standard:
        '**GRID LAYOUT:** ${grid_n}x${grid_n} equal cells; no thick outer frame; each cell must be visually distinct and independently crop-friendly; ${total_cells} panels total.',
      none: '',
    },
  },
  aspect_ratio: {
    type: 'string',
    title: '画幅',
    'x-user-visible': false,
    enum: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    default: '1:1',
  },
} as const;

export const OUTPUT_GRID = {
  type: 'string',
  title: '输出宫格',
  description: '与拍摄场景独立：单张选 1×1；需多角度连拍选 2×2 或 3×3（contact sheet 生成后裁格）。',
  'x-ui-type': 'selection',
  enum: ['1x1', '2x2', '3x3'],
  'x-enum-labels': ['单张（1×1）', '四宫格（2×2）', '九宫格（3×3）'],
  default: '1x1',
} as const;

export const PROMPT_FIELD = {
  type: 'string',
  title: '补充说明',
  description: '品牌调性、目标平台（Amazon/Shopify/天猫）、禁止元素、镜头或陈列偏好等',
  default: '',
} as const;

export const STUDIO_SHOOT_PRESETS = {
  enum: [
    'studio_white_seamless',
    'studio_soft_gray',
    'studio_warm_beige',
    'studio_concrete_industrial',
    'studio_pastel_backdrop',
    'studio_dual_tone_corner',
    'studio_window_side_light',
    'studio_black_dramatic',
    'indoor_minimal_loft',
    'indoor_marble_vanity',
    'indoor_cafe_window',
    'nature_soft_daylight',
    'urban_street_day',
  ],
  labels: [
    '室内 · 纯白无缝棚',
    '室内 · 浅灰渐变棚',
    '室内 · 暖米杏色棚',
    '室内 · 清水泥工业棚',
    '室内 · 马卡龙色背景纸',
    '室内 · 双色墙角布景',
    '室内 · 落地窗侧光棚',
    '室内 · 黑色戏剧光棚',
    '室内 · 极简 Loft',
    '室内 · 大理石梳妆台',
    '室内 · 咖啡馆临窗',
    '自然 · 柔和日光',
    '城市 · 日景商业街',
  ],
  descriptions: {
    studio_white_seamless:
      '【棚拍】无缝纯白背景，均匀柔光，高 key 色彩还原；Amazon/天猫主图标准，主体占画面 75–88%。',
    studio_soft_gray: '【棚拍】浅灰微纹理，柔光+轻轮廓光，微反差清晰；独立站主图常用。',
    studio_warm_beige: '【棚拍】暖米/杏色无缝，柔和暖主光，轻奢温馨。',
    studio_concrete_industrial: '【棚拍】清水泥/灰色工业墙，侧光强调肌理，硬朗都会感。',
    studio_pastel_backdrop: '【棚拍】低饱和粉/蓝/薄荷背景纸，高 key 清新电商风。',
    studio_dual_tone_corner: '【棚拍】双色墙角透视，轻纵深感但不抢主体。',
    studio_window_side_light: '【棚拍】大窗单侧自然光，柔阴影，接近窗边 lookbook。',
    studio_black_dramatic: '【棚拍】纯黑或深灰背景，定向硬光+轮廓光，珠宝/鞋履/高端单品常用。',
    indoor_minimal_loft: '【室内】大白墙、浅木地板、少量现代家具剪影，高 key 干净。',
    indoor_marble_vanity: '【室内】大理石台面/梳妆场景，适合饰品、美妆瓶器、小件精品。',
    indoor_cafe_window: '【室内】咖啡馆临大窗，室内暖光+窗外虚化 bokeh，生活感陈列。',
    nature_soft_daylight: '【自然】开放阴影区柔和日光，低饱和自然系；户外静物/穿戴局部。',
    urban_street_day: '【城市】商业街混合天光，都市纵深，背景虚化，禁可读招牌文字。',
    beach_golden_sunset: '【海边】日落金时刻，暖橙天空，长影与轮廓光；度假女装/泳装系列常用。',
    resort_poolside: '【海边】度假村泳池畔，水面高光反射，奢华休闲度假系。',
    nature_meadow_park: '【自然】公园草坪与树影，阴天柔光或透云直射，清新自然；童装/女装生活系。',
    urban_rooftop_golden: '【城市】屋顶露台+天际线，日落金侧光，风感衣摆与轮廓光。',
    urban_subway_concourse: '【城市】地铁/高铁候车长廊，线性灯带+冷白反射，现代通勤男装风；禁站台标识文字。',
    urban_glass_facade: '【城市】现代玻璃幕墙前，蓝灰反射，简洁都会感；商务/机能男装。',
    nature_forest_dappled: '【自然】林间斑驳树影，绿色环境光；户外机能/徒步男装。',
  },
} as const;

/** 服装线扩展场景（含外景），供女装/男装/童装按品类筛选 */
export const CLOTHING_SHOOT_PRESETS = {
  enum: [
    ...STUDIO_SHOOT_PRESETS.enum,
    'beach_golden_sunset',
    'resort_poolside',
    'nature_meadow_park',
    'urban_rooftop_golden',
    'urban_subway_concourse',
    'urban_glass_facade',
    'nature_forest_dappled',
  ],
  labels: [
    ...STUDIO_SHOOT_PRESETS.labels,
    '海边 · 日落金色海滩',
    '海边 · 度假村泳池畔',
    '自然 · 公园草坪',
    '城市 · 屋顶天际线黄昏',
    '城市 · 地铁车站纵深',
    '城市 · 玻璃幕墙倒影',
    '自然 · 林缘斑驳光',
  ],
  descriptions: {
    ...STUDIO_SHOOT_PRESETS.descriptions,
    beach_golden_sunset:
      '【海边】日落金时刻，暖橙天空，长影与轮廓光，浪漫度假女装/泳装；强调裙摆/垂坠与暖调肤色（若可见肢体）。',
    resort_poolside: '【海边】泳池畔或躺椅区，水面高光，奢华休闲；泳装/度假系列，高 key 但仍保留环境层次。',
    nature_meadow_park: '【自然】公园草坪与树影，柔光清新；女装生活系/童装户外系列，低饱和自然绿环境光。',
    urban_rooftop_golden: '【城市】屋顶围栏+天际线，日落侧光，风感衣摆；都市女装/轻商务，禁可读招牌。',
    urban_subway_concourse:
      '【城市】地铁/高铁长廊，线性灯带+冷白反射；男装通勤/机能风，强调挺括轮廓与纵深，禁站台文字。',
    urban_glass_facade: '【城市】玻璃幕墙前蓝灰反射；商务男装/极简都会，结构线条清晰。',
    nature_forest_dappled: '【自然】林间斑驳光，绿色环境光；户外机能/工装/徒步男装，面料机能感可读。',
  },
} as const;

export function shootPresetField(defaultValue: string, presetKeys?: readonly string[]) {
  const allEnum = CLOTHING_SHOOT_PRESETS.enum;
  const allLabels = CLOTHING_SHOOT_PRESETS.labels;
  const enumList = presetKeys ? [...presetKeys] : [...allEnum];
  const labelList = enumList.map((key) => {
    const idx = allEnum.indexOf(key as (typeof allEnum)[number]);
    return idx >= 0 ? allLabels[idx] : key;
  });
  const descriptions: Record<string, string> = {};
  for (const key of enumList) {
    const desc = (CLOTHING_SHOOT_PRESETS.descriptions as Record<string, string>)[key];
    if (desc) descriptions[key] = desc;
  }
  return {
    type: 'string',
    title: '拍摄场景',
    description: '无「场景参考图」时由本项决定环境/背景/光线氛围；有场景参考图时本项仅作补充说明。',
    'x-ui-type': 'selection',
    enum: enumList,
    'x-enum-labels': labelList,
    default: defaultValue,
    'x-enum-descriptions': descriptions,
  };
}

export function shootFocusField(opts: {
  title?: string;
  enum: string[];
  labels: string[];
  descriptions: Record<string, string>;
  default: string;
}) {
  return {
    type: 'string',
    title: opts.title ?? '拍摄侧重点',
    description: '本单最想卖清楚的视觉信息；英文 prompt 须优先安排构图、景别与布光以服务此项。',
    'x-ui-type': 'selection',
    enum: opts.enum,
    'x-enum-labels': opts.labels,
    'x-enum-descriptions': opts.descriptions,
    default: opts.default,
  };
}

export const WOMEN_SHOOT_FOCUS = shootFocusField({
  title: '女装拍摄侧重点',
  enum: ['silhouette_drape', 'waist_hemline', 'neckline_sleeve', 'fabric_flow', 'full_lookbook'],
  labels: ['轮廓与垂坠', '腰线与裙裤长', '领口与袖型', '面料流动感', '全身 lookbook'],
  descriptions: {
    silhouette_drape: '优先全身或 3/4 身，强调女性 S/A/H 轮廓、摆围与侧缝线条；镜头略低或 eye-level 保留裙裤摆型。',
    waist_hemline: '腰上/腰下分段卖款：腰线位置、高腰/中腰/低腰、裙长/裤长/开衩高度必须可读。',
    neckline_sleeve: '胸上 hero：领型（V/方/一字/挂脖）、袖笼、袖口、肩带/蝴蝶结等女性化结构为画面中心。',
    fabric_flow: '真丝/雪纺/针织等强调垂坠、飘逸、褶皱方向与高光流动；可配合轻转身或步行带风。',
    full_lookbook: '平衡展示全身搭配与氛围，适合连衣裙/套装；仍须 SKU 锁定，非时尚大片叙事。',
  },
  default: 'silhouette_drape',
});

export const MEN_SHOOT_FOCUS = shootFocusField({
  title: '男装拍摄侧重点',
  enum: ['shoulder_chest', 'structure_tailoring', 'trouser_break', 'fabric_weave', 'full_catalog'],
  labels: ['肩胸版型', '结构与剪裁', '裤长与 break', '面料肌理', '全身 catalog'],
  descriptions: {
    shoulder_chest: '肩线落点、胸宽余量、袖山与袖笼为绝对主体；站姿肩背平直，禁含胸塌肩。',
    structure_tailoring: '门襟、驳领、省道、口袋位置、下摆弧度；西装/夹克/衬衫卖剪裁与挺括度。',
    trouser_break: '裤脚与鞋面关系（no break / slight break / full break）、裤线、中缝、腰头/门襟必须入镜。',
    fabric_weave: '牛仔斜纹、粗花呢颗粒、牛津纺织纹、皮革粒面等肌理清晰；侧光微反差。',
    full_catalog: '全身 catalog 标准站姿，头到鞋完整，结构信息与比例并重；白棚/浅灰优先。',
  },
  default: 'shoulder_chest',
});

export const KIDS_SHOOT_FOCUS = shootFocusField({
  title: '童装拍摄侧重点',
  enum: ['size_proportion', 'print_pattern', 'soft_comfort', 'playful_wear', 'detail_trim'],
  labels: ['尺码比例', '印花图案', '柔软舒适', '活泼穿着', '细节与辅料'],
  descriptions: {
    size_proportion: '儿童头身比、袖长/裤长相对身形、版型宽松度必须准确；避免按成人比例生成。',
    print_pattern: '卡通/印花/刺绣/贴布图案颜色与位置锁定，macro 与全身各须可读。',
    soft_comfort: '针织/棉毛圈/法兰绒等软感面料，强调蓬松、亲肤与柔软垂坠；柔光均匀。',
    playful_wear: '跑跳、提衣角、拉帽绳等活泼动作，能量感自然；全身穿拍展示动态版型。',
    detail_trim: '按扣、拉链、帽兜、口袋、罗纹袖口等辅料与做工细节可读。',
  },
  default: 'size_proportion',
});

export const ROUTING = {
  provider: 'qhai',
  model: 'gpt-image-2-all',
  enabled: true,
  margin: 0.2,
  charge_metric: 'per_image',
  sensitive_word_lists: [] as string[],
};

export const TEXT_FORMAT_KEY = 'text/format/gpt-image-2';

export const GENERATE_PARAMS = {
  temperature: 0.32,
  maxTokens: 2048,
};

export const UI_SCHEMA = {
  prompt: { 'ui:widget': 'textarea', 'ui:options': { rows: 3 } },
};

export const STYLE_IMAGES = refImagesField({
  key: 'style_images',
  title: '风格参考（可选）',
  description:
    '仅学习摄影/调色风格：色调、对比、景深、构图与氛围；不得复制参考中的具体商品、人物身份或品牌 Logo。若与 SKU/模特参考冲突，以 SKU/模特为准。',
  minItems: 0,
  maxItems: 8,
  defaultType: 'style-reference',
});

export const ENVIRONMENT_IMAGES = refImagesField({
  key: 'environment_images',
  title: '场景参考（可选）',
  description: '有上传时以参考图的空间、光线与色调为准；「拍摄场景」仅作氛围补充，不得覆盖参考像素。',
  minItems: 0,
  maxItems: 6,
  defaultType: 'background',
});

export const MODEL_IMAGES = refImagesField({
  key: 'model_images',
  title: '模特参考',
  description: '「默认」时建议上传以锁定面部与身形；「去模特身份」时可选（仅作体态参考）；「无模特」时可不上传。',
  minItems: 0,
  maxItems: 8,
  defaultType: 'main-subject',
});

/** 服装类通用材质枚举（女装/男装/童装共用） */
export const GARMENT_MATERIAL = {
  type: 'string',
  title: '服装质感（补充）',
  description: '参考图面料不清或识别错误时指定；默认「以参考图为准」不额外写入材质词。',
  'x-ui-type': 'selection',
  enum: [
    'use_reference_only',
    'cotton',
    'cotton_linen',
    'linen',
    'silk_satin',
    'chiffon_georgette',
    'denim',
    'wool_knit',
    'cashmere',
    'leather_suede',
    'faux_leather',
    'mesh_lace',
    'tulle_organza',
    'velvet',
    'corduroy',
    'tweed',
    'down_puffy',
    'functional_shell',
    'sequin_embellished',
    'synthetic_blend',
    'metal_trim',
  ],
  'x-enum-labels': [
    '以参考图为准',
    '纯棉',
    '棉麻',
    '亚麻',
    '真丝/缎面',
    '雪纺/乔其',
    '牛仔',
    '羊毛/针织',
    '羊绒',
    '真皮/绒面革',
    '仿皮革 PU',
    '网纱/蕾丝',
    '欧根纱/硬纱',
    '丝绒',
    '灯芯绒',
    '粗花呢',
    '羽绒/蓬松填充',
    '机能防水防风',
    '亮片/珠片',
    '化纤/混纺',
    '金属辅料/链饰',
  ],
  default: 'use_reference_only',
} as const;

export const COMMON_TEMPLATE_HEADER = `【角色】你是资深「跨境电商商品上架摄影」美术指导 + 英文 image prompt 撰稿人。下游把你的英文正文交给 gpt-image-2 类模型；参考图像素已由系统随请求提交，你不得粘贴 base64/URL。

【text/format 生成契约】①「一、重要的用户要求」永远优先；②用户未写的维度才允许用「四、相关参考」与内嵌词表补全；③与参考像素矛盾的一律不写。

【硬约束 · 纯摄影视觉】本任务只做**商拍/静物/穿戴展示摄影**，禁止生成营销文案、价格标签、促销海报、信息图排版、多段文字排版或画报设计。画面可读文字仅限极少量不可辨识的虚化背景元素；negatives 须含 no readable text, no price tags, no promotional copy, no infographic layout, no poster design.`;

export const MODEL_PARTICIPATION_BLOCK = `**模特参与度（硬，优先于本节其余默认表述）**
- **default（默认）**：可出现完整真人模特。模特参考非空时必须 **identity lock**（同一人）；姿态/景别可变化，禁止换脸换模特。无模特参考时生成可信真人穿着/佩戴，但以商品为叙事中心。
- **face_hidden（去模特身份）**：画幅顶部在下巴/下唇以下；禁止清晰五官。优先背影、胸腰以下、低头顶裁出画外。英文必写 cropped above lower lip, no eyes in frame；negatives 含 no visible face, no portrait beauty shot。
- **no_model（无模特）**：禁止真人、人手、可识别皮肤。仅商品静物/挂拍/支架/鬼影人台（服装）或纯产品陈列（非服装）。`;

export const STYLE_REF_BLOCK = `- **风格参考（style-only，硬）**：只可迁移摄影美学（色调、对比、景深、构图、颗粒）；禁止复制商品款式、人物、Logo。英文可写 match photographic style language only; do not copy products or identities from style refs.
- **场景参考 vs 风格参考**：场景管「在哪里、什么光」；风格管「影调与镜头语言」。`;

export const OUTPUT_BLOCK = `五、Prompt 输出参考（英文正文结构与禁忌）
- 建议顺序（一段连续英文，无 Markdown）：setting → model participation rule（若适用）→ SKU/product identity lock → photographic style language（仅当风格参考非空）→ product/wardrobe detail → lens + DoF → light → composition → negatives（no logos; no readable text; no poster/infographic; 按参与度加 no face / no human）。
- 若「输出宫格」为 2×2 或 3×3：开头声明 single canvas N×N contact sheet、等分格。
- 禁止：中文解释、Markdown、编号清单。

【输出】只输出最终生图用英文 prompt 正文，不要解释或 Markdown。`;
