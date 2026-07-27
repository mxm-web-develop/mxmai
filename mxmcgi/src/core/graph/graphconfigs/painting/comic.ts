/**
 * 绘画 - 漫画（comic）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PaintingParams } from '../../type';

export type ComicOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 comic 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildComicUserPrompt(
  params: PaintingParams,
  outputLanguage: ComicOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    comicStyle,
    panelLayout,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的漫画作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为漫画主体，保持漫画特征、风格、线条完全一致。'
      : '主体描述：一个漫画场景（可根据用户需求和业务参数自动补全具体内容），整体风格与用户需求和业务参数相匹配。';

    const styleLine = `漫画风格：${comicStyle || '根据设计需求选择合适的漫画风格'}，${(() => {
      if (comicStyle === 'american') return '美式风格，粗犷有力，动态感强';
      if (comicStyle === 'japanese') return '日式风格，细腻精致，情感丰富';
      if (comicStyle === 'european') return '欧式风格，艺术感强，风格独特';
      if (comicStyle === 'webtoon') return '网络漫画风格，现代简洁，视觉冲击力强';
      return '根据设计需求营造相应的漫画风格';
    })()}`;

    const layoutLine = `分镜布局：${panelLayout || '根据故事需求选择合适的分镜布局'}，${(() => {
      if (panelLayout === 'single') return '单格布局，突出重点，视觉冲击力强';
      if (panelLayout === 'multi') return '多格布局，叙事性强，节奏感好';
      if (panelLayout === 'spread') return '跨页布局，宏大场景，视觉震撼';
      if (panelLayout === 'strip') return '条状布局，连续叙事，节奏流畅';
      return '根据故事需求营造相应的分镜布局';
    })()}`;

    const lineLine =
      '线条表现：使用清晰的线条，突出角色和场景，线条应与风格和主题协调统一。';

    const dynamicLine =
      '动态感：营造动态感和节奏感，通过构图、线条、动作等手段增强动态感。';

    const narrativeLine =
      '叙事性要求：确保画面具有叙事性，能够传达故事，叙事应与风格和主题协调统一。';

    const detailLine =
      '细节与质感：漫画细节精致，线条清晰，色彩准确，整体画质专业级，具有叙事价值和艺术价值。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合漫画展示。`
      : '输出规格：画面比例以横向或方形构图为主，适合漫画展示。';

    return [
      '你是一位专业漫画家。',
      taskLine,
      subjectLine,
      styleLine,
      layoutLine,
      lineLine,
      dynamicLine,
      narrativeLine,
      detailLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文漫画提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high-quality comic work.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main comic, keeping the comic characteristics, style, and lines exactly consistent.'
    : 'Subject: a comic scene (specific content can be automatically completed based on user needs and business parameters), with overall style matching user needs and business parameters.';

  const styleLineEn = `Comic Style: ${comicStyle || 'choose appropriate comic style based on design needs'}, ${(() => {
    if (comicStyle === 'american') return 'American style, bold and powerful, strong dynamism';
    if (comicStyle === 'japanese') return 'Japanese style, delicate and refined, rich emotions';
    if (comicStyle === 'european') return 'European style, strong artistic feel, unique style';
    if (comicStyle === 'webtoon') return 'Webtoon style, modern and simple, strong visual impact';
    return 'create corresponding comic style based on design needs';
  })()}`;

  const layoutLineEn = `Panel Layout: ${panelLayout || 'choose appropriate panel layout based on story needs'}, ${(() => {
    if (panelLayout === 'single') return 'single panel, highlighting key points, strong visual impact';
    if (panelLayout === 'multi') return 'multi-panel, strong narrative, good rhythm';
    if (panelLayout === 'spread') return 'spread layout, grand scenes, visual震撼';
    if (panelLayout === 'strip') return 'strip layout, continuous narrative, smooth rhythm';
    return 'create corresponding panel layout based on story needs';
  })()}`;

  const lineLineEn =
    'Line Art: use clear lines, highlighting characters and scenes, lines should coordinate with style and theme.';

  const dynamicLineEn =
    'Dynamism: create dynamism and rhythm, enhancing dynamism through composition, lines, actions, etc.';

  const narrativeLineEn =
    'Narrative: ensure the frame has narrative quality, able to convey story, narrative should coordinate with style and theme.';

  const detailLineEn =
    'Details & Texture: refined comic details, clear lines, accurate colors, overall professional image quality with narrative and artistic value.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for comic display.`
    : 'Output Spec: horizontal or square composition suitable for comic display.';

  return [
    'You are a professional comic artist.',
    taskLineEn,
    subjectLineEn,
    styleLineEn,
    layoutLineEn,
    lineLineEn,
    dynamicLineEn,
    narrativeLineEn,
    detailLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent comic prompt text.',
  ].join('\n');
}
