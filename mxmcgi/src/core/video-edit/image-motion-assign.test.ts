import { describe, expect, it } from 'vitest';
import { assignAlternatingImageMotion } from './image-motion-assign';
import type { VideoEditScript } from './types';

function makeScript(clips: Array<{ id: string; mode: string; aiKind?: string }>): VideoEditScript {
  return {
    version: '1.0.0',
    project: {
      id: 'p1',
      name: 'test',
      createdAt: 1,
      modifiedAt: 1,
      settings: { width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, channels: 2 },
      mediaLibrary: { items: [] },
      timeline: {
        duration: clips.length * 5,
        tracks: [
          {
            id: 'track-video',
            type: 'video',
            name: '画面',
            clips: clips.map((c, i) => ({
              id: c.id,
              trackId: 'track-video',
              mediaId: '',
              startTime: i * 5,
              duration: 5,
              type: 'video' as const,
              metadata: {
                mxmRenderMode: c.mode,
                ...(c.aiKind ? { mxmAiOutputKind: c.aiKind } : {}),
              },
            })),
            transitions: [],
            locked: false,
            hidden: false,
            muted: false,
            solo: false,
          },
        ],
        subtitles: [],
      },
    },
  };
}

describe('assignAlternatingImageMotion', () => {
  it('alternates pan-left and pan-right for static-image clips', () => {
    const script = makeScript([
      { id: 'c1', mode: 'static-image' },
      { id: 'c2', mode: 'static-image' },
      { id: 'c3', mode: 'static-image' },
    ]);
    assignAlternatingImageMotion(script);
    const meta = (id: string) =>
      script.project.timeline.tracks[0]!.clips.find((c) => c.id === id)!.metadata as Record<
        string,
        unknown
      >;
    expect(meta('c1').mxmImageMotionEnabled).toBe(true);
    expect(meta('c1').mxmImageMotion).toBe('pan-left');
    expect(meta('c2').mxmImageMotion).toBe('pan-right');
    expect(meta('c3').mxmImageMotion).toBe('pan-left');
  });

  it('uses zoom alternate for ai image clips', () => {
    const script = makeScript([
      { id: 'c1', mode: 'ai-video-gen', aiKind: 'image' },
      { id: 'c2', mode: 'ai-video-gen', aiKind: 'image' },
    ]);
    assignAlternatingImageMotion(script, { preset: 'zoom-alternate' });
    const meta = (id: string) =>
      script.project.timeline.tracks[0]!.clips.find((c) => c.id === id)!.metadata as Record<
        string,
        unknown
      >;
    expect(meta('c1').mxmImageMotion).toBe('zoom-in');
    expect(meta('c2').mxmImageMotion).toBe('zoom-out');
  });

  it('skips clips with motion explicitly disabled', () => {
    const script = makeScript([{ id: 'c1', mode: 'static-image' }]);
    script.project.timeline.tracks[0]!.clips[0]!.metadata = {
      mxmRenderMode: 'static-image',
      mxmImageMotionEnabled: false,
    };
    assignAlternatingImageMotion(script);
    const meta = script.project.timeline.tracks[0]!.clips[0]!.metadata as Record<string, unknown>;
    expect(meta.mxmImageMotionEnabled).toBe(false);
    expect(meta.mxmImageMotion).toBeUndefined();
  });
});
