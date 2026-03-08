/**
 * 评论（reviews）写作类型 - 客户端表单选项
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const reviewsFormOptionsZh: FormOptionsConfig = {
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
  _metadata: {
    reviewType: { type: 'select', label: '评论类型', labelEn: 'Review Type', helpText: '选择评论类型', helpTextEn: 'Select the review type' },
    rating: { type: 'select', label: '评分', labelEn: 'Rating', helpText: '选择评分等级', helpTextEn: 'Select the rating' },
    targetAudience: { type: 'select', label: '目标受众', labelEn: 'Target Audience', helpText: '选择目标受众', helpTextEn: 'Select the target audience' },
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

const asOpts = (arr: FormOption[] | undefined) =>
  (arr || []).map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value }));

export function getReviewsFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    const m = reviewsFormOptionsZh._metadata!;
    return {
      reviewType: asOpts(reviewsFormOptionsZh.reviewType as FormOption[]),
      rating: asOpts(reviewsFormOptionsZh.rating as FormOption[]),
      targetAudience: asOpts(reviewsFormOptionsZh.targetAudience as FormOption[]),
      _metadata: {
        focusAreas: { ...m.focusAreas, label: m.focusAreas.labelEn || 'Focus Areas', placeholder: m.focusAreas.placeholderEn, helpText: m.focusAreas.helpTextEn },
        comparison: { ...m.comparison, label: m.comparison.labelEn || 'Comparison', placeholder: m.comparison.placeholderEn, helpText: m.comparison.helpTextEn },
      },
    };
  }
  return reviewsFormOptionsZh;
}
