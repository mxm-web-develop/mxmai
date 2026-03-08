/**
 * 设计-图标 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const iconFormOptionsZh: FormOptionsConfig = {
  iconStyle: [
    { value: 'flat', label: '扁平', labelEn: 'Flat' },
    { value: 'skeuomorphic', label: '拟物', labelEn: 'Skeuomorphic' },
    { value: 'linear', label: '线性', labelEn: 'Linear' },
    { value: 'filled', label: '填充', labelEn: 'Filled' },
    { value: 'outline', label: '轮廓', labelEn: 'Outline' },
  ],
  size: [
    { value: 'small', label: '小', labelEn: 'Small' },
    { value: 'medium', label: '中', labelEn: 'Medium' },
    { value: 'large', label: '大', labelEn: 'Large' },
    { value: 'xlarge', label: '超大', labelEn: 'Extra Large' },
  ],
};

export const iconFormOptionsEn: FormOptionsConfig = {
  iconStyle: iconFormOptionsZh.iconStyle.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  size: iconFormOptionsZh.size.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getIconFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? iconFormOptionsEn : iconFormOptionsZh;
}
