import { describe, expect, it } from 'vitest';
import {
  fallbackCutBeatPlan,
  mergeBeatPlanWithShotList,
  normalizeCutBeatPlan,
} from './cut-beat-plan';
import { planRhythmWindows } from './plan-cut-windows';

const subs = [
  { text: '开场白', startSeconds: 0, endSeconds: 2 },
  { text: '核心观点', startSeconds: 2, endSeconds: 4 },
  { text: '论据一', startSeconds: 4, endSeconds: 6 },
  { text: '论据二', startSeconds: 6, endSeconds: 8 },
];

describe('normalizeCutBeatPlan', () => {
  const rhythmPlan = planRhythmWindows({
    voiceoverSegmentsRaw: subs,
    totalDurationSeconds: 20,
    cutRhythm: 'default',
  });

  it('falls back to A0 when beats invalid', () => {
    const out = normalizeCutBeatPlan({ beats: [] }, rhythmPlan, subs, 20, '主题');
    expect(out.beats.length).toBe(rhythmPlan.windows.length);
  });

  it('accepts valid LLM beats covering all subtitles', () => {
    const llm = {
      global_topic: '主题',
      beats: rhythmPlan.windows.map((w, i) => ({
        beatId: `b${i + 1}`,
        startSeconds: w.startSeconds,
        endSeconds: w.endSeconds,
        durationSeconds: w.durationSeconds,
        voiceoverText: w.voiceoverText,
        subtitleSpan: w.subtitleSpan,
        beatType: 'explain',
        rhythmHint: 'normal',
      })),
    };
    const out = normalizeCutBeatPlan(llm, rhythmPlan, subs, 20, '主题');
    expect(out.beats.length).toBe(rhythmPlan.windows.length);
    expect(out.beats[0]?.beatType).toBe('explain');
  });
});

describe('mergeBeatPlanWithShotList', () => {
  it('injects timing from beat plan into shot segments', () => {
    const beatPlan = fallbackCutBeatPlan(
      planRhythmWindows({
        voiceoverSegmentsRaw: subs,
        totalDurationSeconds: 20,
        cutRhythm: 'default',
      }),
      '主题'
    );
    const shotList = {
      global_topic: '主题',
      segments: beatPlan.beats.map((b) => ({
        beatId: b.beatId,
        text: `画面：${b.voiceoverText.slice(0, 8)}`,
        mxmRenderMode: 'static-image',
        mxmStockSearchQuery: 'science technology',
      })),
    };
    const merged = mergeBeatPlanWithShotList(beatPlan, shotList);
    const segs = merged.segments as Array<Record<string, unknown>>;
    expect(segs.length).toBe(beatPlan.beats.length);
    expect(segs[0]?.startSeconds).toBe(beatPlan.beats[0]?.startSeconds);
    expect(segs[0]?.voiceover_text).toBe(beatPlan.beats[0]?.voiceoverText);
  });
});
