/**
 * 原画表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const conceptArtFormOptionsZh: FormOptionsConfig = {
  conceptArtStyle: [
    { value: 'realistic', label: '写实', labelEn: 'Realistic' },
    { value: 'stylized', label: '风格化', labelEn: 'Stylized' },
    { value: 'sci-fi', label: '科幻', labelEn: 'Sci-Fi' },
    { value: 'fantasy', label: '奇幻', labelEn: 'Fantasy' },
  ],
  detailLevel: [
    { value: 'high', label: '高', labelEn: 'High' },
    { value: 'medium', label: '中', labelEn: 'Medium' },
    { value: 'low', label: '低', labelEn: 'Low' },
  ],
};

export const conceptArtFormOptionsEn: FormOptionsConfig = {
  conceptArtStyle: conceptArtFormOptionsZh.conceptArtStyle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  detailLevel: conceptArtFormOptionsZh.detailLevel.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function getConceptArtFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? conceptArtFormOptionsEn : conceptArtFormOptionsZh;
}
