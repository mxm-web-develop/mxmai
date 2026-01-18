/**
 * 媒体帖子写作类型配置
 * 用于为 media-post 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const mediaPostConfig: WritingTypeConfig = {
  /**
   * 媒体帖子写作规则和指导原则
   */
  rules: `你是一位专业的社交媒体内容创作助手，擅长创作各类吸引人的媒体帖子。

【媒体帖子创作原则】
1. **吸引力**：开头要抓人眼球，快速吸引读者注意力
2. **简洁性**：内容精炼，避免冗长，适合快速阅读
3. **互动性**：鼓励读者互动，如点赞、评论、分享
4. **价值性**：提供有价值的信息或观点
5. **时效性**：关注热点话题，保持内容新鲜

【媒体帖子结构要求】
1. **开头**：吸引人的开场，可以是问题、故事、数据、观点
2. **正文**：核心内容，简洁有力，重点突出
3. **结尾**：行动号召或互动引导
4. **话题标签**（可选）：相关话题标签

【写作技巧】
1. 使用短句和段落，便于阅读
2. 合理使用表情符号增强表达
3. 使用数字、列表等格式化内容
4. 创造悬念，引导读者继续阅读
5. 保持与目标受众的共鸣`,

  /**
   * 媒体帖子结构要求
   */
  outputformat: `【媒体帖子格式要求】

1. **长度控制**：
   - 微博/推特：140-280字
   - 朋友圈：50-200字
   - 小红书：200-500字
   - 根据平台特点调整

2. **格式要求**：
   - 开头吸引人（问题、故事、数据等）
   - 正文简洁有力，重点突出
   - 结尾有行动号召或互动引导
   - 合理使用表情符号和格式化

3. **内容要求**：
   - 主题明确，一目了然
   - 语言生动，有感染力
   - 提供价值或引发思考
   - 适合目标平台和受众`,

  /**
   * 获取媒体帖子类型需要的参数列表
   */
  getParamsForType(): string[] {
    return ['platform', 'tone', 'targetAudience', 'callToAction', 'hashtags'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const mediaPostFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
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

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        platform: {
          type: 'select',
          label: '平台',
          labelEn: 'Platform',
          helpText: '选择发布平台',
          helpTextEn: 'Select the platform',
        },
        tone: {
          type: 'select',
          label: '语调',
          labelEn: 'Tone',
          helpText: '选择语言风格',
          helpTextEn: 'Select the language style',
        },
        targetAudience: {
          type: 'select',
          label: '目标受众',
          labelEn: 'Target Audience',
          helpText: '选择目标受众',
          helpTextEn: 'Select the target audience',
        },
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

    if (language === 'en') {
      return {
        platform: mediaPostFormOptionsZh.platform.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        tone: mediaPostFormOptionsZh.tone.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        targetAudience: mediaPostFormOptionsZh.targetAudience.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        _metadata: {
          callToAction: {
            ...mediaPostFormOptionsZh._metadata!.callToAction,
            label: mediaPostFormOptionsZh._metadata!.callToAction.labelEn || 'Call to Action',
            placeholder: mediaPostFormOptionsZh._metadata!.callToAction.placeholderEn,
            helpText: mediaPostFormOptionsZh._metadata!.callToAction.helpTextEn,
          },
          hashtags: {
            ...mediaPostFormOptionsZh._metadata!.hashtags,
            label: mediaPostFormOptionsZh._metadata!.hashtags.labelEn || 'Hashtags',
            placeholder: mediaPostFormOptionsZh._metadata!.hashtags.placeholderEn,
            helpText: mediaPostFormOptionsZh._metadata!.hashtags.helpTextEn,
          },
        },
      };
    }

    return mediaPostFormOptionsZh;
  },
}

