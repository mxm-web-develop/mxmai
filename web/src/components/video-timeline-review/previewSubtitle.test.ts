import { describe, expect, it } from 'vitest';
import { findSubtitleAtTime } from './previewSubtitle';
import type { TimelineSubtitle } from './types';

const subs: TimelineSubtitle[] = [
  { id: '1', text: '各位听众', startTime: 0, endTime: 1 },
  { id: '2', text: '今天我们一起', startTime: 1, endTime: 4 },
  { id: '3', text: '这个月并没有', startTime: 4, endTime: 7 },
];

describe('findSubtitleAtTime', () => {
  it('matches subtitle at playhead', () => {
    expect(findSubtitleAtTime(subs, 6)?.text).toBe('这个月并没有');
  });

  it('matches first subtitle at t=0', () => {
    expect(findSubtitleAtTime(subs, 0)?.text).toBe('各位听众');
  });
});
