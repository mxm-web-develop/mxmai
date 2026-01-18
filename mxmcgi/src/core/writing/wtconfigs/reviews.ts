/**
 * 评论写作类型配置
 * 用于为 reviews 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const reviewsConfig: WritingTypeConfig = {
  /**
   * 评论写作规则和指导原则
   */
  rules: `你是一位专业的评论写作助手，擅长创作各类客观、专业的评论文章。

【评论写作原则】
1. **客观性**：基于事实和体验，保持客观中立
2. **专业性**：使用专业术语和分析方法
3. **全面性**：从多个角度分析，不偏不倚
4. **实用性**：为读者提供有价值的信息和建议
5. **真实性**：确保评论内容真实，不夸大或贬低

【评论结构要求】
1. **开头**：简要介绍评论对象和整体印象
2. **优点分析**：详细分析优点和亮点
3. **缺点分析**：客观指出不足和改进空间
4. **综合评价**：给出整体评价和建议
5. **总结**：简洁总结，给出推荐度

【写作技巧】
1. 使用具体例子和数据支撑观点
2. 对比同类产品/服务，突出特点
3. 从用户角度出发，关注实际体验
4. 语言专业但不晦涩，易于理解
5. 保持平衡，既不过分赞美也不过分批评`,

  /**
   * 评论结构要求
   */
  outputformat: `【评论格式要求】

1. **整体结构**：
   - 开头：评论对象介绍和整体印象
   - 优点分析：详细列举和分析优点
   - 缺点分析：客观指出不足
   - 综合评价：整体评价和建议
   - 总结：推荐度和总结

2. **内容要求**：
   - 使用小标题组织内容
   - 每个观点都要有具体例子支撑
   - 使用评分或星级（如：4.5/5）
   - 提供实用的建议和参考

3. **语言要求**：
   - 客观专业，避免主观情绪
   - 使用具体数据和事实
   - 语言清晰易懂
   - 保持平衡和公正`,

  /**
   * 获取评论类型需要的参数列表
   */
  getParamsForType(): string[] {
    return ['reviewType', 'rating', 'focusAreas', 'targetAudience', 'comparison'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const reviewsFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
      reviewType: [
        { value: 'product', label: '产品评论', labelEn: 'Product Review' },
        { value: 'service', label: '服务评论', labelEn: 'Service Review' },
        { value: 'book', label: '书籍评论', labelEn: 'Book Review' },
        { value: 'movie', label: '电影评论', labelEn: 'Movie Review' },
        { value: 'restaurant', label: '餐厅评论', labelEn: 'Restaurant Review' },
      ],
      rating: [
        { value: '1', label: '1星（很差）', labelEn: '1 star (Very Poor)' },
        { value: '2', label: '2星（较差）', labelEn: '2 stars (Poor)' },
        { value: '3', label: '3星（一般）', labelEn: '3 stars (Average)' },
        { value: '4', label: '4星（较好）', labelEn: '4 stars (Good)' },
        { value: '5', label: '5星（优秀）', labelEn: '5 stars (Excellent)' },
      ],
      targetAudience: [
        { value: 'general', label: '大众', labelEn: 'General' },
        { value: 'professional', label: '专业人士', labelEn: 'Professional' },
        { value: 'beginner', label: '初学者', labelEn: 'Beginner' },
        { value: 'expert', label: '专家', labelEn: 'Expert' },
      ],

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        reviewType: {
          type: 'select',
          label: '评论类型',
          labelEn: 'Review Type',
          helpText: '选择评论类型',
          helpTextEn: 'Select the review type',
        },
        rating: {
          type: 'select',
          label: '评分',
          labelEn: 'Rating',
          helpText: '选择评分等级',
          helpTextEn: 'Select the rating',
        },
        targetAudience: {
          type: 'select',
          label: '目标受众',
          labelEn: 'Target Audience',
          helpText: '选择目标受众',
          helpTextEn: 'Select the target audience',
        },
        focusAreas: {
          type: 'text',
          label: '关注重点',
          labelEn: 'Focus Areas',
          placeholder: '例如：性能、价格、设计等',
          placeholderEn: 'e.g., Performance, price, design',
          helpText: '评论中要重点关注的方面',
          helpTextEn: 'Areas to focus on in the review',
        },
        comparison: {
          type: 'textarea',
          label: '对比对象',
          labelEn: 'Comparison',
          placeholder: '描述要与哪些同类产品/服务对比...',
          placeholderEn: 'Describe what to compare with...',
          helpText: '用于对比分析的其他产品/服务',
          helpTextEn: 'Other products/services for comparison',
        },
      },
    };

    if (language === 'en') {
      return {
        reviewType: reviewsFormOptionsZh.reviewType.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        rating: reviewsFormOptionsZh.rating.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        targetAudience: reviewsFormOptionsZh.targetAudience.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        _metadata: {
          focusAreas: {
            ...reviewsFormOptionsZh._metadata!.focusAreas,
            label: reviewsFormOptionsZh._metadata!.focusAreas.labelEn || 'Focus Areas',
            placeholder: reviewsFormOptionsZh._metadata!.focusAreas.placeholderEn,
            helpText: reviewsFormOptionsZh._metadata!.focusAreas.helpTextEn,
          },
          comparison: {
            ...reviewsFormOptionsZh._metadata!.comparison,
            label: reviewsFormOptionsZh._metadata!.comparison.labelEn || 'Comparison',
            placeholder: reviewsFormOptionsZh._metadata!.comparison.placeholderEn,
            helpText: reviewsFormOptionsZh._metadata!.comparison.helpTextEn,
          },
        },
      };
    }

    return reviewsFormOptionsZh;
  },
}

