import { describe, expect, it } from 'vitest';
import { resolveReviewTextFallback } from './resolveReviewDraftFallback';
import type { WritingTaskItem } from '../api/client';

describe('resolveReviewTextFallback', () => {
  it('优先 draft / apiText', () => {
    expect(resolveReviewTextFallback(null, { text: 'draft' } as never, 'api')).toBe('draft');
  });

  it('从 prePipelineReviewText 兜底', () => {
    const task = {
      id: 't1',
      requestParams: {
        businessPipelineState: { prePipelineReviewText: '持久化口播稿' },
      },
    } as WritingTaskItem;
    expect(resolveReviewTextFallback(task, null)).toBe('持久化口播稿');
  });
});
