/**
 * 分镜脚本写作类型配置
 * 用于为 storyboard-scripts 类型的写作任务提供系统提示词和格式要求
 * 合并了电影剧本和广告脚本的功能
 */

import type { WritingTypeConfig } from './index';
import type { StoryboardChunkSeconds } from '../type';
import { storyboard_output_format_template_zh } from '../../../scripts/initial-prompt-data/storyboard-scripts';

/** 占位符：运行时由 DB 模板替换，用于分镜 JSON 输出格式 */
export const STORYBOARD_FORMAT_PLACEHOLDERS = {
  chunk_seconds: '{{chunk_seconds}}',
  maxChars: '{{maxChars}}',
  expectedChunkCount: '{{expectedChunkCount}}',
  approxChinese: '{{approxChinese}}',
  needMultiShotsHint: '{{needMultiShotsHint}}',
  durationHint: '{{durationHint}}',
} as const;

/** 分镜 JSON 输出格式模板（带占位符），来源：initial-prompt-data → DB extra，无 DB 时回退此处 */
export function getStoryboardChunkOutputFormatTemplate(): string {
  return storyboard_output_format_template_zh;
}

/**
 * 用运行时参数填充分镜输出格式模板（占位符替换），DB 模板与代码模板通用
 */
export function fillStoryboardOutputFormatTemplate(
  template: string,
  chunkSeconds: number,
  maxChars: number,
  expectedChunkCount?: number
): string {
  const approxChinese = Math.floor(maxChars / 1.8);
  const needMultiShotsHint =
    chunkSeconds >= 10
      ? `当 chunk_seconds ≥ 10 秒（例如 ${chunkSeconds} 秒）时，**默认必须使用多镜头 chunk（shots 数组结构）**：
  - 每个 chunk 至少拆成 2 个镜头，通常推荐 2–4 个镜头；
  - 每个镜头的 chunk_seconds 约为 3–6 秒（可根据节奏微调）；
  - **除非用户在提示中明确要求「持续长镜头 / 一镜到底」**，否则不要使用单镜头扁平结构（不要只用 video_description 一个字段表示整段 ${chunkSeconds} 秒镜头）。`
      : `当 chunk_seconds 为 ${chunkSeconds} 秒时，可以根据内容节奏选择单镜头或多镜头：推荐 1–2 个镜头，根据画面变化和节奏灵活拆分。`;
  const durationHint = expectedChunkCount != null && expectedChunkCount > 0
    ? `\n【时长与数量】期望总时长 **${expectedChunkCount * chunkSeconds} 秒**，每段 ${chunkSeconds} 秒。请**恰好**生成 **${expectedChunkCount} 个** chunk，**不得超过**该数量，否则总时长会超出用户期望。\n`
    : '';
  return template
    .replace(/\{\{chunk_seconds\}\}/g, String(chunkSeconds))
    .replace(/\{\{maxChars\}\}/g, String(maxChars))
    .replace(/\{\{expectedChunkCount\}\}/g, String(expectedChunkCount ?? ''))
    .replace(/\{\{approxChinese\}\}/g, String(approxChinese))
    .replace(/\{\{needMultiShotsHint\}\}/g, needMultiShotsHint)
    .replace(/\{\{durationHint\}\}/g, durationHint);
}

/**
 * 分镜 JSON 输出格式说明（按 chunk_seconds、maxChars、可选期望 chunk 数生成）
 * 无 DB 模板时使用代码内模板
 */
export function getStoryboardChunkOutputFormat(
  chunkSeconds: StoryboardChunkSeconds,
  maxChars: number,
  expectedChunkCount?: number
): string {
  return fillStoryboardOutputFormatTemplate(
    getStoryboardChunkOutputFormatTemplate(),
    chunkSeconds,
    maxChars,
    expectedChunkCount
  );
}

/** 分镜 chunk 时长（秒）对应的最大字符数（约），用于 LLM 按段控制篇幅；中文约 1.5–2 token/字 */
export const CHUNK_MAX_CHARS: Record<StoryboardChunkSeconds, number> = {
  4: 500,
  5: 650,
  8: 900,
  10: 1100,
  15: 1600,
  20: 2100,
  25: 2600,
};

/**
 * 分镜脚本：规则与输出格式已迁至数据库（seed 从 initial-prompt-data 写入），此处仅占位，运行时以 DB 为准
 */
export const storyboardScriptsConfig: WritingTypeConfig = {
  rules: '',
  outputformat: '',

  /**
   * 获取分镜脚本类型需要的参数列表
   */
  getParamsForType(): string[] {
    return [
      'sceneCount',
      'characterCount',
      'duration',
      'genre',
      'targetAudience',
      'rhythm',
      'productInfo',
      'callToAction',
      'storyboard_chunk_seconds',
      'storyboard_total_duration_seconds',
    ];
  },
}
