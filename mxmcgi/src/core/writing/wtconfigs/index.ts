/**
 * 写作类型配置加载器
 * 根据 writing_type 加载对应的配置
 */

import { articlesConfig } from './articles';
import { lyricsConfig } from './lyrics';
import { outlinesConfig } from './outlines';
import { mediaPostConfig } from './media-post';
import { movieScriptsConfig } from './movie-scripts';
import { adScriptsConfig } from './ad-scripts';
import { reviewsConfig } from './reviews';
import { resumesConfig } from './resumes';
import { voiceScriptsConfig } from './voice-scripts';
import type { WritingType } from '../type';

export interface WritingTypeConfig {
  rules: string;
  outputformat: string;
}

/**
 * 配置映射表
 * 所有支持的写作类型都在这里注册
 */
const CONFIG_MAP: Record<string, WritingTypeConfig> = {
  articles: articlesConfig,
  lyrics: lyricsConfig,
  outlines: outlinesConfig,
  'media-post': mediaPostConfig,
  'movie-scripts': movieScriptsConfig,
  'ad-scripts': adScriptsConfig,
  reviews: reviewsConfig,
  resumes: resumesConfig,
  'voice-scripts': voiceScriptsConfig,
  // 注意：suno-lyrics 是特殊类型，走 DeerAPI，不经过配置系统
};

/**
 * 根据 writing_type 获取对应的配置
 * @param writingType 写作类型
 * @returns 配置对象，如果类型不存在则返回默认配置（articles）
 */
export function getWritingTypeConfig(writingType?: WritingType): WritingTypeConfig {
  if (!writingType) {
    return CONFIG_MAP.articles || { rules: '', outputformat: '' };
  }

  return CONFIG_MAP[writingType] || CONFIG_MAP.articles || { rules: '', outputformat: '' };
}

/**
 * 构建包含配置的系统提示词
 * @param writingType 写作类型
 * @param userPrompt 用户输入的 prompt
 * @returns 整合后的完整 prompt
 */
export function buildPromptWithConfig(
  writingType: WritingType | undefined,
  userPrompt: string
): string {
  const config = getWritingTypeConfig(writingType);
  
  let fullPrompt = userPrompt;

  // 如果有 rules 配置，添加到 prompt 开头
  if (config.rules && config.rules.trim()) {
    fullPrompt = `${config.rules}

---

${fullPrompt}`;
  }

  // 如果有 outputformat 配置，添加到 prompt 末尾
  if (config.outputformat && config.outputformat.trim()) {
    fullPrompt = `${fullPrompt}

---

${config.outputformat}`;
  }

  return fullPrompt;
}

/**
 * 获取写作类型配置的 rules 部分
 * @param writingType 写作类型
 * @returns rules 字符串，如果没有则返回空字符串
 */
export function getWritingTypeRules(writingType?: WritingType): string {
  const config = getWritingTypeConfig(writingType);
  return config.rules || '';
}

/**
 * 获取写作类型配置的 outputformat 部分
 * @param writingType 写作类型
 * @returns outputformat 字符串，如果没有则返回空字符串
 */
export function getWritingTypeOutputFormat(writingType?: WritingType): string {
  const config = getWritingTypeConfig(writingType);
  return config.outputformat || '';
}

