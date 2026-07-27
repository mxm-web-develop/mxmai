/**
 * 写作业务接口 key 推导
 * 与 BUSINESS_INTERFACE_SPEC 一致：业务 key 与 WritingType 对齐，用于路由解析与提示词工程
 */

import type { WritingType } from './type';
import type { OutlineApplyTo } from './type';
import type { TaskType } from './wtconfigs/writing-models';

const WRITING_TYPE_TO_BUSINESS_KEY: Record<string, string> = {
  outlines: 'writing-outlines',
  articles: 'writing-articles',
  lyrics: 'writing-lyrics',
  'suno-lyrics': 'writing-lyrics',
  'voice-scripts': 'writing-voice-scripts',
  'storyboard-scripts': 'writing-storyboard-scripts',
  'media-post': 'writing-media-post',
  reviews: 'writing-reviews',
  resumes: 'writing-resumes',
  business: 'writing-business',
  // 自定义业务（scope=writing, task_key=xxx）
  academy: 'writing-academy',
};

/**
 * 根据写作类型得到业务接口 key
 */
export function getWritingBusinessKey(writingType: WritingType | string): string {
  return WRITING_TYPE_TO_BUSINESS_KEY[writingType] ?? 'writing-articles';
}

/**
 * 根据任务参数推导业务 key（用于 outline / paragraph / full）
 * - outline：若有 applyto 则用目标业务（writing-articles / writing-voice-scripts / writing-storyboard-scripts），否则 writing-outlines
 * - paragraph / full：按 writing_type 映射为 writing-*
 */
export function getWritingBusinessKeyFromParams(
  params: {
    writing_type?: WritingType | string;
    applyto?: OutlineApplyTo | string;
  },
  taskType: TaskType
): string {
  const writingType = params.writing_type || 'articles';
  if (taskType === 'outline') {
    const applyto = params.applyto;
    if (applyto === 'articles' || applyto === 'voice-scripts' || applyto === 'storyboard-scripts') {
      return getWritingBusinessKey(applyto);
    }
    return getWritingBusinessKey(params.writing_type === 'outlines' ? 'outlines' : writingType);
  }
  return getWritingBusinessKey(writingType);
}
