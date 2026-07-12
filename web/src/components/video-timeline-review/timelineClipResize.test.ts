import { describe, expect, it } from 'vitest';
import { resizeClipBoundaryInScript } from './timelineClipResize';
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

describe('resizeClipBoundaryInScript', () => {
  it('resizes end boundary and shifts next clip start', () => {
    const script = makeScript([
      { id: 'a', start: 0, dur: 4 },
      { id: 'b', start: 4, dur: 6 },
    ]);
    const next = resizeClipBoundaryInScript(script, 'a', 'end', 5, 10);
    const clips = next.project.timeline.tracks[0]!.clips;
    expect(clips[0]!.duration).toBe(5);
    expect(clips[1]!.startTime).toBe(5);
    expect(clips[1]!.duration).toBe(5);
  });

  it('resizes start boundary and adjusts previous clip duration', () => {
    const script = makeScript([
      { id: 'a', start: 0, dur: 4 },
      { id: 'b', start: 4, dur: 6 },
    ]);
    const next = resizeClipBoundaryInScript(script, 'b', 'start', 3, 10);
    const clips = next.project.timeline.tracks[0]!.clips;
    expect(clips[0]!.duration).toBe(3);
    expect(clips[1]!.startTime).toBe(3);
    expect(clips[1]!.duration).toBe(7);
  });
});
