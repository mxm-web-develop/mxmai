/**
 * 摄影 - 纪事（documentary）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PhotographParams } from '../../type';

export type DocumentaryOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 documentary 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
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
