import { describe, expect, it, vi } from 'vitest';

vi.mock('../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: { search: vi.fn() },
}));
vi.mock('./manual-review-store', () => ({
  setManualReviewDraft: vi.fn(),
}));

import { extractReviewDraftFromContext } from './manual-review';
import type { TaskContext } from './types';

const sampleProjectFile = {
  version: '1.0.0',
  project: {
    id: 'demo',
    name: 'Demo',
    timeline: {
      duration: 10,
      tracks: [
        {
          type: 'video',
          clips: [
            {
              id: 'clip-1',
              startTime: 0,
              duration: 10,
              metadata: { mxmRenderMode: 'ai-video-gen', mxmPrompt: 'hello' },
            },
          ],
        },
      ],
    },
  },
};

describe('manual-review video-timeline', () => {
  it('extractReviewDraftFromContext 解析 ProjectFile JSON', async () => {
    const ctx = {
      taskId: 't1',
      userId: 'u1',
      state: {
        finalArtifact: { text: JSON.stringify(sampleProjectFile) },
      },
      params: {},
    } as unknown as TaskContext;

    const draft = await extractReviewDraftFromContext(
      ctx,
      {
        step: 'manualReview',
        params: {
          kind: 'video-timeline',
          draftFrom: '${state.finalArtifact.text}',
          editable: true,
        },
      },
      'post',
      0
    );

    expect(draft.kind).toBe('video-timeline');
    expect(draft.editable).toBe(true);
    expect(draft.json).toMatchObject({ version: '1.0.0' });
    expect(draft.metadata?.editorKind).toBe('openreel-timeline');
  });
});
