import { describe, expect, it } from 'vitest';
import { resolveDialogueTimeline, mergeDialogueSubtitles } from './resolve-dialogue-timeline';
import { buildAdelayAmixFilter } from './dialogue-timeline-render';

describe('resolveDialogueTimeline', () => {
  it('sequences lines without cues', () => {
    const r = resolveDialogueTimeline([
      { id: 'a', duration_ms: 1000 },
      { id: 'b', duration_ms: 500 },
      { id: 'c', duration_ms: 200 },
    ]);
    expect(r.lines.map((l) => l.start_ms)).toEqual([0, 1000, 1500]);
    expect(r.totalDurationMs).toBe(1700);
  });

  it('supports negative offset overlap (interrupt)', () => {
    const r = resolveDialogueTimeline([
      { id: 'host', duration_ms: 2000 },
      {
        id: 'side',
        duration_ms: 400,
        kind: 'affirmation',
        cue: { afterLineId: 'host', offsetMs: -300 },
      },
    ]);
    expect(r.lines[1]!.start_ms).toBe(1700);
    expect(r.totalDurationMs).toBe(2100);
  });

  it('places by speech content, ignoring TTS edge pauses in markup', () => {
    // host 文件 2000ms，尾停顿 500ms；side 头停顿 200ms；offset -300 → 语音抢 300ms
    const r = resolveDialogueTimeline([
      {
        id: 'host',
        duration_ms: 2000,
        tts_markup: '<#0.3#>hello world<#0.5#>',
      },
      {
        id: 'side',
        duration_ms: 800,
        tts_markup: '<#0.2#>yeah<#0.2#>',
        kind: 'interrupt',
        cue: { afterLineId: 'host', offsetMs: -300 },
      },
    ]);
    // refSpeechEnd=2000-500=1500; speechStart=1200; fileStart=1200-200=1000
    expect(r.lines[1]!.start_ms).toBe(1000);
  });

  it('supports gapMs silence', () => {
    const r = resolveDialogueTimeline([
      { id: 'a', duration_ms: 1000 },
      { id: 'b', duration_ms: 500, cue: { afterLineId: 'a', gapMs: 200 } },
    ]);
    expect(r.lines[1]!.start_ms).toBe(1200);
  });

  it('rejects cycles', () => {
    expect(() =>
      resolveDialogueTimeline([
        { id: 'a', duration_ms: 100, cue: { afterLineId: 'b' } },
        { id: 'b', duration_ms: 100, cue: { afterLineId: 'a' } },
      ])
    ).toThrow(/环路/);
  });

  it('merges subtitles with absolute offsets', () => {
    const r = resolveDialogueTimeline([
      {
        id: 'a',
        duration_ms: 1000,
        text: '你好',
        subtitles: [{ text: '你好', startSeconds: 0, endSeconds: 0.8 }],
      },
      {
        id: 'b',
        duration_ms: 500,
        text: '嗯',
        cue: { afterLineId: 'a', offsetMs: -200 },
      },
    ]);
    const subs = mergeDialogueSubtitles(r.lines);
    expect(subs[0]!.startSeconds).toBe(0);
    expect(subs[1]!.startSeconds).toBe(0.8);
    expect(subs[1]!.text).toBe('嗯');
  });
});

describe('buildAdelayAmixFilter', () => {
  it('builds single and multi filters', () => {
    expect(buildAdelayAmixFilter([0])).toContain('adelay=0|0');
    const multi = buildAdelayAmixFilter([0, 1700, 3000]);
    expect(multi).toContain('adelay=1700|1700');
    expect(multi).toContain('amix=inputs=3');
  });
});
