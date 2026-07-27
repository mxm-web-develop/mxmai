import { describe, expect, it } from 'vitest';
import { inferUsageScope, resolveUsagePricingModelKey } from './pricing-lookup';

describe('pricing-lookup', () => {
  it('infers video scope from taskType and videoTaskKey', () => {
    expect(inferUsageScope({}, { taskType: 'video' })).toBe('video');
    expect(inferUsageScope({ videoTaskKey: 'commercial' }, {})).toBe('video');
    expect(inferUsageScope({ model: 'prediction_video' }, { taskType: 'video' })).toBe('video');
  });

  it('does not treat prediction_video as video scope without task hint', () => {
    expect(inferUsageScope({ model: 'prediction_video' }, {})).toBe('text');
  });
});
