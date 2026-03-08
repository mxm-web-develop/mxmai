/**
 * 摄影-商业 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const commercialFormOptionsZh: FormOptionsConfig = {
  productType: [
    { value: 'electronics', label: '电子产品', labelEn: 'Electronics' },
    { value: 'food', label: '食品', labelEn: 'Food' },
    { value: 'clothing', label: '服装', labelEn: 'Clothing' },
    { value: 'cosmetics', label: '化妆品', labelEn: 'Cosmetics' },
    { value: 'jewelry', label: '珠宝', labelEn: 'Jewelry' },
    { value: 'furniture', label: '家具', labelEn: 'Furniture' },
    { value: 'automotive', label: '汽车', labelEn: 'Automotive' },
    { value: 'beverage', label: '饮料', labelEn: 'Beverage' },
  ],
  background: [
    { value: 'simple', label: '简约', labelEn: 'Simple' },
    { value: 'complex', label: '复杂', labelEn: 'Complex' },
    { value: 'white', label: '白色', labelEn: 'White' },
    { value: 'gradient', label: '渐变', labelEn: 'Gradient' },
    { value: 'textured', label: '纹理', labelEn: 'Textured' },
    { value: 'lifestyle', label: '生活场景', labelEn: 'Lifestyle' },
  ],
  props: [
    { value: 'minimal', label: '极简道具', labelEn: 'Minimal Props' },
    { value: 'moderate', label: '适量道具', labelEn: 'Moderate Props' },
    { value: 'rich', label: '丰富道具', labelEn: 'Rich Props' },
    { value: 'none', label: '无道具', labelEn: 'No Props' },
  ],
};

export const commercialFormOptionsEn: FormOptionsConfig = {
  productType: commercialFormOptionsZh.productType.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
  background: commercialFormOptionsZh.background.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
  props: commercialFormOptionsZh.props.map(opt => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getCommercialFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? commercialFormOptionsEn : commercialFormOptionsZh;
}
