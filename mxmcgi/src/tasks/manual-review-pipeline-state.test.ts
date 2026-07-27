import { describe, expect, it, vi } from 'vitest';

vi.mock('../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: { search: vi.fn() },
}));
vi.mock('./manual-review-store', () => ({
  setManualReviewDraft: vi.fn(),
}));

import { applyApprovedManualReview, mergeBusinessPipelineState } from './manual-review';
import type { ReviewDraftPayload } from './manual-review-types';

const originalScript = {
  version: '1.0.0',
  project: {
    timeline: {
      duration: 10,
      tracks: [
        {
          type: 'video',
          clips: [
            {
              id: 'clip-1',
              metadata: { mxmRenderMode: 'ai-video-gen', mxmPrompt: 'original' },
            },
          ],
        },
      ],
    },
  },
};

const editedScript = {
  ...originalScript,
  project: {
    ...originalScript.project,
    timeline: {
      ...originalScript.project.timeline,
      tracks: [
        {
          type: 'video',
          clips: [
            {
              id: 'clip-1',
              metadata: { mxmRenderMode: 'static-image', mxmAutoStockImage: true },
            },
          ],
        },
      ],
    },
  },
};

describe('mergeBusinessPipelineState', () => {
  it('根级 requestParams 覆盖内层 params 快照', () => {
    const merged = mergeBusinessPipelineState(
      {
        businessPipelineState: {
          videoEditScriptJson: editedScript,
          finalArtifact: { kind: 'text', text: JSON.stringify(editedScript) },
        },
      },
      {
        businessPipelineState: {
          finalArtifact: { kind: 'text', text: JSON.stringify(originalScript) },
        },
      },
      {}
    );
    expect(merged.videoEditScriptJson).toEqual(editedScript);
    const text = (merged.finalArtifact as { text?: string }).text ?? '';
    expect(text).toContain('static-image');
  });
});

describe('applyApprovedManualReview video-timeline', () => {
  it('审核通过后同步 videoEditScriptJson 到根级与内层 businessPipelineState', () => {
    const review: ReviewDraftPayload = {
      version: 1,
      gateId: 'voiceover-science-pop-review',
      phase: 'post',
      kind: 'video-timeline',
      editable: true,
      json: editedScript,
    };

    const next = applyApprovedManualReview(
      {
        params: {
          taskV2: { scope: 'video', taskKey: 'edit', subtype: 'voiceover-science-pop' },
          businessPipelineState: {
            finalArtifact: { kind: 'text', text: JSON.stringify(originalScript) },
          },
        },
        businessPipelineState: {
          finalArtifact: { kind: 'text', text: JSON.stringify(originalScript) },
          reviewCheckpoint: { phase: 'post', stepIndex: 0, completedGateIds: [] },
        },
      },
      review,
      {
        step: 'manualReview',
        params: {
          kind: 'video-timeline',
          applyMapping: {
            'state.videoEditScriptJson': '${review.json}',
          },
        },
      },
      'video'
    );

    const rootBps = next.businessPipelineState as Record<string, unknown>;
    const innerBps = (next.params as { businessPipelineState?: Record<string, unknown> })
      .businessPipelineState;

    expect(rootBps.videoEditScriptJson).toEqual(editedScript);
    expect(innerBps?.videoEditScriptJson).toEqual(editedScript);
    const clipMeta = (
      (rootBps.videoEditScriptJson as typeof editedScript).project.timeline.tracks[0]!
        .clips[0]!.metadata
    );
    expect(clipMeta.mxmRenderMode).toBe('static-image');
  });

  it('post 审核通过时保留 pendingPostResult（仅在内层 businessPipelineState）', () => {
    const pending = { text: '{}', mediaUrls: [], metadata: { orchestrator: true } };
    const review: ReviewDraftPayload = {
      version: 1,
      gateId: 'voiceover-science-pop-review',
      phase: 'post',
      kind: 'video-timeline',
      editable: true,
      json: editedScript,
    };

    const next = applyApprovedManualReview(
      {
        params: {
          taskV2: { scope: 'video', taskKey: 'edit', subtype: 'voiceover-science-pop' },
          businessPipelineState: {
            pendingPostResult: pending,
            reviewCheckpoint: { phase: 'post', stepIndex: 0, completedGateIds: [] },
          },
        },
      },
      review,
      null,
      'video'
    );

    const rootBps = next.businessPipelineState as Record<string, unknown>;
    expect(rootBps.pendingPostResult).toEqual(pending);
    expect(rootBps.businessPipelinePostDeferred).toBe(true);
    expect(rootBps.reviewCheckpoint).toEqual({
      phase: 'post',
      stepIndex: 1,
      completedGateIds: ['voiceover-science-pop-review'],
    });
  });
});
