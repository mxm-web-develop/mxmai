import { describe, expect, it } from 'vitest';
import { formatTimelineTime } from './useTimelinePlayback';

describe('formatTimelineTime', () => {
  it('formats sub-minute times', () => {
    expect(formatTimelineTime(2.04)).toBe('2.0s');
  });

  it('formats minute times', () => {
    expect(formatTimelineTime(65.5)).toBe('1:05.5');
  });
});
