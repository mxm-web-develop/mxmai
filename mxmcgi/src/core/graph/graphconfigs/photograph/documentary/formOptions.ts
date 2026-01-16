/**
 * 纪实摄影表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const documentaryFormOptionsZh: FormOptionsConfig = {
  eventType: [
    { value: 'news', label: '新闻', labelEn: 'News' },
    { value: 'social', label: '社会', labelEn: 'Social' },
    { value: 'culture', label: '文化', labelEn: 'Culture' },
    { value: 'history', label: '历史', labelEn: 'History' },
    { value: 'sports', label: '体育', labelEn: 'Sports' },
    { value: 'ceremony', label: '仪式', labelEn: 'Ceremony' },
  ],
  documentaryStyle: [
    { value: 'candid', label: '抓拍', labelEn: 'Candid' },
    { value: 'posed', label: '摆拍', labelEn: 'Posed' },
    { value: 'environmental', label: '环境肖像', labelEn: 'Environmental' },
    { value: 'street', label: '街头纪实', labelEn: 'Street' },
    { value: 'photojournalism', label: '新闻摄影', labelEn: 'Photojournalism' },
  ],
};

export const documentaryFormOptionsEn: FormOptionsConfig = {
  eventType: documentaryFormOptionsZh.eventType.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  documentaryStyle: documentaryFormOptionsZh.documentaryStyle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function getDocumentaryFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? documentaryFormOptionsEn : documentaryFormOptionsZh;
}
