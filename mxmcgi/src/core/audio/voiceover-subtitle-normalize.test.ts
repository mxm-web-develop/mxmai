import { describe, expect, it } from 'vitest';
import {
  estimateSegmentsFromScript,
  normalizeFunAsrJson,
  normalizeMinimaxTtsSubtitlePayload,
  normalizeWhisperVerboseJson,
  segmentsToFullText,
} from './voiceover-subtitle-normalize';
import { extractTaskIdFromMediaUrl } from './voiceover-subtitle-resolve';

describe('voiceover-subtitle-normalize', () => {
  it('strips punctuation from MiniMax TTS sentences (ms)', () => {
    const segments = normalizeMinimaxTtsSubtitlePayload({
      sentences: [{ text: '你好，', time_begin: 0, time_end: 1200 }],
    });
    expect(segments[0]?.text).toBe('你好');
  });

  it('normalizes MiniMax TTS sentences (ms)', () => {
    const segments = normalizeMinimaxTtsSubtitlePayload({
      sentences: [
        { text: '你好', time_begin: 0, time_end: 1200 },
        { text: '世界', time_begin: 1200, time_end: 2400 },
      ],
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ text: '你好', startSeconds: 0, endSeconds: 1.2 });
    expect(segmentsToFullText(segments)).toBe('你好世界');
  });

  it('treats MiniMax time_begin/time_end as ms even when under 1000', () => {
    const segments = normalizeMinimaxTtsSubtitlePayload({
      sentences: [
        { text: '前', time_begin: 0, time_end: 800 },
        { text: '后', time_begin: 800, time_end: 1600 },
      ],
    });
    expect(segments[0]).toMatchObject({ startSeconds: 0, endSeconds: 0.8 });
    expect(segments[1]).toMatchObject({ startSeconds: 0.8, endSeconds: 1.6 });
  });

  it('normalizes FunASR segments JSON', () => {
    const segments = normalizeFunAsrJson({
      text: '你好世界',
      segments: [
        { text: '你好', startSeconds: 0, endSeconds: 0.8 },
        { text: '世界', startSeconds: 0.8, endSeconds: 1.5 },
      ],
    });
    expect(segments).toHaveLength(2);
    expect(segmentsToFullText(segments)).toBe('你好世界');
  });

  it('normalizes Whisper verbose_json segments', () => {
    const segments = normalizeWhisperVerboseJson({
      text: 'hello world',
      segments: [
        { text: ' hello', start: 0, end: 0.8 },
        { text: ' world', start: 0.8, end: 1.6 },
      ],
    });
    expect(segments).toHaveLength(2);
    expect(segments[1].endSeconds).toBe(1.6);
  });

  it('accepts raw MiniMax array payload', () => {
    const segments = normalizeMinimaxTtsSubtitlePayload([
      { text: '第一句。', time_begin: 0, time_end: 1200 },
      { text: '第二句。', time_begin: 1200, time_end: 2400 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].startSeconds).toBe(0);
    expect(segments[1].endSeconds).toBe(2.4);
  });

  it('estimates segments from script by duration', () => {
    const segments = estimateSegmentsFromScript('第一句。第二句！', 10);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[segments.length - 1].endSeconds).toBe(10);
  });
});

describe('extractTaskIdFromMediaUrl', () => {
  it('parses gateway audio media path', () => {
    expect(extractTaskIdFromMediaUrl('https://api.example.com/api/v1/media/audio/task-abc')).toBe(
      'task-abc'
    );
  });

  it('parses music path', () => {
    expect(extractTaskIdFromMediaUrl('/api/v1/media/music/m1')).toBe('m1');
  });
});
