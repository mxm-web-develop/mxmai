/**
 * 口播稿写作类型配置
 * 用于为 voice-scripts 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const voiceScriptsConfig: WritingTypeConfig = {
  /**
   * 口播稿写作规则和指导原则
   */
  rules: `你是一位专业的口播稿写作助手，擅长创作各类适合口语表达的口播内容。

【口播稿写作原则】
1. **口语化**：使用自然、流畅的口语表达，避免书面语
2. **简洁性**：语言简洁明了，便于理解和记忆
3. **节奏感**：注意语言的节奏和停顿，适合口语表达
4. **吸引力**：开头要抓人，快速吸引听众注意力
5. **完整性**：结构完整，有开头、主体、结尾

【口播稿结构要求】
1. **开头**：吸引人的开场，可以是问题、故事、数据
2. **主体**：核心内容，分点论述，逻辑清晰
3. **结尾**：总结或行动号召，给听众留下印象

【写作技巧】
1. 使用短句，避免长句和复杂句式
2. 使用口语化词汇，贴近日常表达
3. 合理使用停顿标记，便于朗读
4. 注意音节的流畅性，朗朗上口
5. 使用具体例子和数据增强说服力`,

  /**
   * 口播稿结构要求
   */
  outputformat: `【口播稿格式要求】

1. **格式规范**：
   - 使用自然的口语表达
   - 合理使用停顿标记（如：...、——）
   - 标注重点词汇或语气（如：**重点**）
   - 保持段落简短，便于朗读

2. **内容要求**：
   - 开头吸引人，快速抓住注意力
   - 主体内容分点清晰，逻辑严密
   - 结尾有力，给听众留下印象
   - 语言自然流畅，适合口语表达

3. **语言要求**：
   - 使用口语化表达，避免书面语
   - 短句为主，便于理解和记忆
   - 注意节奏和停顿
   - 使用具体例子增强说服力`,

  /**
   * 获取口播稿类型需要的参数列表
   */
  getParamsForType(): string[] {
    return ['duration', 'tone', 'targetAudience', 'platform', 'callToAction'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const voiceScriptsFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
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

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        duration: {
          type: 'select',
          label: '时长',
          labelEn: 'Duration',
          helpText: '选择口播时长',
          helpTextEn: 'Select the duration',
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
        platform: {
          type: 'select',
          label: '平台',
          labelEn: 'Platform',
          helpText: '选择发布平台',
          helpTextEn: 'Select the platform',
        },
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

    if (language === 'en') {
      return {
        duration: voiceScriptsFormOptionsZh.duration.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        tone: voiceScriptsFormOptionsZh.tone.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        targetAudience: voiceScriptsFormOptionsZh.targetAudience.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        platform: voiceScriptsFormOptionsZh.platform.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        _metadata: {
          callToAction: {
            ...voiceScriptsFormOptionsZh._metadata!.callToAction,
            label: voiceScriptsFormOptionsZh._metadata!.callToAction.labelEn || 'Call to Action',
            placeholder: voiceScriptsFormOptionsZh._metadata!.callToAction.placeholderEn,
            helpText: voiceScriptsFormOptionsZh._metadata!.callToAction.helpTextEn,
          },
        },
      };
    }

    return voiceScriptsFormOptionsZh;
  },
}

