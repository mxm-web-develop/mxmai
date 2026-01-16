/**
 * 绘画 - 漫画（comic）配置
 * 参考 portrait.ts 的设计：提供 rules + outputformat + 构造用户需求草稿的 helper
 */
import type { PaintingParams } from '../../type';

export type ComicOutputLanguage = 'zh' | 'en';

export const comicConfig = {
  /**
   * 角色设定 + 专业规范（给 LLM 看的规则）
   */
  rules: `你是一位顶级漫画家，擅长创作高质量的漫画作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的漫画提示词（prompt）。

【漫画专业要求】
1. 漫画风格：
   - 根据用户选择的漫画风格（美式、日式、欧式等）调整设计
   - 不同风格传达不同的视觉感受和文化特色
2. 分镜布局：
   - 根据用户选择的分镜布局（单格、多格、跨页等）组织画面
   - 分镜应服务于故事叙述，增强叙事性
3. 线条表现：
   - 使用清晰的线条，突出角色和场景
   - 线条应与风格和主题协调统一
4. 动态感：
   - 营造动态感和节奏感
   - 通过构图、线条、动作等手段增强动态感
5. 叙事性：
   - 确保画面具有叙事性，能够传达故事
   - 叙事应与风格和主题协调统一

【提示词生成要求】
- 使用专业漫画术语，语言自然流畅
- 提示词应覆盖：故事描述、漫画风格、分镜布局、线条表现、动态感、叙事性要求等核心要素
- 结合业务参数（comicStyle、panelLayout 等）做有针对性的细化描述
- 允许适度发挥创造力，但必须符合用户的核心需求和设定`,

  /**
   * 输出结构要求（让 LLM 知道 prompt 内部大概要包含哪些要素）
   */
  outputformat: `800字以内,要包含故事描述，漫画风格，分镜布局，线条表现，动态感，叙事性要求等重要信息`,
};

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 comic 用户需求草稿
 * 实际用于传给大模型，由大模型根据 rules + outputformat 进行最终整合
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

/**
 * 根据用户参数生成默认知识库内容（当召回失败时使用）
 * 根据用户的业务参数（comicStyle, panelLayout）动态生成对应的专业指导
 */
export function generateDefaultComicKnowledge(params: PaintingParams): string {
  const { comicStyle, panelLayout } = params;
  
  const parts: string[] = [];
  
  // 漫画风格
  const styleTips: string[] = [];
  if (comicStyle === 'american') {
    styleTips.push('美式风格，粗犷有力，动态感强');
    styleTips.push('粗犷的线条，强烈的动态感');
  } else if (comicStyle === 'japanese') {
    styleTips.push('日式风格，细腻精致，情感丰富');
    styleTips.push('细腻的线条，丰富的情感表达');
  } else if (comicStyle === 'european') {
    styleTips.push('欧式风格，艺术感强，风格独特');
    styleTips.push('艺术化的表现，独特的风格');
  } else if (comicStyle === 'webtoon') {
    styleTips.push('网络漫画风格，现代简洁，视觉冲击力强');
    styleTips.push('现代简洁的线条，强烈的视觉冲击');
  } else {
    styleTips.push('根据设计需求营造相应的漫画风格');
  }
  parts.push(`【漫画风格】\n${styleTips.join('，')}。`);
  
  // 分镜布局
  const layoutTips: string[] = [];
  if (panelLayout === 'single') {
    layoutTips.push('单格布局，突出重点，视觉冲击力强');
    layoutTips.push('单一画面，突出关键场景');
  } else if (panelLayout === 'multi') {
    layoutTips.push('多格布局，叙事性强，节奏感好');
    layoutTips.push('多个画面，连续叙事');
  } else if (panelLayout === 'spread') {
    layoutTips.push('跨页布局，宏大场景，视觉震撼');
    layoutTips.push('跨页画面，宏大场景');
  } else if (panelLayout === 'strip') {
    layoutTips.push('条状布局，连续叙事，节奏流畅');
    layoutTips.push('条状画面，连续叙事');
  } else {
    layoutTips.push('根据故事需求营造相应的分镜布局');
  }
  layoutTips.push('分镜应服务于故事叙述，增强叙事性');
  parts.push(`【分镜布局】\n${layoutTips.join('，')}。`);
  
  // 线条表现
  parts.push(`【线条表现】\n使用清晰的线条，突出角色和场景，线条应与风格和主题协调统一。`);
  
  // 动态感
  parts.push(`【动态感】\n营造动态感和节奏感，通过构图、线条、动作等手段增强动态感。`);
  
  // 叙事性
  parts.push(`【叙事性】\n确保画面具有叙事性，能够传达故事，叙事应与风格和主题协调统一。`);
  
  // 绘画技巧
  parts.push(`【绘画技巧】\n使用专业的漫画技巧，整体画质专业级，具有叙事价值和艺术价值。`);
  
  return parts.join('\n\n');
}
