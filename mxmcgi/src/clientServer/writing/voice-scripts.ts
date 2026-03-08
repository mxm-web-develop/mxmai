/**
 * 口播稿（voice-scripts）写作类型 - 客户端表单选项
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const voiceScriptsFormOptionsZh: FormOptionsConfig = {
  duration: [
    { value: '30s', label: '30秒', labelEn: '30 seconds' },
    { value: '1min', label: '1分钟', labelEn: '1 minute' },
    { value: '3min', label: '3分钟', labelEn: '3 minutes' },
    { value: '5min', label: '5分钟', labelEn: '5 minutes' },
    { value: '10min', label: '10分钟', labelEn: '10 minutes' },
  ],
  tone: [
    { value: 'friendly', label: '友好亲切', labelEn: 'Friendly' },
    { value: 'professional', label: '专业', labelEn: 'Professional' },
    { value: 'energetic', label: '充满活力', labelEn: 'Energetic' },
    { value: 'calm', label: '平静温和', labelEn: 'Calm' },
  ],
  targetAudience: [
    { value: 'general', label: '大众', labelEn: 'General' },
    { value: 'youth', label: '年轻人', labelEn: 'Youth' },
    { value: 'professional', label: '专业人士', labelEn: 'Professional' },
    { value: 'elderly', label: '中老年', labelEn: 'Elderly' },
  ],
  platform: [
    { value: 'podcast', label: '播客', labelEn: 'Podcast' },
    { value: 'video', label: '视频', labelEn: 'Video' },
    { value: 'live', label: '直播', labelEn: 'Live Stream' },
    { value: 'audio', label: '音频', labelEn: 'Audio' },
  ],
  _metadata: {
    duration: { type: 'select', label: '时长', labelEn: 'Duration', helpText: '选择口播时长', helpTextEn: 'Select the duration' },
    tone: { type: 'select', label: '语调', labelEn: 'Tone', helpText: '选择语言风格', helpTextEn: 'Select the language style' },
    targetAudience: { type: 'select', label: '目标受众', labelEn: 'Target Audience', helpText: '选择目标受众', helpTextEn: 'Select the target audience' },
    platform: { type: 'select', label: '平台', labelEn: 'Platform', helpText: '选择发布平台', helpTextEn: 'Select the platform' },
    callToAction: {
      type: 'text',
      label: '行动号召',
      labelEn: 'Call to Action',
      placeholder: '例如：关注、点赞、订阅等',
      placeholderEn: 'e.g., Follow, like, subscribe',
      helpText: '结尾的行动号召语',
      helpTextEn: 'Call to action at the end',
    },
  },
};

function asOpts(arr: FormOption[] | undefined): FormOption[] {
  return (arr || []).map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value }));
}

export function getVoiceScriptsFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    const meta = voiceScriptsFormOptionsZh._metadata!.callToAction as { labelEn?: string; placeholderEn?: string; helpTextEn?: string };
    return {
      duration: asOpts(voiceScriptsFormOptionsZh.duration as FormOption[]),
      tone: asOpts(voiceScriptsFormOptionsZh.tone as FormOption[]),
      targetAudience: asOpts(voiceScriptsFormOptionsZh.targetAudience as FormOption[]),
      platform: asOpts(voiceScriptsFormOptionsZh.platform as FormOption[]),
      _metadata: {
        callToAction: {
          ...voiceScriptsFormOptionsZh._metadata!.callToAction,
          label: meta.labelEn || 'Call to Action',
          placeholder: meta.placeholderEn,
          helpText: meta.helpTextEn,
        },
      },
    };
  }
  return voiceScriptsFormOptionsZh;
}
