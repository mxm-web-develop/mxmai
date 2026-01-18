/**
 * CoverImage 类型的表单选项配置
 */
import type { FormOptionsConfig } from '../../formOptions';

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

  // 根据语言返回对应的配置
  if (language === 'en') {
    const coverImageFormOptionsEn: FormOptionsConfig = {
      textStyle: coverImageFormOptionsZh.textStyle.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.label,
      })),
      textColor: coverImageFormOptionsZh.textColor.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.label,
      })),
      textPosition: coverImageFormOptionsZh.textPosition.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.label,
      })),
      layoutStyle: coverImageFormOptionsZh.layoutStyle.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.label,
      })),
      visualEffects: coverImageFormOptionsZh.visualEffects.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.label,
      })),
      coverTheme: coverImageFormOptionsZh.coverTheme.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.label,
      })),
      _metadata: {
        title: coverImageFormOptionsZh._metadata.title,
        subtitle: coverImageFormOptionsZh._metadata.subtitle,
        textStyle: {
          ...coverImageFormOptionsZh._metadata.textStyle,
          label: coverImageFormOptionsZh._metadata.textStyle.labelEn || coverImageFormOptionsZh._metadata.textStyle.label,
          helpText: coverImageFormOptionsZh._metadata.textStyle.helpTextEn || coverImageFormOptionsZh._metadata.textStyle.helpText,
        },
        textColor: {
          ...coverImageFormOptionsZh._metadata.textColor,
          label: coverImageFormOptionsZh._metadata.textColor.labelEn || coverImageFormOptionsZh._metadata.textColor.label,
          helpText: coverImageFormOptionsZh._metadata.textColor.helpTextEn || coverImageFormOptionsZh._metadata.textColor.helpText,
        },
        textPosition: {
          ...coverImageFormOptionsZh._metadata.textPosition,
          label: coverImageFormOptionsZh._metadata.textPosition.labelEn || coverImageFormOptionsZh._metadata.textPosition.label,
          helpText: coverImageFormOptionsZh._metadata.textPosition.helpTextEn || coverImageFormOptionsZh._metadata.textPosition.helpText,
        },
        layoutStyle: {
          ...coverImageFormOptionsZh._metadata.layoutStyle,
          label: coverImageFormOptionsZh._metadata.layoutStyle.labelEn || coverImageFormOptionsZh._metadata.layoutStyle.label,
          helpText: coverImageFormOptionsZh._metadata.layoutStyle.helpTextEn || coverImageFormOptionsZh._metadata.layoutStyle.helpText,
        },
        visualEffects: {
          ...coverImageFormOptionsZh._metadata.visualEffects,
          label: coverImageFormOptionsZh._metadata.visualEffects.labelEn || coverImageFormOptionsZh._metadata.visualEffects.label,
          helpText: coverImageFormOptionsZh._metadata.visualEffects.helpTextEn || coverImageFormOptionsZh._metadata.visualEffects.helpText,
        },
        coverTheme: {
          ...coverImageFormOptionsZh._metadata.coverTheme,
          label: coverImageFormOptionsZh._metadata.coverTheme.labelEn || coverImageFormOptionsZh._metadata.coverTheme.label,
          helpText: coverImageFormOptionsZh._metadata.coverTheme.helpTextEn || coverImageFormOptionsZh._metadata.coverTheme.helpText,
        },
      },
    };
    return coverImageFormOptionsEn;
  }

  return coverImageFormOptionsZh;
}
