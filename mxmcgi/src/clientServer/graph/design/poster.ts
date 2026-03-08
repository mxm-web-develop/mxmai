/**
 * 设计-画报 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const posterFormOptionsZh: FormOptionsConfig = {
  artStyle: [
    { value: 'vintage', label: '复古', labelEn: 'Vintage' },
    { value: 'modern', label: '现代', labelEn: 'Modern' },
    { value: 'abstract', label: '抽象', labelEn: 'Abstract' },
    { value: 'minimalist', label: '极简', labelEn: 'Minimalist' },
    { value: 'art-deco', label: '装饰艺术', labelEn: 'Art Deco' },
  ],
  theme: [
    { value: 'music', label: '音乐', labelEn: 'Music' },
    { value: 'film', label: '电影', labelEn: 'Film' },
    { value: 'event', label: '活动', labelEn: 'Event' },
    { value: 'product', label: '产品', labelEn: 'Product' },
    { value: 'cultural', label: '文化', labelEn: 'Cultural' },
  ],
};

export const posterFormOptionsEn: FormOptionsConfig = {
  artStyle: posterFormOptionsZh.artStyle.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  theme: posterFormOptionsZh.theme.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getPosterFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? posterFormOptionsEn : posterFormOptionsZh;
}
