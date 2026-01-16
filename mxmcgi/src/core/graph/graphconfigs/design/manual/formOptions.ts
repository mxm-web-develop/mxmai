/**
 * 使用手册设计表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const manualFormOptionsZh: FormOptionsConfig = {
  layout: [
    { value: 'grid', label: '网格', labelEn: 'Grid' },
    { value: 'free', label: '自由', labelEn: 'Free' },
    { value: 'symmetric', label: '对称', labelEn: 'Symmetric' },
    { value: 'asymmetric', label: '非对称', labelEn: 'Asymmetric' },
  ],
  colorScheme: [
    { value: 'monochrome', label: '单色', labelEn: 'Monochrome' },
    { value: 'complementary', label: '互补色', labelEn: 'Complementary' },
    { value: 'analogous', label: '类似色', labelEn: 'Analogous' },
    { value: 'brand', label: '品牌色', labelEn: 'Brand' },
  ],
  typography: [
    { value: 'sans-serif', label: '无衬线', labelEn: 'Sans Serif' },
    { value: 'serif', label: '衬线', labelEn: 'Serif' },
    { value: 'handwriting', label: '手写', labelEn: 'Handwriting' },
    { value: 'display', label: '展示', labelEn: 'Display' },
  ],
};

export const manualFormOptionsEn: FormOptionsConfig = {
  layout: manualFormOptionsZh.layout.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  colorScheme: manualFormOptionsZh.colorScheme.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  typography: manualFormOptionsZh.typography.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function getManualFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? manualFormOptionsEn : manualFormOptionsZh;
}
