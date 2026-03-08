/**
 * 摄影-风景 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const landscapeFormOptionsZh: FormOptionsConfig = {
  timeOfDay: [
    { value: 'dawn', label: '清晨', labelEn: 'Dawn' },
    { value: 'noon', label: '正午', labelEn: 'Noon' },
    { value: 'dusk', label: '黄昏', labelEn: 'Dusk' },
    { value: 'night', label: '夜晚', labelEn: 'Night' },
    { value: 'sunrise', label: '日出', labelEn: 'Sunrise' },
    { value: 'sunset', label: '日落', labelEn: 'Sunset' },
  ],
  weather: [
    { value: 'sunny', label: '晴天', labelEn: 'Sunny' },
    { value: 'cloudy', label: '阴天', labelEn: 'Cloudy' },
    { value: 'rainy', label: '雨天', labelEn: 'Rainy' },
    { value: 'snowy', label: '雪天', labelEn: 'Snowy' },
    { value: 'foggy', label: '雾天', labelEn: 'Foggy' },
    { value: 'stormy', label: '暴风雨', labelEn: 'Stormy' },
  ],
  season: [
    { value: 'spring', label: '春季', labelEn: 'Spring' },
    { value: 'summer', label: '夏季', labelEn: 'Summer' },
    { value: 'autumn', label: '秋季', labelEn: 'Autumn' },
    { value: 'winter', label: '冬季', labelEn: 'Winter' },
  ],
  composition: [
    { value: 'rule-of-thirds', label: '三分法', labelEn: 'Rule of Thirds' },
    { value: 'leading-lines', label: '引导线', labelEn: 'Leading Lines' },
    { value: 'symmetry', label: '对称', labelEn: 'Symmetry' },
    { value: 'framing', label: '框架', labelEn: 'Framing' },
    { value: 'center', label: '居中', labelEn: 'Center' },
  ],
};

export const landscapeFormOptionsEn: FormOptionsConfig = {
  timeOfDay: landscapeFormOptionsZh.timeOfDay.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
  weather: landscapeFormOptionsZh.weather.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
  season: landscapeFormOptionsZh.season.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
  composition: landscapeFormOptionsZh.composition.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getLandscapeFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? landscapeFormOptionsEn : landscapeFormOptionsZh;
}
