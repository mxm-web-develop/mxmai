import { describe, expect, it } from 'vitest';
import {
  canDeleteVisualClip,
  canMergeVisualClipWithNext,
  canSplitVisualClip,
  deleteVisualClipInScript,
  mergeVisualClipWithNextInScript,
  splitVisualClipInScript,
} from './timelineEditActions';
import { collectVisualClipRefs } from './timelineClipResize';
import type { VideoEditScript } from './types';

function makeScript(clips: { id: string; start: number; dur: number }[]): VideoEditScript {
  return {
    version: '1.0.0',
    project: {
      id: 'p1',
      name: 'test',
      settings: { width: 1920, height: 1080, frameRate: 30 },
      timeline: {
        duration: clips.reduce((max, c) => Math.max(max, c.start + c.dur), 0),
        tracks: [
          {
            type: 'video',
            name: '画面',
            clips: clips.map((c) => ({
              id: c.id,
              startTime: c.start,
              duration: c.dur,
              metadata: { mxmRenderMode: 'static-image' as const },
            })),
          },
        ],
        subtitles: [],
      },
    },
  };
}

describe('timelineEditActions', () => {
  it('splits clip at playhead', () => {
    const script = makeScript([
      { id: 'a', start: 0, dur: 10 },
      { id: 'b', start: 10, dur: 5 },
    ]);
    const refs = collectVisualClipRefs(script);
    expect(canSplitVisualClip(refs, 'a', 4)).toBe(true);

    const { script: next, newClipId, error } = splitVisualClipInScript(script, 'a', 4);
    expect(error).toBeUndefined();
    expect(newClipId).toBeTruthy();
    const clips = next.project.timeline.tracks[0]!.clips;
    expect(clips).toHaveLength(3);
    expect(clips[0]!.duration).toBe(4);
    expect(clips[1]!.startTime).toBe(4);
    expect(clips[1]!.duration).toBe(6);
    expect(clips[2]!.startTime).toBe(10);
  });

  it('deletes middle clip by extending previous', () => {
    const script = makeScript([
      { id: 'a', start: 0, dur: 4 },
      { id: 'b', start: 4, dur: 3 },
      { id: 'c', start: 7, dur: 3 },
    ]);
    const { script: next, focusClipId } = deleteVisualClipInScript(script, 'b');
    const clips = next.project.timeline.tracks[0]!.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0]!.duration).toBe(7);
    expect(clips[1]!.startTime).toBe(7);
    expect(focusClipId).toBe('a');
  });

  it('merges with next clip', () => {
    const script = makeScript([
      { id: 'a', start: 0, dur: 4 },
      { id: 'b', start: 4, dur: 6 },
    ]);
    expect(canMergeVisualClipWithNext(collectVisualClipRefs(script), 'a')).toBe(true);
    const { script: next, focusClipId } = mergeVisualClipWithNextInScript(script, 'a');
    const clips = next.project.timeline.tracks[0]!.clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]!.duration).toBe(10);
    expect(focusClipId).toBe('a');
  });

  it('cannot delete last remaining clip', () => {
    const script = makeScript([{ id: 'a', start: 0, dur: 10 }]);
    expect(canDeleteVisualClip(collectVisualClipRefs(script))).toBe(false);
    const { error } = deleteVisualClipInScript(script, 'a');
    expect(error).toContain('至少保留');
  });
});
