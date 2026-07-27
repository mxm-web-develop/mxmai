import { beforeAll, describe, expect, it } from 'vitest';
import type { WritingTaskItem } from '../api/client';
import { extractAutocutClipPreviews } from './autocutClipPreviews';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
    configurable: true,
  });
});

function makeTask(script: unknown): WritingTaskItem {
  return {
    id: 'parent-1',
    type: 'video',
    status: 'completed',
    requestParams: {
      businessPipelineState: {
        videoEditScriptJson: script,
      },
    },
  } as WritingTaskItem;
}

describe('extractAutocutClipPreviews', () => {
  it('extracts AI video and image clips from OpenReel script', () => {
    const task = makeTask({
      project: {
        timeline: {
          tracks: [
            {
              clips: [
                {
                  id: 'c1',
                  metadata: {
                    mxmRenderMode: 'ai-video-gen',
                    mxmAiOutputKind: 'video',
                    mxmRenderedVideoUrl: '/api/v1/media/asset?bucket=v&key=a.mp4',
                    mxmRenderStatus: 'ready',
                    mxmAiGenTaskId: 'child-video-1',
                    mxmPrompt: '开场城市夜景',
                  },
                },
                {
                  id: 'c2',
                  metadata: {
                    mxmRenderMode: 'ai-video-gen',
                    mxmAiOutputKind: 'image',
                    mxmAiGeneratedImageUrl: '/api/v1/media/asset?bucket=g&key=b.png',
                    mxmAiGenTaskId: 'child-image-1',
                    mxmPrompt: '产品特写插图',
                  },
                },
              ],
            },
          ],
        },
      },
    });

    const clips = extractAutocutClipPreviews(task);
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({
      clipId: 'c1',
      kind: 'video',
      childTaskId: 'child-video-1',
    });
    expect(clips[1]).toMatchObject({
      clipId: 'c2',
      kind: 'image',
      childTaskId: 'child-image-1',
    });
    expect(clips[0]!.url).toContain('/api/v1/media/asset');
  });

  it('returns empty when no script', () => {
    expect(extractAutocutClipPreviews({ id: 'x', type: 'video', status: 'pending' } as WritingTaskItem)).toEqual(
      []
    );
  });

  it('reads list clipPreviewSummary without full script', () => {
    const task = {
      id: 'parent-2',
      type: 'video',
      status: 'completed',
      requestParams: {
        businessPipelineState: {
          clipPreviewSummary: [
            {
              clipId: 'c9',
              kind: 'image',
              url: '/api/v1/media/asset?bucket=g&key=z.png',
              label: '配图',
              childTaskId: 'img-1',
            },
          ],
        },
      },
    } as WritingTaskItem;
    expect(extractAutocutClipPreviews(task)).toEqual([
      {
        clipId: 'c9',
        kind: 'image',
        url: expect.stringContaining('/api/v1/media/asset'),
        label: '配图',
        childTaskId: 'img-1',
      },
    ]);
  });
});
