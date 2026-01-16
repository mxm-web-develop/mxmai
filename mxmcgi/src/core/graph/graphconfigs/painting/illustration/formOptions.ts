/**
 * 插画表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const illustrationFormOptionsZh: FormOptionsConfig = {
  illustrationStyle: [
    { value: 'flat', label: '扁平', labelEn: 'Flat' },
    { value: 'realistic', label: '写实', labelEn: 'Realistic' },
    { value: 'watercolor', label: '水彩', labelEn: 'Watercolor' },
    { value: 'digital', label: '数字绘画', labelEn: 'Digital' },
    { value: 'sketch', label: '素描', labelEn: 'Sketch' },
  ],
  colorPalette: [
    { value: 'warm', label: '温暖', labelEn: 'Warm' },
    { value: 'cool', label: '冷调', labelEn: 'Cool' },
    { value: 'high-saturation', label: '高饱和', labelEn: 'High Saturation' },
    { value: 'low-saturation', label: '低饱和', labelEn: 'Low Saturation' },
    { value: 'monochrome', label: '单色', labelEn: 'Monochrome' },
  ],
};

export const illustrationFormOptionsEn: FormOptionsConfig = {
  illustrationStyle: illustrationFormOptionsZh.illustrationStyle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  colorPalette: illustrationFormOptionsZh.colorPalette.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function getIllustrationFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? illustrationFormOptionsEn : illustrationFormOptionsZh;
}
