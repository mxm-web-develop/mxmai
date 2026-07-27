import { describe, expect, it } from 'vitest';
import { extractImageUrlFromTaskResult } from '../../video-edit/media-url-extract';

describe('albumImageBatch extractImageUrlFromTaskResult', () => {
  it('reads mediaUrls from syncResult (runTaskV2Single shape)', () => {
    const url = extractImageUrlFromTaskResult({
      success: true,
      taskId: 'child-1',
      status: 'completed',
      syncResult: {
        mediaUrls: ['https://example.com/img.png'],
        metadata: {},
      },
    });
    expect(url).toBe('https://example.com/img.png');
  });

  it('does not find URL on top-level when only syncResult has media', () => {
    const result = {
      success: true,
      taskId: 'child-1',
      status: 'completed',
      syncResult: {
        mediaUrls: ['https://example.com/img.png'],
      },
    };
    // 错误写法：只读顶层（旧 album-image-batch bug）
    const topLevel = (result as { mediaUrls?: string[] }).mediaUrls?.[0];
    expect(topLevel).toBeUndefined();
    expect(extractImageUrlFromTaskResult(result)).toBe('https://example.com/img.png');
  });
});
