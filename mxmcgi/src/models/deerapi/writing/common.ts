/**
 * DeerAPI writing 模型共用：将 provider 返回的 GenerateResult 映射为带 text/stream 的写作结果
 */
import type { GenerateResult } from '../../providers';

export interface WritingResult extends GenerateResult {
  text?: string;
}

export function mapProviderResultToWritingResult(result: GenerateResult): WritingResult {
  let text = '';
  if (result.metadata?.text) {
    text = result.metadata.text;
  } else if (Array.isArray(result.mediaUrls) && result.mediaUrls.length > 0) {
    text = result.mediaUrls.join('');
  } else if (result.mediaUrls?.length) {
    text = result.mediaUrls[0];
  }
  return {
    ...result,
    text: text || undefined,
  };
}
