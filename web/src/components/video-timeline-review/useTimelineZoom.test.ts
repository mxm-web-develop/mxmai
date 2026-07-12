import { describe, expect, it } from 'vitest';
import { buildRulerTicks, pickRulerInterval } from './useTimelineZoom';

describe('useTimelineZoom helpers', () => {
  it('pickRulerInterval increases with zoom out', () => {
    expect(pickRulerInterval(150)).toBe(0.5);
    expect(pickRulerInterval(40)).toBe(2);
    expect(pickRulerInterval(5)).toBe(15);
  });

  it('buildRulerTicks covers full duration', () => {
    const ticks = buildRulerTicks(10, 40);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(10);
    expect(ticks.length).toBeGreaterThan(2);
  });
});
