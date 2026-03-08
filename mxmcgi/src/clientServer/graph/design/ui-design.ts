/**
 * 设计-UI 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const uiDesignFormOptionsZh: FormOptionsConfig = {
  uiResolution: [
    { value: 'mobile-app', label: '手机应用', labelEn: 'Mobile App' },
    { value: 'web', label: '网页', labelEn: 'Web' },
    { value: 'game', label: '游戏', labelEn: 'Game' },
    { value: 'element', label: '元素', labelEn: 'Element' },
  ],
  uiStyleKeywords: [
    { value: 'glassmorphism', label: '玻璃态', labelEn: 'Glassmorphism' },
    { value: 'neumorphism', label: '新拟态', labelEn: 'Neumorphism' },
    { value: 'flat', label: '扁平化', labelEn: 'Flat Design' },
    { value: 'material', label: 'Material Design', labelEn: 'Material Design' },
    { value: 'minimal', label: '极简主义', labelEn: 'Minimalist' },
    { value: 'brutalism', label: '粗野主义', labelEn: 'Brutalism' },
    { value: 'skeuomorphic', label: '拟物化', labelEn: 'Skeuomorphic' },
    { value: 'dark-mode', label: '深色模式', labelEn: 'Dark Mode' },
    { value: 'gradient', label: '渐变', labelEn: 'Gradient' },
    { value: '3d', label: '3D', labelEn: '3D' },
    { value: 'retro', label: '复古', labelEn: 'Retro' },
    { value: 'futuristic', label: '未来主义', labelEn: 'Futuristic' },
    { value: 'organic', label: '有机', labelEn: 'Organic' },
    { value: 'geometric', label: '几何', labelEn: 'Geometric' },
    { value: 'hand-drawn', label: '手绘', labelEn: 'Hand-drawn' },
  ],
};

export const uiDesignFormOptionsEn: FormOptionsConfig = {
  uiResolution: uiDesignFormOptionsZh.uiResolution.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  uiStyleKeywords: uiDesignFormOptionsZh.uiStyleKeywords.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getUiDesignFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? uiDesignFormOptionsEn : uiDesignFormOptionsZh;
}
