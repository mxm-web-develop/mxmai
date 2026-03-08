/**
 * 写作类业务 - 客户端表单选项聚合
 * 所有 writing 表单由此统一提供，供 routes getformOptions 使用
 */
import type { FormOptionsConfig } from '../shared/formOptions';
import { getOutlinesFormOptions } from './outlines';
import { getArticlesFormOptions } from './articles';
import { getLyricsFormOptions } from './lyrics';
import { getVoiceScriptsFormOptions } from './voice-scripts';
import { getStoryboardScriptsFormOptions } from './storyboard-scripts';
import { getReviewsFormOptions } from './reviews';
import { getMediaPostFormOptions } from './media-post';
import { getResumesFormOptions } from './resumes';

export type WritingType = string;
export type OutlineType = string | undefined;

export function getWritingFormOptionsForType(
  writingType?: WritingType,
  language: 'zh' | 'en' = 'zh',
  outlineType?: OutlineType
): FormOptionsConfig | null {
  switch (writingType) {
    case 'outlines':
      return getOutlinesFormOptions(language);
    case 'articles':
      return getArticlesFormOptions(language, outlineType as 'tech-article' | 'story-novel' | 'academic-paper' | undefined);
    case 'lyrics':
      return getLyricsFormOptions(language);
    case 'voice-scripts':
      return getVoiceScriptsFormOptions(language);
    case 'storyboard-scripts':
      return getStoryboardScriptsFormOptions(language);
    case 'reviews':
      return getReviewsFormOptions(language);
    case 'media-post':
      return getMediaPostFormOptions(language);
    case 'resumes':
      return getResumesFormOptions(language);
    default:
      return null;
  }
}
