/**
 * 分镜脚本（storyboard-scripts）写作类型 - 客户端表单选项
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const storyboardFormOptionsZh: FormOptionsConfig = {
  genre: [
    { value: 'drama', label: '剧情', labelEn: 'Drama' },
    { value: 'comedy', label: '喜剧', labelEn: 'Comedy' },
    { value: 'action', label: '动作', labelEn: 'Action' },
    { value: 'thriller', label: '惊悚', labelEn: 'Thriller' },
    { value: 'romance', label: '爱情', labelEn: 'Romance' },
    { value: 'sci-fi', label: '科幻', labelEn: 'Sci-Fi' },
    { value: 'horror', label: '恐怖', labelEn: 'Horror' },
    { value: 'other', label: '其他', labelEn: 'Other' },
  ],
  targetAudience: [
    { value: 'general', label: '大众', labelEn: 'General' },
    { value: 'adult', label: '成人', labelEn: 'Adult' },
    { value: 'youth', label: '青少年', labelEn: 'Youth' },
    { value: 'children', label: '儿童', labelEn: 'Children' },
    { value: 'elderly', label: '中老年', labelEn: 'Elderly' },
  ],
  rhythm: [
    { value: 'fast-cut', label: '快剪（大量转场、极短镜头）', labelEn: 'Fast-cut (many transitions, very short shots)' },
    { value: 'fast', label: '快节奏（镜头不超过 4 秒）', labelEn: 'Fast (shots ≤ 4s)' },
    { value: 'narrative', label: '叙事节奏（4–8 秒混合镜头）', labelEn: 'Narrative (4–8s mixed shots)' },
    { value: 'long-take', label: '长镜头（6–10 秒混合镜头）', labelEn: 'Long-take (6–10s mixed shots)' },
  ],
  storyboard_chunk_seconds: [
    { value: '4', label: '4 秒', labelEn: '4s' },
    { value: '5', label: '5 秒', labelEn: '5s' },
    { value: '8', label: '8 秒', labelEn: '8s' },
    { value: '10', label: '10 秒', labelEn: '10s' },
    { value: '15', label: '15 秒', labelEn: '15s' },
    { value: '20', label: '20 秒', labelEn: '20s' },
    { value: '25', label: '25 秒', labelEn: '25s' },
  ],
  _metadata: {
    sceneCount: { type: 'number', label: '场景数量', labelEn: 'Scene Count', placeholder: '例如：10', placeholderEn: 'e.g., 10', helpText: '预计的场景数量', helpTextEn: 'Expected number of scenes', min: 1, max: 100 },
    characterCount: { type: 'number', label: '角色数量', labelEn: 'Character Count', placeholder: '例如：5', placeholderEn: 'e.g., 5', helpText: '主要角色数量', helpTextEn: 'Number of main characters', min: 1, max: 50 },
    duration: { type: 'number', label: '时长（秒）', labelEn: 'Duration (seconds)', placeholder: '30', placeholderEn: '30', helpText: '脚本总时长，单位：秒（默认30秒）', helpTextEn: 'Total script duration in seconds (default: 30)', min: 1, max: 3600 },
    genre: { type: 'select', label: '类型', labelEn: 'Genre', helpText: '选择内容类型', helpTextEn: 'Select the content genre' },
    targetAudience: { type: 'select', label: '目标受众', labelEn: 'Target Audience', helpText: '选择目标受众', helpTextEn: 'Select the target audience' },
    rhythm: { type: 'select', label: '节奏', labelEn: 'Rhythm', helpText: '控制每个 chunk 内镜头数量与镜头时长：快剪/快节奏/叙事节奏/长镜头', helpTextEn: 'Controls number and length of shots per chunk: fast-cut / fast / narrative / long-take' },
    productInfo: { type: 'textarea', label: '产品/内容信息', labelEn: 'Product/Content Information', placeholder: '请描述产品特点、功能、优势等（广告脚本）或内容主题（其他类型）...', placeholderEn: 'Describe product features (for commercials) or content theme (for other types)...', helpText: '用于广告脚本时描述产品信息，其他类型时描述内容主题', helpTextEn: 'Product info for commercials, content theme for other types' },
    callToAction: { type: 'text', label: '行动号召', labelEn: 'Call to Action', placeholder: '例如：立即购买、了解更多等（可选）', placeholderEn: 'e.g., Buy now, Learn more (optional)', helpText: '结尾的行动号召语（主要用于广告脚本）', helpTextEn: 'Call to action at the end (mainly for commercial scripts)' },
    storyboard_chunk_seconds: { type: 'select', label: '每段时长（秒）', labelEn: 'Chunk duration (seconds)', helpText: '每个分镜 chunk 的时长，对应常见视频生成模型单段时长；默认 15 秒', helpTextEn: 'Duration per storyboard chunk in seconds; default 15' },
    storyboard_total_duration_seconds: { type: 'number', label: '期望总时长（秒）', labelEn: 'Expected total duration (seconds)', placeholder: '60', placeholderEn: '60', helpText: '期望成片总时长（秒），至少为一个 chunk 时长；影响生成的 chunk 数量，无大纲时生效', helpTextEn: 'Expected total duration in seconds (≥ one chunk); affects chunk count when no outline', min: 4, max: 3600 },
  },
};

function asOpts(arr: FormOption[] | undefined): FormOption[] {
  return (arr || []).map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value }));
}

export function getStoryboardScriptsFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    const m = storyboardFormOptionsZh._metadata as any;
    return {
      genre: asOpts(storyboardFormOptionsZh.genre as FormOption[]),
      targetAudience: asOpts(storyboardFormOptionsZh.targetAudience as FormOption[]),
      rhythm: asOpts(storyboardFormOptionsZh.rhythm as FormOption[]),
      storyboard_chunk_seconds: asOpts(storyboardFormOptionsZh.storyboard_chunk_seconds as FormOption[]),
      _metadata: {
        sceneCount: { ...m.sceneCount, label: m.sceneCount.labelEn || 'Scene Count', placeholder: m.sceneCount.placeholderEn, helpText: m.sceneCount.helpTextEn },
        characterCount: { ...m.characterCount, label: m.characterCount.labelEn || 'Character Count', placeholder: m.characterCount.placeholderEn, helpText: m.characterCount.helpTextEn },
        duration: { ...m.duration, label: m.duration.labelEn || 'Duration (seconds)', placeholder: m.duration.placeholderEn, helpText: m.duration.helpTextEn },
        genre: { ...m.genre, label: m.genre.labelEn || 'Genre', helpText: m.genre.helpTextEn },
        targetAudience: { ...m.targetAudience, label: m.targetAudience.labelEn || 'Target Audience', helpText: m.targetAudience.helpTextEn },
        rhythm: { ...m.rhythm, label: m.rhythm.labelEn || 'Rhythm', helpText: m.rhythm.helpTextEn },
        productInfo: { ...m.productInfo, label: m.productInfo.labelEn || 'Product/Content Information', placeholder: m.productInfo.placeholderEn, helpText: m.productInfo.helpTextEn },
        callToAction: { ...m.callToAction, label: m.callToAction.labelEn || 'Call to Action', placeholder: m.callToAction.placeholderEn, helpText: m.callToAction.helpTextEn },
        storyboard_chunk_seconds: { ...m.storyboard_chunk_seconds, label: m.storyboard_chunk_seconds?.labelEn || 'Chunk duration (seconds)', helpText: m.storyboard_chunk_seconds?.helpTextEn },
        storyboard_total_duration_seconds: { ...m.storyboard_total_duration_seconds, label: m.storyboard_total_duration_seconds?.labelEn || 'Expected total duration (seconds)', placeholder: m.storyboard_total_duration_seconds?.placeholderEn, helpText: m.storyboard_total_duration_seconds?.helpTextEn },
      },
    };
  }
  return storyboardFormOptionsZh;
}
