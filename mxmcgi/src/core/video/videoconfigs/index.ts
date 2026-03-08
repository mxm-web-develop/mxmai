/**
 * 视频业务层配置
 * - getFormOptions 返回 chunk_seconds 选项（与 chunk 对齐；由开关决定：sora-2 => 4/8/12；sora-2-deer => 10/15）
 * - 批量时每段时长与参考图从 chunks 带入
 */

import { getVideoFormOptions } from './formOptions';

export type VideoBusinessMode = 'sora-2' | 'sora-2-deer';

/**
 * 视频业务层模式开关（用于经常切换）
 * - sora-2：走官方 sora-2（seconds=4/8/12）
 * - sora-2-deer：走自研 sora-2-all（seconds=10/15）
 *
 * 通过环境变量控制：
 * - CGI_VIDEO_MODE=sora-2            (默认)
 * - CGI_VIDEO_MODE=sora-2-deer
 */
export function getVideoBusinessMode(): VideoBusinessMode {
  const m = (process.env.CGI_VIDEO_MODE || 'sora-2').trim();
  return m === 'sora-2-deer' ? 'sora-2-deer' : 'sora-2';
}

/** 当前业务层固定使用的模型名（对应 src/core/video/ 下的文件名） */
export const VIDEO_BUSINESS_MODEL: VideoBusinessMode = getVideoBusinessMode();

/** 业务层支持的时长（秒） */
export function getVideoSecondsOptions(): number[] {
  return VIDEO_BUSINESS_MODEL === 'sora-2' ? [4, 8, 12] : [10, 15];
}

/**
 * 时长 -> 模型映射（业务层按模式固定一个模型）
 */
export const secondsToModel: Record<number, string> = new Proxy(
  {},
  {
    get: () => VIDEO_BUSINESS_MODEL,
  }
) as any;

/**
 * 规范化时长（按模式）：
 * - sora-2：4/8/12，其他映射到 8
 * - sora-2-deer：10/15，其他映射到 15
 */
export function normalizeSeconds(seconds: number | string | undefined): 4 | 8 | 12 | 10 | 15 {
  const n = typeof seconds === 'string' ? parseInt(seconds, 10) : Number(seconds);
  if (VIDEO_BUSINESS_MODEL === 'sora-2-deer') {
    if (n === 10) return 10;
    return 15;
  }
  if (n === 4) return 4;
  if (n === 12) return 12;
  return 8;
}

/**
 * 获取表单选项（chunk_seconds 随模式切换）
 * @param lang zh | en，默认 zh
 */
export function getFormOptions(lang: 'zh' | 'en' = 'zh') {
  return getVideoFormOptions(lang, VIDEO_BUSINESS_MODEL);
}
