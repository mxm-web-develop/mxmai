import { describe, expect, it } from 'vitest';
import { reconstructReviewDraftFromTask } from './manual-review-draft-reconstruct';

describe('reconstructReviewDraftFromTask', () => {
  it('从 prePipelineReviewText 恢复口播稿审核', () => {
    const draft = reconstructReviewDraftFromTask(
      {
        requestParams: {
          businessPipelineState: {
            prePipelineReviewText: '大家好，欢迎收听本期节目。',
          },
        },
        metadata: {
          manualReviewGate: {
            gateId: 'script-draft-review',
            phase: 'pre',
            kind: 'text',
            label: '口播稿审核',
          },
        },
      },
      'script-draft-review'
    );
    expect(draft?.text).toBe('大家好，欢迎收听本期节目。');
    expect(draft?.kind).toBe('text');
  });

  it('优先使用 pendingReviewDraft 快照', () => {
    const draft = reconstructReviewDraftFromTask(
      {
        requestParams: {
          businessPipelineState: {
            prePipelineReviewText: '旧文本',
            pendingReviewDraft: {
              version: 1,
              gateId: 'script-draft-review',
              phase: 'pre',
              kind: 'text',
              text: '快照正文',
              editable: true,
            },
          },
        },
        metadata: {
          manualReviewGate: { gateId: 'script-draft-review', phase: 'pre', kind: 'text' },
        },
      },
      'script-draft-review'
    );
    expect(draft?.text).toBe('快照正文');
  });

  it('无可用内容时返回 null', () => {
    expect(
      reconstructReviewDraftFromTask(
        {
          requestParams: { businessPipelineState: {} },
          metadata: {
            manualReviewGate: { gateId: 'script-draft-review', phase: 'pre', kind: 'text' },
          },
        },
        'script-draft-review'
      )
    ).toBeNull();
  });
});
