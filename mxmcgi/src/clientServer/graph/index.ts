/**
 * 客户端 Graph 表单选项聚合
 * 根据 graphType + type 返回对应表单配置，供 GET /getformOptions 使用
 */
import type { FormOptionsConfig } from '../shared/formOptions';
import { getFormOptions as getPortraitFormOptions } from './photograph/portrait';
import { getLandscapeFormOptions } from './photograph/landscape';
import { getCinematicFormOptions } from './photograph/cinematic';
import { getCommercialFormOptions } from './photograph/commercial';
import { getDocumentaryFormOptions } from './photograph/documentary';
import { get3dFormOptions } from './design/3d';
import { getManualFormOptions } from './design/manual';
import { getPosterFormOptions } from './design/poster';
import { getIconFormOptions } from './design/icon';
import { getCoverImageFormOptions } from './design/coverImage';
import { getUiDesignFormOptions } from './design/ui-design';
import { getIllustrationFormOptions } from './painting/illustration';
import { getComicFormOptions } from './painting/comic';
import { getConceptArtFormOptions } from './painting/conceptArt';
import { getCartoonFormOptions } from './painting/cartoon';

export function getFormOptionsForType(
  graphType: 'photograph' | 'design' | 'painting',
  type: string,
  language: 'zh' | 'en' = 'zh'
): FormOptionsConfig | null {
  if (graphType === 'photograph') {
    if (type === 'portrait') return getPortraitFormOptions(language);
    if (type === 'landscape') return getLandscapeFormOptions(language);
    if (type === 'cinematic') return getCinematicFormOptions(language);
    if (type === 'commercial') return getCommercialFormOptions(language);
    if (type === 'documentary') return getDocumentaryFormOptions(language);
  }
  if (graphType === 'design') {
    if (type === '3d') return get3dFormOptions(language);
    if (type === 'manual') return getManualFormOptions(language);
    if (type === 'poster') return getPosterFormOptions(language);
    if (type === 'icon') return getIconFormOptions(language);
    if (type === 'coverImage') return getCoverImageFormOptions(language);
    if (type === 'ui-design') return getUiDesignFormOptions(language);
  }
  if (graphType === 'painting') {
    if (type === 'illustration') return getIllustrationFormOptions(language);
    if (type === 'comic') return getComicFormOptions(language);
    if (type === 'conceptArt') return getConceptArtFormOptions(language);
    if (type === 'cartoon') return getCartoonFormOptions(language);
  }
  return null;
}
