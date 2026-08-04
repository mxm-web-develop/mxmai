import { describe, expect, it } from 'vitest';
import type { WritingTaskItem } from '../api/client';
import { mergeTaskItem, resolveTaskListStatus, hasPendingManualReviewGate } from './mergeTaskItem';

const base = (over: Partial<WritingTaskItem>): WritingTaskItem => ({
  id: 't1',
  type: 'audio',
  status: 'pending',
  ...over,
});

describe('mergeTaskItem', () => {
  it('does not regress processing back to queued', () => {
    const prev = base({
      status: 'processing',
      progress: { status: 'processing', progress: 20 },
    });
    const next = base({
      status: 'queued',
      progress: { status: 'queued', progress: 0 },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.status).toBe('processing');
    expect(merged.progress?.progress).toBe(20);
  });

  it('does not regress processing back to awaiting_review', () => {
    const prev = base({
      status: 'processing',
      progress: { status: 'processing', progress: 80 },
    });
    const next = base({
      status: 'awaiting_review',
      progress: { status: 'awaiting_review', progress: 100 },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.status).toBe('processing');
    expect(merged.progress?.progress).toBe(100);
  });

  it('accepts awaiting_review → processing after review approval', () => {
    const prev = base({
      status: 'awaiting_review',
      progress: { status: 'awaiting_review', progress: 35 },
    });
    const next = base({
      status: 'processing',
      progress: { status: 'processing', progress: 90 },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.status).toBe('processing');
    expect(merged.progress?.progress).toBe(90);
  });

  it('accepts terminal status from server', () => {
    const prev = base({
      status: 'awaiting_review',
      progress: { status: 'awaiting_review', progress: 100 },
    });
    const next = base({
      status: 'completed',
      progress: { status: 'completed', progress: 100 },
      result: { metadata: { hasResult: true }, mediaUrls: [] },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.status).toBe('completed');
  });

  it('keeps contentPreview when WS empty shell merges over list row', () => {
    const prev = base({
      type: 'writing',
      status: 'completed',
      progress: { status: 'completed', progress: 100 },
      result: { contentPreview: '# 比特币跌破6.4万\n\n正文摘要…' },
    });
    const next = base({
      type: 'writing',
      status: 'completed',
      progress: { status: 'completed', progress: 100 },
      result: { metadata: { hasResult: true } },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.result?.contentPreview).toContain('比特币');
  });

  it('applies contentPreview from terminal refetch after empty WS complete', () => {
    const prev = base({
      type: 'writing',
      status: 'completed',
      progress: { status: 'completed', progress: 100 },
      result: { metadata: { hasResult: true } },
    });
    const next = base({
      type: 'writing',
      status: 'completed',
      progress: { status: 'completed', progress: 100 },
      result: { contentPreview: '# 英超20队赴美\n\n世界杯余温…' },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.result?.contentPreview).toContain('英超');
  });

  it('clears stale progress.error when status is awaiting_review', () => {
    const prev = base({
      status: 'awaiting_review',
      progress: { status: 'awaiting_review', progress: 85, error: 'JSON parse failed' },
    });
    const next = base({
      status: 'awaiting_review',
      progress: { status: 'awaiting_review', progress: 85 },
    });
    const merged = mergeTaskItem(prev, next);
    expect(merged.status).toBe('awaiting_review');
    expect(merged.progress?.error).toBeUndefined();
  });
});

describe('resolveTaskListStatus', () => {
  it('shows completed when stale awaiting_review row has 100%', () => {
    expect(
      resolveTaskListStatus(
        base({
          status: 'awaiting_review',
          progress: { status: 'awaiting_review', progress: 100 },
        })
      )
    ).toBe('completed');
  });

  it('shows completed when list summary has hasMedia without mediaUrls', () => {
    expect(
      resolveTaskListStatus(
        base({
          status: 'awaiting_review',
          progress: { status: 'awaiting_review', progress: 35 },
          result: { hasMedia: true, mediaCount: 1 },
        })
      )
    ).toBe('completed');
  });

  it('shows awaiting_review when completed status but video-timeline gate without media', () => {
    expect(
      resolveTaskListStatus(
        base({
          type: 'video',
          status: 'completed',
          progress: { status: 'completed', progress: 85, completedAt: new Date().toISOString() },
          metadata: {
            manualReviewGate: { gateId: 'g1', kind: 'video-timeline', label: '成片审核' },
          },
          result: { hasMedia: false, mediaCount: 0 },
        })
      )
    ).toBe('awaiting_review');
  });

  it('shows completed when processing row already has writing media output at 100%', () => {
    expect(
      resolveTaskListStatus(
        base({
          type: 'writing',
          status: 'processing',
          progress: { status: 'processing', progress: 100 },
          result: { hasMedia: true, mediaCount: 1, mediaUrls: ['http://x/a.md'] },
        })
      )
    ).toBe('completed');
  });

  it('shows completed for writing when status completed despite leftover text gate', () => {
    expect(
      resolveTaskListStatus(
        base({
          type: 'writing',
          status: 'completed',
          progress: { status: 'completed', progress: 100, completedAt: new Date().toISOString() },
          metadata: {
            manualReviewGate: { gateId: 'g-enrich', kind: 'text', label: '正文审核' },
          },
          result: { metadata: { hasResult: true } },
        })
      )
    ).toBe('completed');
  });
  it('shows awaiting_user_input for interactive-card gate (not 待审核)', () => {
    expect(
      resolveTaskListStatus(
        base({
          type: 'writing',
          status: 'awaiting_user_input',
          progress: { status: 'awaiting_user_input', progress: 20 },
          metadata: {
            manualReviewGate: {
              gateId: 'topic-article-pre',
              kind: 'interactive-card',
              label: '话题写作',
            },
          },
        })
      )
    ).toBe('awaiting_user_input');
  });

  it('does not remap interactive-card to awaiting_review even if status wrongly awaiting_review', () => {
    expect(
      resolveTaskListStatus(
        base({
          type: 'writing',
          status: 'awaiting_review',
          progress: { status: 'awaiting_review', progress: 20 },
          metadata: {
            manualReviewGate: {
              gateId: 'topic-article-pre',
              kind: 'interactive-card',
              label: '话题写作',
            },
          },
        })
      )
    ).toBe('awaiting_user_input');
  });
});

describe('hasPendingManualReviewGate', () => {
  it('ignores interactive-card gates', () => {
    expect(
      hasPendingManualReviewGate(
        base({
          status: 'awaiting_user_input',
          metadata: {
            manualReviewGate: { gateId: 'g1', kind: 'interactive-card', label: '话题写作' },
          },
        })
      )
    ).toBe(false);
  });
});

describe('isTaskEligibleForManualReview', () => {
  it('does not open review for completed writing with leftover gate', async () => {
    const { isTaskEligibleForManualReview } = await import('./mergeTaskItem');
    expect(
      isTaskEligibleForManualReview(
        base({
          type: 'writing',
          status: 'completed',
          progress: { status: 'completed', progress: 100 },
          metadata: {
            manualReviewGate: { gateId: 'g1', kind: 'interactive-card', label: '行业' },
          },
        })
      )
    ).toBe(false);
  });

  it('does not open modal for interactive-card (create-time guide only)', async () => {
    const { isTaskEligibleForManualReview } = await import('./mergeTaskItem');
    expect(
      isTaskEligibleForManualReview(
        base({
          type: 'writing',
          status: 'awaiting_user_input',
          progress: { status: 'awaiting_user_input', progress: 20 },
          metadata: {
            manualReviewGate: { gateId: 'g1', kind: 'interactive-card', label: '话题写作' },
          },
        })
      )
    ).toBe(false);
  });
});
