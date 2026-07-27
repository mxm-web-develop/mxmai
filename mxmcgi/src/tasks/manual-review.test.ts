import { describe, expect, it } from 'vitest';
import {
  isManualReviewStep,
  resolveGateId,
} from './manual-review-types';

describe('manualReview types', () => {
  it('resolveGateId uses explicit id when provided', () => {
    const step = {
      step: 'manualReview',
      params: { id: 'lyrics-review' },
    };
    expect(resolveGateId(step, 'pre', 2)).toBe('lyrics-review');
  });

  it('isManualReviewStep detects manualReview step', () => {
    expect(isManualReviewStep({ step: 'manualReview' })).toBe(true);
    expect(isManualReviewStep({ step: 'nestedText' })).toBe(false);
  });
});
