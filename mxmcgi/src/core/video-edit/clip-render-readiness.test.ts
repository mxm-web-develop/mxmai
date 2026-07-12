import { describe, expect, it } from 'vitest';
import {
  assertAllClipsRenderReady,
  invalidateClipsForRerender,
  isClipRenderReady,
  listBlockingClipRenders,
  validateRenderedReviewApproval,
} from './clip-render-readiness';
import type { VideoEditScript } from './types';

function makeScript(
  clips: Array<{ id: string; meta?: Record<string, unknown> }>
): VideoEditScript {
  return {
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
            clips: clips.map((c) => ({
              id: c.id,
              startTime: 0,
              duration: 5,
              metadata: c.meta,
            })),
          },
        ],
      },
    },
  } as VideoEditScript;
}

describe('clip-render-readiness', () => {
  it('isClipRenderReady requires ready status and url', () => {
    expect(
      isClipRenderReady({
        mxmRenderMode: 'ai-video-gen',
        mxmRenderStatus: 'ready',
        mxmRenderedVideoUrl: 'https://cdn/a.mp4',
      })
    ).toBe(true);
    expect(
      isClipRenderReady({
        mxmRenderMode: 'ai-video-gen',
        mxmRenderStatus: 'failed',
        mxmRenderedVideoUrl: 'https://cdn/a.mp4',
      })
    ).toBe(false);
  });

  it('listBlockingClipRenders skips non-renderable clips', () => {
    const script = makeScript([
      { id: 'a', meta: { mxmRenderMode: 'ai-video-gen', mxmRenderStatus: 'failed' } },
      { id: 'b', meta: {} },
    ]);
    expect(listBlockingClipRenders(script)).toHaveLength(1);
    expect(listBlockingClipRenders(script)[0]?.clipId).toBe('a');
  });

  it('assertAllClipsRenderReady throws when clips not ready', () => {
    const script = makeScript([
      { id: 'a', meta: { mxmRenderMode: 'static-image', mxmRenderStatus: 'pending' } },
    ]);
    expect(() => assertAllClipsRenderReady(script)).toThrow(/仍有 1 个片段未渲染完成/);
  });

  it('invalidateClipsForRerender marks targeted clips pending', () => {
    const script = makeScript([
      {
        id: 'ok',
        meta: {
          mxmRenderMode: 'ai-video-gen',
          mxmRenderStatus: 'ready',
          mxmRenderedVideoUrl: 'https://cdn/ok.mp4',
        },
      },
      {
        id: 'bad',
        meta: {
          mxmRenderMode: 'ai-video-gen',
          mxmRenderStatus: 'failed',
          mxmRenderError: 'timeout',
          mxmRenderedVideoUrl: 'https://cdn/stale.mp4',
        },
      },
    ]);
    const { script: next, retriedClipIds } = invalidateClipsForRerender(script, ['bad']);
    expect(retriedClipIds).toEqual(['bad']);
    const bad = next.project.timeline.tracks[0]!.clips.find((c) => c.id === 'bad');
    expect(bad?.metadata?.mxmRenderStatus).toBe('pending');
    expect(bad?.metadata?.mxmRenderedVideoUrl).toBeUndefined();
    expect(bad?.metadata?.mxmRenderError).toBeUndefined();
  });
});

describe('validateRenderedReviewApproval', () => {
  it('no-op for plan phase review step', () => {
    const script = makeScript([
      { id: 'a', meta: { mxmRenderMode: 'ai-video-gen', mxmRenderStatus: 'failed' } },
    ]);
    expect(() =>
      validateRenderedReviewApproval(script, { params: { timelinePhase: 'plan' } })
    ).not.toThrow();
  });

  it('throws for rendered phase when clips not ready', () => {
    const script = makeScript([
      { id: 'a', meta: { mxmRenderMode: 'ai-video-gen', mxmRenderStatus: 'failed' } },
    ]);
    expect(() =>
      validateRenderedReviewApproval(script, {
        params: { id: 'render-review', timelinePhase: 'rendered' },
      })
    ).toThrow(/仍有 1 个片段未渲染完成/);
  });

  it('passes when all renderable clips are ready', () => {
    const script = makeScript([
      {
        id: 'a',
        meta: {
          mxmRenderMode: 'ai-video-gen',
          mxmRenderStatus: 'ready',
          mxmRenderedVideoUrl: 'https://cdn/a.mp4',
        },
      },
    ]);
    expect(() =>
      validateRenderedReviewApproval(script, {
        params: { id: 'render-review', timelinePhase: 'rendered' },
      })
    ).not.toThrow();
  });
});
