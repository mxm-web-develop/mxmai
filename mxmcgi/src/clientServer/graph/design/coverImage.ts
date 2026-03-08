/**
 * 设计-封面图 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export function getCoverImageFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  const isZh = language === 'zh';

  const coverImageFormOptionsZh: FormOptionsConfig = {
    textStyle: [
      { value: 'bold', label: '粗体', labelEn: 'Bold' },
      { value: 'shadow', label: '阴影', labelEn: 'Shadow' },
      { value: 'outline', label: '描边', labelEn: 'Outline' },
      { value: 'gradient', label: '渐变', labelEn: 'Gradient' },
      { value: 'glow', label: '发光', labelEn: 'Glow' },
      { value: '3d', label: '3D效果', labelEn: '3D Effect' },
    ],
    textColor: [
      { value: 'white', label: '白色', labelEn: 'White' },
      { value: 'black', label: '黑色', labelEn: 'Black' },
      { value: 'red', label: '红色', labelEn: 'Red' },
      { value: 'blue', label: '蓝色', labelEn: 'Blue' },
      { value: 'yellow', label: '黄色', labelEn: 'Yellow' },
      { value: 'green', label: '绿色', labelEn: 'Green' },
      { value: 'orange', label: '橙色', labelEn: 'Orange' },
      { value: 'purple', label: '紫色', labelEn: 'Purple' },
      { value: 'gradient', label: '渐变', labelEn: 'Gradient' },
    ],
    textPosition: [
      { value: 'top-left', label: '左上', labelEn: 'Top Left' },
      { value: 'top-center', label: '上中', labelEn: 'Top Center' },
      { value: 'top-right', label: '右上', labelEn: 'Top Right' },
      { value: 'center-left', label: '左中', labelEn: 'Center Left' },
      { value: 'center', label: '居中', labelEn: 'Center' },
      { value: 'center-right', label: '右中', labelEn: 'Center Right' },
      { value: 'bottom-left', label: '左下', labelEn: 'Bottom Left' },
      { value: 'bottom-center', label: '下中', labelEn: 'Bottom Center' },
      { value: 'bottom-right', label: '右下', labelEn: 'Bottom Right' },
    ],
    layoutStyle: [
      { value: 'left-right', label: '左右分栏', labelEn: 'Left-Right Split' },
      { value: 'top-bottom', label: '上下分栏', labelEn: 'Top-Bottom Split' },
      { value: 'center-focus', label: '中心聚焦', labelEn: 'Center Focus' },
      { value: 'diagonal', label: '对角线', labelEn: 'Diagonal' },
      { value: 'grid', label: '网格', labelEn: 'Grid' },
      { value: 'overlay', label: '叠加', labelEn: 'Overlay' },
    ],
    visualEffects: [
      { value: 'blur', label: '模糊', labelEn: 'Blur' },
      { value: 'gradient', label: '渐变', labelEn: 'Gradient' },
      { value: 'vignette', label: '暗角', labelEn: 'Vignette' },
      { value: 'glow', label: '发光', labelEn: 'Glow' },
      { value: 'particle', label: '粒子', labelEn: 'Particle' },
      { value: 'light-ray', label: '光效', labelEn: 'Light Ray' },
      { value: 'none', label: '无', labelEn: 'None' },
    ],
    coverTheme: [
      { value: 'news', label: '新闻', labelEn: 'News' },
      { value: 'entertainment', label: '娱乐', labelEn: 'Entertainment' },
      { value: 'education', label: '教育', labelEn: 'Education' },
      { value: 'technology', label: '科技', labelEn: 'Technology' },
      { value: 'lifestyle', label: '生活', labelEn: 'Lifestyle' },
      { value: 'sports', label: '体育', labelEn: 'Sports' },
      { value: 'business', label: '商业', labelEn: 'Business' },
      { value: 'travel', label: '旅行', labelEn: 'Travel' },
      { value: 'food', label: '美食', labelEn: 'Food' },
      { value: 'fashion', label: '时尚', labelEn: 'Fashion' },
    ],
    _metadata: {
      title: {
        type: 'text',
        label: isZh ? '主标题' : 'Main Title',
        placeholder: isZh ? '输入封面主标题' : 'Enter main title',
        helpText: isZh ? '封面的主要文字内容' : 'Main text content of the cover',
      },
      subtitle: {
        type: 'text',
        label: isZh ? '副标题' : 'Subtitle',
        placeholder: isZh ? '输入封面副标题（可选）' : 'Enter subtitle (optional)',
        helpText: isZh ? '封面的次要文字内容' : 'Secondary text content of the cover',
      },
      textStyle: {
        type: 'select',
        label: isZh ? '文字风格' : 'Text Style',
        helpText: isZh ? '选择文字的视觉效果' : 'Select visual effect for text',
      },
      textColor: {
        type: 'select',
        label: isZh ? '文字颜色' : 'Text Color',
        helpText: isZh ? '选择文字的颜色' : 'Select color for text',
      },
      textPosition: {
        type: 'select',
        label: isZh ? '文字位置' : 'Text Position',
        helpText: isZh ? '选择文字在封面中的位置' : 'Select position of text on cover',
      },
      layoutStyle: {
        type: 'select',
        label: isZh ? '布局风格' : 'Layout Style',
        helpText: isZh ? '选择封面的整体布局方式' : 'Select overall layout style for cover',
      },
      visualEffects: {
        type: 'select',
        label: isZh ? '视觉效果' : 'Visual Effects',
        helpText: isZh ? '选择额外的视觉效果' : 'Select additional visual effects',
      },
      coverTheme: {
        type: 'select',
        label: isZh ? '封面主题' : 'Cover Theme',
        helpText: isZh ? '选择封面的主题风格' : 'Select theme style for cover',
      },
    },
  };

  if (language === 'en') {
    const zh = coverImageFormOptionsZh;
    const meta = zh._metadata!;
    return {
      textStyle: zh.textStyle.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.label })),
      textColor: zh.textColor.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.label })),
      textPosition: zh.textPosition.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.label })),
      layoutStyle: zh.layoutStyle.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.label })),
      visualEffects: zh.visualEffects.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.label })),
      coverTheme: zh.coverTheme.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.label })),
      _metadata: {
        title: meta.title,
        subtitle: meta.subtitle,
        textStyle: { ...meta.textStyle, label: meta.textStyle.labelEn ?? meta.textStyle.label, helpText: meta.textStyle.helpTextEn ?? meta.textStyle.helpText },
        textColor: { ...meta.textColor, label: meta.textColor.labelEn ?? meta.textColor.label, helpText: meta.textColor.helpTextEn ?? meta.textColor.helpText },
        textPosition: { ...meta.textPosition, label: meta.textPosition.labelEn ?? meta.textPosition.label, helpText: meta.textPosition.helpTextEn ?? meta.textPosition.helpText },
        layoutStyle: { ...meta.layoutStyle, label: meta.layoutStyle.labelEn ?? meta.layoutStyle.label, helpText: meta.layoutStyle.helpTextEn ?? meta.layoutStyle.helpText },
        visualEffects: { ...meta.visualEffects, label: meta.visualEffects.labelEn ?? meta.visualEffects.label, helpText: meta.visualEffects.helpTextEn ?? meta.visualEffects.helpText },
        coverTheme: { ...meta.coverTheme, label: meta.coverTheme.labelEn ?? meta.coverTheme.label, helpText: meta.coverTheme.helpTextEn ?? meta.coverTheme.helpText },
      },
    };
  }
  return coverImageFormOptionsZh;
}
