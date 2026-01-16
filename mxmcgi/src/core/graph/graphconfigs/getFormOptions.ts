/**
 * 统一的表单选项获取函数
 * 根据 graphType 和 type 返回对应的表单选项
 */
import type { FormOptionsConfig } from './formOptions';
import { getFormOptions as getPortraitFormOptions } from './photograph/formOptions';
import { getLandscapeFormOptions } from './photograph/landscape/formOptions';
import { getCinematicFormOptions } from './photograph/cinematic/formOptions';
import { getCommercialFormOptions } from './photograph/commercial/formOptions';
import { getDocumentaryFormOptions } from './photograph/documentary/formOptions';
import { get3dFormOptions } from './design/3d/formOptions';
import { getManualFormOptions } from './design/manual/formOptions';
import { getPosterFormOptions } from './design/poster/formOptions';
import { getIconFormOptions } from './design/icon/formOptions';
import { getIllustrationFormOptions } from './painting/illustration/formOptions';
import { getComicFormOptions } from './painting/comic/formOptions';
import { getConceptArtFormOptions } from './painting/conceptArt/formOptions';
import { getCartoonFormOptions } from './painting/cartoon/formOptions';

/**
 * 获取表单选项
 * @param graphType 业务类型：photograph | design | painting
 * @param type 子类型
 * @param language 语言：zh | en（默认 zh）
 */
export function getFormOptionsForType(
  graphType: 'photograph' | 'design' | 'painting',
  type: string,
  language: 'zh' | 'en' = 'zh'
): FormOptionsConfig | null {
  // Photograph 类型
  if (graphType === 'photograph') {
    if (type === 'portrait') {
      return getPortraitFormOptions(language);
    } else if (type === 'landscape') {
      return getLandscapeFormOptions(language);
    } else if (type === 'cinematic') {
      return getCinematicFormOptions(language);
    } else if (type === 'commercial') {
      return getCommercialFormOptions(language);
    } else if (type === 'documentary') {
      return getDocumentaryFormOptions(language);
    }
  }
  // Design 类型
  else if (graphType === 'design') {
    if (type === '3d') {
      return get3dFormOptions(language);
    } else if (type === 'manual') {
      return getManualFormOptions(language);
    } else if (type === 'poster') {
      return getPosterFormOptions(language);
    } else if (type === 'icon') {
      return getIconFormOptions(language);
    }
  }
  // Painting 类型
  else if (graphType === 'painting') {
    if (type === 'illustration') {
      return getIllustrationFormOptions(language);
    } else if (type === 'comic') {
      return getComicFormOptions(language);
    } else if (type === 'conceptArt') {
      return getConceptArtFormOptions(language);
    } else if (type === 'cartoon') {
      return getCartoonFormOptions(language);
    }
  }
  
  return null;
}
