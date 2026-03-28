/**
 * 写作类型配置加载器
 * 根据 writing_type 加载对应的配置
 */

export { WRITING_MODEL_SELECTION, type TaskType, type WritingModelSelection } from './writing-models';
import { getWritingFormOptionsForType } from '../../../clientServer/writing';
import { articlesConfig, getArticlesParamsForSubtype } from './articles';
export { getArticlesFormOptions } from './articles';
import { lyricsConfig } from './lyrics';
import { outlinesConfig } from './outlines';
import { mediaPostConfig } from './media-post';
import { storyboardScriptsConfig } from './storyboard-scripts';
import { reviewsConfig } from './reviews';
import { resumesConfig } from './resumes';
import { voiceScriptsConfig } from './voice-scripts';
import type { WritingType, OutlineType } from '../type';
import type { FormOptionsConfig } from '../../../clientServer/shared/formOptions';

export interface WritingTypeConfig {
  rules: string;
  outputformat: string;
  /**
   * 获取该类型需要的参数列表
   * @returns 参数名数组，如果未定义则使用默认参数列表
   */
  getParamsForType?(): string[];
  /**
   * 获取表单选项配置
   * @param language 语言代码
   * @returns 表单选项配置，如果未定义则返回 null
   */
  getFormOptions?(language: 'zh' | 'en'): FormOptionsConfig | null;
  /**
   * 获取 Suno AI 格式的规则和输出格式（仅 lyrics 类型支持）
   * @returns Suno 格式的规则和输出格式
   */
  getSunoFormatRules?(): { rules: string; outputformat: string };
  /**
   * 获取 TTS 口播格式的规则和输出格式（仅 voice-scripts 类型支持）
   * 当 format === 'tts' 时使用
   */
  getTtsFormatRules?(): { rules: string; outputformat: string };
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
  'storyboard-scripts': storyboardScriptsConfig,
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

/**
 * 根据 writing_type 获取该类型需要的参数列表
 * @param writingType 写作类型
 * @returns 参数列表，如果类型不存在或未定义则返回默认参数列表
 */
export function getWritingParamsForType(writingType?: WritingType): string[] {
  // articles：根据细分类型返回不同参数（story-novel / academic-paper）
  // 注意：为向后兼容，第二参可选；未提供时默认按 tech-article 参数处理
  // @ts-ignore - overload implemented below
  return getWritingParamsForTypeWithSubtype(writingType);
}

export function getWritingParamsForTypeWithSubtype(
  writingType?: WritingType,
  outlineType?: OutlineType
): string[] {
  if (writingType === 'articles') {
    return getArticlesParamsForSubtype(outlineType as any);
  }
  const config = getWritingTypeConfig(writingType);
  if (config && typeof config.getParamsForType === 'function') {
    return config.getParamsForType();
  }
  // 默认返回通用参数（向后兼容）
  return ['motivation', 'stance', 'tone', 'length', 'key_elements'];
}

/**
 * 提取业务参数（根据类型动态提取）
 * @param params 完整的参数对象
 * @param writingType 写作类型
 * @returns 提取的业务参数对象
 */
export function extractWritingBusinessParams(
  params: any,
  writingType?: WritingType,
  outlineType?: OutlineType
): Record<string, any> {
  const businessParams: Record<string, any> = {};
  // 使用细分类型参数表（仅 articles 需要）
  const paramList = getWritingParamsForTypeWithSubtype(writingType, outlineType);

  for (const paramName of paramList) {
    const paramValue = params[paramName];
    if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
      // 处理数组类型（如 key_elements）
      if (Array.isArray(paramValue) && paramValue.length > 0) {
        businessParams[paramName] = paramValue;
      } else if (!Array.isArray(paramValue)) {
        businessParams[paramName] = paramValue;
      }
    }
  }

  return businessParams;
}

/** 写作类型表单选项由 clientServer 统一提供，此处复导出 */
export { getWritingFormOptionsForType } from '../../../clientServer/writing';

/**
 * 获取参数的中文标签
 * @param paramName 参数名
 * @param writingType 写作类型
 * @param language 语言代码
 * @returns 参数标签，如果不存在则返回参数名本身
 */
export function getParamLabel(
  paramName: string,
  writingType?: WritingType,
  language: 'zh' | 'en' = 'zh',
  outlineType?: OutlineType
): string {
  // 尝试从表单配置中获取标签
  const formOptions = getWritingFormOptionsForType(writingType, language, outlineType);
  if (formOptions) {
    // 从 _metadata 获取
    if (formOptions._metadata && formOptions._metadata[paramName]) {
      const metadata = formOptions._metadata[paramName];
      if (language === 'en' && metadata.labelEn) {
        return metadata.labelEn;
      }
      return metadata.label || paramName;
    }
  }

  // 默认参数标签映射（通用参数）
  const defaultLabels: Record<string, { zh: string; en: string }> = {
    motivation: { zh: '动机', en: 'Motivation' },
    stance: { zh: '立场', en: 'Stance' },
    tone: { zh: '语调', en: 'Tone' },
    length: { zh: '长度', en: 'Length' },
    key_elements: { zh: '关键要素', en: 'Key Elements' },
    maxDepth: { zh: '大纲深度', en: 'Max Depth' },
    expectedNodes: { zh: '期望节点数', en: 'Expected Nodes' },
    total_textcount: { zh: '文字总量', en: 'Total Text Count' },
    applyto: { zh: '应用于', en: 'Apply To' },
    sceneCount: { zh: '场景数量', en: 'Scene Count' },
    characterCount: { zh: '角色数量', en: 'Character Count' },
    genre: { zh: '类型', en: 'Genre' },
    duration: { zh: '时长（秒）', en: 'Duration (seconds)' },
    targetAudience: { zh: '目标受众', en: 'Target Audience' },
    adType: { zh: '广告类型', en: 'Ad Type' },
    productInfo: { zh: '产品信息', en: 'Product Information' },
    callToAction: { zh: '行动号召', en: 'Call to Action' },
    adLength: { zh: '广告时长', en: 'Ad Length' },
    workYears: { zh: '工作年限', en: 'Work Years' },
    industry: { zh: '行业领域', en: 'Industry' },
    skillFocus: { zh: '技能重点', en: 'Skill Focus' },
    targetPosition: { zh: '目标职位', en: 'Target Position' },
    highlightAchievements: { zh: '突出成就', en: 'Highlight Achievements' },
    musicStyle: { zh: '音乐风格', en: 'Music Style' },
    emotion: { zh: '情感基调', en: 'Emotion' },
    rhyme: { zh: '押韵方式', en: 'Rhyme' },
    theme: { zh: '主题内容', en: 'Theme' },
    platform: { zh: '平台', en: 'Platform' },
    hashtags: { zh: '话题标签', en: 'Hashtags' },
    reviewType: { zh: '评论类型', en: 'Review Type' },
    rating: { zh: '评分', en: 'Rating' },
    focusAreas: { zh: '关注重点', en: 'Focus Areas' },
    comparison: { zh: '对比对象', en: 'Comparison' },
  };

  const label = defaultLabels[paramName];
  if (label) {
    return language === 'en' ? label.en : label.zh;
  }

  // 如果找不到，返回参数名本身
  return paramName;
}
