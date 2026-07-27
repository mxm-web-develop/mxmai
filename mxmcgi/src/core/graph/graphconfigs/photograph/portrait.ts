/**
 * 摄影 - 人像（portrait）
 * V2：规则与输出格式由 Admin「提示词工程」提供；此处仅保留结构化用户需求草稿 helper。
 */
import type { PhotographParams } from '../../type';

export type PortraitOutputLanguage = 'zh' | 'en';

/**
 * 根据业务参数 + 参考图 + 用户原始 prompt，生成结构化的 portrait 用户需求草稿
 * 供 graph-service 在部分类型下拼装 effectiveUserPrompt（与 DB rules 分离）
 */
export function buildPortraitUserPrompt(
  params: PhotographParams,
  outputLanguage: PortraitOutputLanguage
): string {
  const {
    prompt: rawPrompt,
    style,
    tone,
    environment,
    makeup,
    pose,
    lighting,
    aspect_ratio,
    referenceImage,
  } = params;

  const hasRef = !!referenceImage;

  if (outputLanguage === 'zh') {
    const taskLine = rawPrompt ? `任务：${rawPrompt}` : '任务：生成一张高质量的人像摄影作品。';

    const subjectLine = hasRef
      ? '主体描述：参考 Image 1 作为人物主体，保持脸部、五官、发型、身材完全一致。'
      : '主体描述：一位人物主体（性别、年龄感与气质可根据业务场景自动补全），整体气质与用户需求和业务参数相匹配。';

    const sceneLine = `场景与构图：${environment || '根据业务需求选择合适的室内或室外环境'}，使用经典人像构图（如三分法），主体清晰，背景虚化，构图自然协调。`;

    const lightingLine = `光线与氛围：${lighting || '使用柔和的人像光线'}，整体色调偏 ${
      tone || '自然肤色'
    }，营造高级、立体的光影氛围。`;

    const styleLine = `色彩与风格：整体风格偏 ${
      style || '现代时尚'
    }，画面色彩统一，避免杂色干扰，突出人物气质。`;

    const poseLine = `表情与姿势：根据场景与人物设定，安排自然优雅的姿势与表情（例如：轻微微笑、自然放松的身体姿态），避免僵硬。`;

    const detailLine =
      '细节与质感：皮肤保留自然纹理与合理修饰，衣服褶皱与材质质感真实可信，头发与眼神细节清晰，整体画质专业级。';

    const photographerLine =
      '摄影师风格参考：如用户提供了参考摄影师或作品，可在风格上向其靠拢（例如：像时尚杂志封面一样的高级感），但避免直接抄袭。';

    const specLine = aspect_ratio
      ? `输出规格：画面比例为 ${aspect_ratio}，画面构图适合人像主体展示。`
      : '输出规格：画面比例以中景人像竖构图为主，适合封面或海报用途。';

    return [
      '你是一位时尚杂志肖像摄影师。',
      taskLine,
      subjectLine,
      sceneLine,
      lightingLine,
      styleLine,
      poseLine,
      detailLine,
      photographerLine,
      specLine,
      '请在 500 字以内，根据以上要素整合为一段流畅的中文人像摄影提示词。',
    ].join('\n');
  }

  // 英文版本
  const taskLineEn = rawPrompt
    ? `Task: ${rawPrompt}`
    : 'Task: generate a high‑quality portrait photograph.';

  const subjectLineEn = hasRef
    ? 'Subject: use Image 1 as the main subject, keeping the face, facial features, hairstyle and body shape exactly consistent.'
    : 'Subject: a human portrait whose gender, age impression and temperament should match the business scenario and user intent.';

  const sceneLineEn = `Scene & Composition: ${
    environment || 'choose an appropriate indoor or outdoor setting'
  }, using classic portrait composition (e.g. rule of thirds), clear subject with softly blurred background.`;

  const lightingLineEn = `Lighting & Atmosphere: ${
    lighting || 'soft portrait lighting'
  }, overall color tone tends to ${tone || 'natural skin tone'}, creating a refined, dimensional mood.`;

  const styleLineEn = `Color & Style: overall style ${
    style || 'modern fashion'
  }, with unified color palette and no distracting colors, emphasizing the subject’s temperament.`;

  const poseLineEn =
    'Expression & Pose: natural, elegant poses and expressions that fit the scene (e.g. gentle smile, relaxed body posture), avoiding stiffness.';

  const detailLineEn =
    'Details & Texture: preserve natural skin texture with appropriate retouching, realistic clothing folds and fabric texture, clear hair and eye details, overall professional image quality.';

  const photographerLineEn =
    'Photographer Style Reference: if a reference photographer or work is provided, align the mood and style with it (e.g. like a fashion magazine cover) without directly copying.';

  const specLineEn = aspect_ratio
    ? `Output Spec: aspect ratio ${aspect_ratio}, composition suitable for portrait display.`
    : 'Output Spec: vertical portrait composition suitable for cover or poster usage.';

  return [
    'You are a fashion magazine portrait photographer.',
    taskLineEn,
    subjectLineEn,
    sceneLineEn,
    lightingLineEn,
    styleLineEn,
    poseLineEn,
    detailLineEn,
    photographerLineEn,
    specLineEn,
    'Within about 300 English words, integrate the above elements into a single fluent portrait photography prompt text.',
  ].join('\n');
}
