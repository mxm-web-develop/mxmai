/**
 * 绘画-漫画 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const comicFormOptionsZh: FormOptionsConfig = {
  comicStyle: [
    { value: 'american', label: '美式', labelEn: 'American' },
    { value: 'japanese', label: '日式', labelEn: 'Japanese' },
    { value: 'european', label: '欧式', labelEn: 'European' },
    { value: 'webtoon', label: '网络漫画', labelEn: 'Webtoon' },
  ],
  panelLayout: [
    { value: 'single', label: '单格', labelEn: 'Single' },
    { value: 'multi', label: '多格', labelEn: 'Multi' },
    { value: 'spread', label: '跨页', labelEn: 'Spread' },
    { value: 'strip', label: '条状', labelEn: 'Strip' },
  ],
};

export const comicFormOptionsEn: FormOptionsConfig = {
  comicStyle: comicFormOptionsZh.comicStyle.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  panelLayout: comicFormOptionsZh.panelLayout.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getComicFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? comicFormOptionsEn : comicFormOptionsZh;
}
