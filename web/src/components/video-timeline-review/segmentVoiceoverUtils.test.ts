import { describe, expect, it } from 'vitest';
import {
  distributeTextToSubtitles,
  segmentVoiceoverDisplayText,
  subtitlesForClip,
} from './segmentVoiceoverUtils';

describe('segmentVoiceoverUtils', () => {
  it('prefers mxmVoiceoverText over timeline subtitles', () => {
    const text = segmentVoiceoverDisplayText(
      { mxmVoiceoverText: '自定义口播' },
      { startTime: 0, duration: 5 },
      [{ id: 's1', text: '原字幕', startTime: 0, endTime: 5 }]
    );
    expect(text).toBe('自定义口播');
  });

  it('distributes edited segment text back to subtitles', () => {
    const subs = [
      { id: 'a', text: '旧1', startTime: 0, endTime: 2 },
      { id: 'b', text: '旧2', startTime: 2, endTime: 5 },
    ];
    const mapped = distributeTextToSubtitles('但底层有三条主线在同步加速推进', subs);
    expect(mapped.get('a')?.length).toBeGreaterThan(0);
    expect(mapped.get('b')?.length).toBeGreaterThan(0);
    expect(subtitlesForClip(subs, { startTime: 0, duration: 5 })).toHaveLength(2);
  });
});
