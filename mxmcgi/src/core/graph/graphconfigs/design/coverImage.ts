/**
 * CoverImage 类型用户需求构建函数
 * 用于将 coverImage 类型的参数转换为结构化的用户需求描述
 */

import type { DesignParams } from '../../type';
import type { ReferenceImage } from '../../reference-image';

/**
 * 转换参考图片格式
 */
function convertReferenceImage(
  image: string | string[] | ReferenceImage[] | undefined
): ReferenceImage[] {
  if (!image) return [];
  
  if (typeof image === 'string') {
    return [{ url: image, type: 'reference' }];
  }
  
  if (Array.isArray(image)) {
    if (image.length === 0) return [];
    
    if (typeof image[0] === 'string') {
      return image.map(url => ({ url, type: 'reference' }));
    }
    
    return image as ReferenceImage[];
  }
  
  return [];
}

/**
 * 构建 CoverImage 类型的用户需求描述
 */
export function buildCoverImageUserPrompt(
  params: DesignParams,
  outputLanguage: 'zh' | 'en' = 'zh'
): string {
  const {
    prompt,
    title,
    subtitle,
    textStyle,
    textColor,
    textPosition,
    layoutStyle,
    visualEffects,
    coverTheme,
    subjectImage,
    backgroundImage,
  } = params;

  const isZh = outputLanguage === 'zh';
  
  // 构建基础需求描述
  let userPrompt = prompt || '';
  
  // 处理主体图片
  const subjectImages = convertReferenceImage(subjectImage);
  if (subjectImages.length > 0) {
    if (isZh) {
      userPrompt += `\n\n【主体图片】已上传 ${subjectImages.length} 张主体图片（人物/角色等），请确保主体清晰突出，占据画面重要位置。`;
    } else {
      userPrompt += `\n\n【Subject Image】${subjectImages.length} subject image(s) uploaded (person/character, etc.), ensure the subject is clear and prominent, occupying an important position in the frame.`;
    }
  }
  
  // 处理背景图片
  const backgroundImages = convertReferenceImage(backgroundImage);
  if (backgroundImages.length > 0) {
    if (isZh) {
      userPrompt += `\n\n【背景图片】已上传 ${backgroundImages.length} 张背景图片，请将背景与主体自然融合，营造氛围感。`;
    } else {
      userPrompt += `\n\n【Background Image】${backgroundImages.length} background image(s) uploaded, please naturally blend the background with the subject to create an atmospheric feeling.`;
    }
  }
  
  // 处理文字叠加
  if (title || subtitle) {
    if (isZh) {
      userPrompt += '\n\n【文字叠加要求】';
    } else {
      userPrompt += '\n\n【Text Overlay Requirements】';
    }
    
    if (title) {
      if (isZh) {
        userPrompt += `\n- 主标题：${title}`;
        userPrompt += `\n  ⚠️ 重要：必须在生成的图片中保留用户输入的原始文字 "${title}"，不要翻译或更改语言！`;
      } else {
        userPrompt += `\n- Main Title: ${title}`;
        userPrompt += `\n  ⚠️ Important: You must preserve the original text "${title}" exactly as the user provided in the generated image, do NOT translate or change the language!`;
      }
    }
    
    if (subtitle) {
      if (isZh) {
        userPrompt += `\n- 副标题：${subtitle}`;
        userPrompt += `\n  ⚠️ 重要：必须在生成的图片中保留用户输入的原始文字 "${subtitle}"，不要翻译或更改语言！`;
      } else {
        userPrompt += `\n- Subtitle: ${subtitle}`;
        userPrompt += `\n  ⚠️ Important: You must preserve the original text "${subtitle}" exactly as the user provided in the generated image, do NOT translate or change the language!`;
      }
    }
    
    if (textStyle) {
      if (isZh) {
        userPrompt += `\n- 文字风格：${textStyle}`;
      } else {
        userPrompt += `\n- Text Style: ${textStyle}`;
      }
    }
    
    if (textColor) {
      if (isZh) {
        userPrompt += `\n- 文字颜色：${textColor}`;
      } else {
        userPrompt += `\n- Text Color: ${textColor}`;
      }
    }
    
    if (textPosition) {
      if (isZh) {
        userPrompt += `\n- 文字位置：${textPosition}`;
      } else {
        userPrompt += `\n- Text Position: ${textPosition}`;
      }
    }
  }
  
  // 处理布局和视觉效果
  if (layoutStyle || visualEffects || coverTheme) {
    if (isZh) {
      userPrompt += '\n\n【设计参数】';
    } else {
      userPrompt += '\n\n【Design Parameters】';
    }
    
    if (layoutStyle) {
      if (isZh) {
        userPrompt += `\n- 布局风格：${layoutStyle}`;
      } else {
        userPrompt += `\n- Layout Style: ${layoutStyle}`;
      }
    }
    
    if (visualEffects) {
      if (isZh) {
        userPrompt += `\n- 视觉效果：${visualEffects}`;
      } else {
        userPrompt += `\n- Visual Effects: ${visualEffects}`;
      }
    }
    
    if (coverTheme) {
      if (isZh) {
        userPrompt += `\n- 封面主题：${coverTheme}`;
      } else {
        userPrompt += `\n- Cover Theme: ${coverTheme}`;
      }
    }
  }
  
  return userPrompt.trim();
}
