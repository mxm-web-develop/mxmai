/**
 * 摄影 - 纪事（documentary）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PhotographParams } from '../../type';

export type DocumentaryOutputLanguage = 'zh' | 'en';

export const documentaryConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级纪实摄影师，擅长创作真实的纪实摄影作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的纪实摄影提示词（prompt）。

【纪实摄影专业要求】
1. 事件类型：
   - 根据用户选择的事件类型（新闻、社会、文化、历史等）调整拍摄方式
   - 不同事件需要不同的记录重点和表现方式
2. 纪实风格：
   - 根据用户选择的纪实风格（抓拍、摆拍、环境肖像等）调整拍摄方式
   - 抓拍：自然真实，捕捉瞬间；摆拍：精心构图，突出主题；环境肖像：人物与环境结合
3. 真实性：
   - 保持画面的真实性和自然性，避免过度修饰
   - 真实记录事件和环境，展现真实场景
4. 环境记录：
   - 真实记录环境，展现事件发生的真实场景
   - 环境信息有助于理解事件背景
5. 情感表达：
   - 捕捉真实的情感和瞬间
   - 通过画面传达事件的情感和意义
6. 构图原则：
   - 使用纪实摄影的构图原则，突出故事性
   - 构图应服务于内容，而非单纯追求美观

【提示词生成要求】
- 使用专业纪实摄影术语，语言自然流畅
- 提示词应覆盖：事件描述、纪实风格、环境场景、情感表达、构图方式、真实性要求等核心要素
- 结合业务参数（eventType、documentaryStyle 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含事件描述，纪实风格，环境场景，情感表达，构图方式，真实性要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 documentary 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
 */
export function buildDocumentaryUserPrompt(
  params: PhotographParams,
  outputLanguage: DocumentaryOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    eventType,
    documentaryStyle,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张真实的纪实摄影作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为场景主体，保持场景特征、光线氛围、真实感完全一致。'
      : `主体描述：${eventType ? `${eventType}事件` : '一个纪实场景'}（可根据用户需求和业务参数自动补全具体内容），整体氛围与用户需求和业务参数相匹配。`;

    const styleLine = `纪实风格：${documentaryStyle || '根据事件需求选择合适的纪实风格'}，${(() => {
      if (documentaryStyle === 'candid') return '抓拍风格，自然真实，捕捉瞬间，展现真实情感';
      if (documentaryStyle === 'posed') return '摆拍风格，精心构图，突出主题，展现事件意义';
      if (documentaryStyle === 'environmental') return '环境肖像风格，人物与环境结合，展现事件背景';
      if (documentaryStyle === 'street') return '街头纪实风格，捕捉日常生活，展现社会真实';
      return '根据事件需求营造相应的纪实风格';
    })()}`;

    const eventLine = eventType
      ? `事件类型：${eventType}，真实记录事件和环境，展现事件发生的真实场景。`
      : '事件类型：根据场景需求真实记录事件和环境，展现事件发生的真实场景。';

    const authenticityLine =
      '真实性要求：保持画面的真实性和自然性，避免过度修饰，真实记录环境，展现真实场景。';

    const emotionLine =
      '情感表达：捕捉真实的情感和瞬间，通过画面传达事件的情感和意义，展现人文关怀。';

    const compositionLine =
      '构图方式：使用纪实摄影的构图原则，突出故事性，构图应服务于内容，而非单纯追求美观。';

    const detailLine =
      '细节与质感：画面细节真实，质感自然，色彩还原真实，整体画质专业级，具有纪实价值和人文意义。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合纪实摄影展示。`
      : '输出规格：画面比例以标准构图为主，适合纪实摄影展示。';

    return [
      '你是一位专业纪实摄影师。',
      taskLine,
      subjectLine,
      styleLine,
      eventLine,
      authenticityLine,
      emotionLine,
      compositionLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文纪实摄影提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate an authentic documentary photograph.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main scene, keeping the scene characteristics, lighting atmosphere, and authenticity exactly consistent.'
    : `Subject: ${eventType ? `${eventType} event` : 'a documentary scene'} (specific content can be automatically completed based on user needs and business parameters), with overall atmosphere matching user needs and business parameters.`;

  const styleLineEn = `Documentary Style: ${documentaryStyle || 'choose appropriate documentary style based on event needs'}, ${(() => {
    if (documentaryStyle === 'candid') return 'candid style, natural and authentic, capturing moments, showing real emotions';
    if (documentaryStyle === 'posed') return 'posed style, carefully composed, highlighting theme, showing event significance';
    if (documentaryStyle === 'environmental') return 'environmental portrait style, combining people and environment, showing event background';
    if (documentaryStyle === 'street') return 'street documentary style, capturing daily life, showing social reality';
    return 'create corresponding documentary style based on event needs';
  })()}`;

  const eventLineEn = eventType
    ? `Event Type: ${eventType}, authentically recording events and environment, showing the real scene where the event occurred.`
    : 'Event Type: authentically recording events and environment based on scene needs, showing the real scene where the event occurred.';

  const authenticityLineEn =
    'Authenticity: maintain authenticity and naturalness of the frame, avoid excessive retouching, authentically record environment, showing real scenes.';

  const emotionLineEn =
    'Emotional Expression: capture authentic emotions and moments, convey event emotions and significance through the frame, showing humanistic care.';

  const compositionLineEn =
    'Composition: use documentary photography composition principles, highlighting storytelling, composition should serve content rather than merely pursuing aesthetics.';

  const detailLineEn =
    'Details & Texture: authentic scene details, natural texture, realistic color reproduction, overall professional image quality with documentary value and humanistic significance.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for documentary photography display.`
    : 'Output Spec: standard composition suitable for documentary photography display.';

  return [
    'You are a professional documentary photographer.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    eventLineEn,
    authenticityLineEn,
    emotionLineEn,
    compositionLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent documentary photography prompt text.',
  ].join('\n');
}

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（eventType, documentaryStyle）动态生成对应的专业指导
 */
export function generateDefaultDocumentaryKnowledge(params: PhotographParams): string {
  const { eventType, documentaryStyle } = params;
  
  const parts: string[] = [];
  
  // 事件类型
  const eventTips: string[] = [];
  if (eventType) {
    eventTips.push(`事件类型：${eventType}`);
    if (eventType.includes('新闻') || eventType.includes('news')) {
      eventTips.push('新闻事件，注重时效性和真实性，突出事件关键信息');
    } else if (eventType.includes('社会') || eventType.includes('social')) {
      eventTips.push('社会事件，注重人文关怀和社会意义，展现社会真实');
    } else if (eventType.includes('文化') || eventType.includes('culture')) {
      eventTips.push('文化事件，注重文化内涵和传统价值，展现文化特色');
    } else if (eventType.includes('历史') || eventType.includes('history')) {
      eventTips.push('历史事件，注重历史价值和纪念意义，展现历史真实');
    }
  } else {
    eventTips.push('根据事件类型调整拍摄方式，真实记录事件和环境');
  }
  parts.push(`【事件类型】\n${eventTips.join('，')}。`);
  
  // 纪实风格
  const styleTips: string[] = [];
  if (documentaryStyle === 'candid') {
    styleTips.push('抓拍风格，自然真实，捕捉瞬间，展现真实情感');
    styleTips.push('不干扰被摄对象，捕捉自然瞬间');
  } else if (documentaryStyle === 'posed') {
    styleTips.push('摆拍风格，精心构图，突出主题，展现事件意义');
    styleTips.push('精心构图，突出主题和意义');
  } else if (documentaryStyle === 'environmental') {
    styleTips.push('环境肖像风格，人物与环境结合，展现事件背景');
    styleTips.push('人物与环境结合，展现事件背景');
  } else if (documentaryStyle === 'street') {
    styleTips.push('街头纪实风格，捕捉日常生活，展现社会真实');
    styleTips.push('捕捉日常生活，展现社会真实');
  } else {
    styleTips.push('根据事件需求营造相应的纪实风格');
  }
  parts.push(`【纪实风格】\n${styleTips.join('，')}。`);
  
  // 真实性
  parts.push(`【真实性】\n保持画面的真实性和自然性，避免过度修饰，真实记录环境，展现真实场景。`);
  
  // 环境记录
  parts.push(`【环境记录】\n真实记录环境，展现事件发生的真实场景，环境信息有助于理解事件背景。`);
  
  // 情感表达
  parts.push(`【情感表达】\n捕捉真实的情感和瞬间，通过画面传达事件的情感和意义，展现人文关怀。`);
  
  // 构图原则
  parts.push(`【构图原则】\n使用纪实摄影的构图原则，突出故事性，构图应服务于内容，而非单纯追求美观。`);
  
  // 镜头与画质
  parts.push(`【镜头与画质】\n使用标准镜头（35mm、50mm）或广角镜头（24mm），自然透视，整体画质专业级，具有纪实价值和人文意义。`);
  
  return parts.join('\n\n');
}
