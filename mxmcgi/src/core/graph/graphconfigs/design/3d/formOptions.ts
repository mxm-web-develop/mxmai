/**
 * 3D设计表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const design3dFormOptionsZh: FormOptionsConfig = {
  modelStyle: [
    { value: 'low-poly', label: '低多边形', labelEn: 'Low Poly' },
    { value: 'realistic', label: '写实', labelEn: 'Realistic' },
    { value: 'cartoon', label: '卡通', labelEn: 'Cartoon' },
    { value: 'abstract', label: '抽象', labelEn: 'Abstract' },
    { value: 'stylized', label: '风格化', labelEn: 'Stylized' },
  ],
  material: [
    { value: 'metal', label: '金属', labelEn: 'Metal' },
    { value: 'glass', label: '玻璃', labelEn: 'Glass' },
    { value: 'plastic', label: '塑料', labelEn: 'Plastic' },
    { value: 'wood', label: '木材', labelEn: 'Wood' },
    { value: 'fabric', label: '布料', labelEn: 'Fabric' },
    { value: 'ceramic', label: '陶瓷', labelEn: 'Ceramic' },
  ],
  lighting: [
    { value: 'three-point', label: '三点光照', labelEn: 'Three Point' },
    { value: 'environment', label: '环境光照', labelEn: 'Environment' },
    { value: 'dramatic', label: '戏剧性光照', labelEn: 'Dramatic' },
    { value: 'soft', label: '柔和光照', labelEn: 'Soft' },
  ],
  perspective: [
    { value: 'isometric', label: '等轴测', labelEn: 'Isometric' },
    { value: 'perspective', label: '透视', labelEn: 'Perspective' },
    { value: 'orthographic', label: '正交', labelEn: 'Orthographic' },
  ],
};

export const design3dFormOptionsEn: FormOptionsConfig = {
  modelStyle: design3dFormOptionsZh.modelStyle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  material: design3dFormOptionsZh.material.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  lighting: design3dFormOptionsZh.lighting.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  perspective: design3dFormOptionsZh.perspective.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function get3dFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? design3dFormOptionsEn : design3dFormOptionsZh;
}
