/**
 * AI 生图 / 生视频 prompt 分字段解析。
 * 新分镜写 mxmVideoPrompt / mxmImagePrompt；旧数据可回退 mxmPrompt。
 */

export type AiPromptSource = {
  mxmVideoPrompt?: string;
  mxmImagePrompt?: string;
  /** @deprecated 兼容旧 shot-list / 旧 timeline；勿再新写 */
  mxmPrompt?: string;
};

export function resolveAiVideoPrompt(src: AiPromptSource | null | undefined): string {
  if (!src) return '';
  return src.mxmVideoPrompt?.trim() || src.mxmPrompt?.trim() || '';
}

export function resolveAiImagePrompt(src: AiPromptSource | null | undefined): string {
  if (!src) return '';
  return src.mxmImagePrompt?.trim() || src.mxmPrompt?.trim() || '';
}

export function hasAiVideoPrompt(src: AiPromptSource | null | undefined): boolean {
  return Boolean(resolveAiVideoPrompt(src));
}

export function hasAiImagePrompt(src: AiPromptSource | null | undefined): boolean {
  return Boolean(resolveAiImagePrompt(src));
}
