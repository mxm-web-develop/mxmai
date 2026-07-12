import { describe, expect, it } from 'vitest';
import {
  countFailedClipRenders,
  isClipRenderReady,
  listBlockingClipRenders,
} from './clipRenderPreviewUtils';
import type { VideoEditScript } from './types';

describe('isClipRenderReady', () => {
  it('requires ready status and rendered url', () => {
    expect(
      isClipRenderReady({
        mxmRenderStatus: 'ready',
        mxmRenderedVideoUrl: '/api/v1/media/asset?bucket=a&key=b.mp4',
      })
    ).toBe(true);
  });

  it('rejects failed clips even if stale rendered url exists', () => {
    expect(
      isClipRenderReady({
        mxmRenderStatus: 'failed',
        mxmRenderedVideoUrl: '/api/v1/media/asset?bucket=a&key=b.mp4',
        mxmRenderError: '渲染失败',
      })
    ).toBe(false);
  });
});

describe('listBlockingClipRenders', () => {
  it('counts failed clips blocking rendered review approval', () => {
    const script = {
      version: '1',
      project: {
        id: 'p1',
        name: 'test',
        settings: { width: 1920, height: 1080, frameRate: 30 },
        timeline: {
          tracks: [
            {
              id: 'track-video',
              type: 'video',
              clips: [
                {
                  id: 'a',
                  startTime: 0,
                  duration: 5,
                  metadata: {
                    mxmRenderMode: 'ai-video-gen',
                    mxmRenderStatus: 'failed',
                    mxmRenderError: 'timeout',
                  },
                },
              ],
            },
          ],
        },
      },
    } as VideoEditScript;

    expect(listBlockingClipRenders(script)).toHaveLength(1);
    expect(countFailedClipRenders(script)).toBe(1);
  });
});
