/**
 * 视频业务层表单选项（客户端兼容层）
 * 委托 getVideoFormOptionsResolved，从 Task V2 模板或通用 fallback 读取时长选项。
 */

export type { VideoFormOption, VideoFormOptionsConfig } from '../../core/video/video-form-options';

import { getVideoFormOptionsResolved } from '../../core/video/video-form-options';

/**
 * @deprecated 请使用 getVideoFormOptionsResolved；保留签名兼容旧调用（忽略 mode）
 */
export async function getVideoFormOptions(
  language: 'zh' | 'en' = 'zh',
  _legacyMode?: string,
  input?: { taskKey?: string; subtype?: string; scriptType?: string },
) {
  return getVideoFormOptionsResolved(language, input);
}
