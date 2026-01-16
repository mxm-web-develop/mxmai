/**
 * 卡通表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const cartoonFormOptionsZh: FormOptionsConfig = {
  cartoonStyle: [
    { value: 'chibi', label: 'Q版', labelEn: 'Chibi' },
    { value: 'american', label: '美式', labelEn: 'American' },
    { value: 'japanese', label: '日式', labelEn: 'Japanese' },
    { value: 'european', label: '欧式', labelEn: 'European' },
  ],
  characterDesign: [
    { value: 'cute', label: '可爱', labelEn: 'Cute' },
    { value: 'cool', label: '帅气', labelEn: 'Cool' },
    { value: 'funny', label: '搞笑', labelEn: 'Funny' },
    { value: 'sweet', label: '甜美', labelEn: 'Sweet' },
  ],
};

export const cartoonFormOptionsEn: FormOptionsConfig = {
  cartoonStyle: cartoonFormOptionsZh.cartoonStyle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  characterDesign: cartoonFormOptionsZh.characterDesign.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function getCartoonFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? cartoonFormOptionsEn : cartoonFormOptionsZh;
}
