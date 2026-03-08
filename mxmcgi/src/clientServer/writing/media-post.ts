/**
 * 媒体帖（media-post）写作类型 - 客户端表单选项
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const mediaPostFormOptionsZh: FormOptionsConfig = {
  platform: [
    { value: 'weibo', label: '微博', labelEn: 'Weibo' },
    { value: 'wechat', label: '微信朋友圈', labelEn: 'WeChat Moments' },
    { value: 'xiaohongshu', label: '小红书', labelEn: 'Xiaohongshu' },
    { value: 'douyin', label: '抖音', labelEn: 'Douyin' },
    { value: 'twitter', label: 'Twitter', labelEn: 'Twitter' },
  ],
  tone: [
    { value: 'casual', label: '轻松随意', labelEn: 'Casual' },
    { value: 'professional', label: '专业', labelEn: 'Professional' },
    { value: 'humorous', label: '幽默', labelEn: 'Humorous' },
    { value: 'inspiring', label: '励志', labelEn: 'Inspiring' },
  ],
  targetAudience: [
    { value: 'general', label: '大众', labelEn: 'General' },
    { value: 'youth', label: '年轻人', labelEn: 'Youth' },
    { value: 'professional', label: '专业人士', labelEn: 'Professional' },
    { value: 'parents', label: '家长', labelEn: 'Parents' },
  ],
  _metadata: {
    platform: { type: 'select', label: '平台', labelEn: 'Platform', helpText: '选择发布平台', helpTextEn: 'Select the platform' },
    tone: { type: 'select', label: '语调', labelEn: 'Tone', helpText: '选择语言风格', helpTextEn: 'Select the language style' },
    targetAudience: { type: 'select', label: '目标受众', labelEn: 'Target Audience', helpText: '选择目标受众', helpTextEn: 'Select the target audience' },
    callToAction: {
      type: 'text',
      label: '行动号召',
      labelEn: 'Call to Action',
      placeholder: '例如：点赞、评论、分享等',
      placeholderEn: 'e.g., Like, comment, share',
      helpText: '引导读者互动的行动号召',
      helpTextEn: 'Call to action to encourage reader interaction',
    },
    hashtags: {
      type: 'text',
      label: '话题标签',
      labelEn: 'Hashtags',
      placeholder: '例如：#话题1 #话题2',
      placeholderEn: 'e.g., #topic1 #topic2',
      helpText: '相关的话题标签，用空格分隔',
      helpTextEn: 'Relevant hashtags, separated by spaces',
    },
  },
};

function asOpts(arr: FormOption[] | undefined): FormOption[] {
  return (arr || []).map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value }));
}

export function getMediaPostFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    const m = mediaPostFormOptionsZh._metadata!;
    return {
      platform: asOpts(mediaPostFormOptionsZh.platform as FormOption[]),
      tone: asOpts(mediaPostFormOptionsZh.tone as FormOption[]),
      targetAudience: asOpts(mediaPostFormOptionsZh.targetAudience as FormOption[]),
      _metadata: {
        callToAction: { ...m.callToAction, label: (m.callToAction as any).labelEn || 'Call to Action', placeholder: (m.callToAction as any).placeholderEn, helpText: (m.callToAction as any).helpTextEn },
        hashtags: { ...m.hashtags, label: (m.hashtags as any).labelEn || 'Hashtags', placeholder: (m.hashtags as any).placeholderEn, helpText: (m.hashtags as any).helpTextEn },
      },
    };
  }
  return mediaPostFormOptionsZh;
}
