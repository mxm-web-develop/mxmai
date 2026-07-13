import { describe, expect, it } from 'vitest';
import { subtitleTextClipsForVisualClip, textClipsForVisualClip } from './overlay-compositor';
import { subtitlesToTextClips } from './subtitle-overlay';
import type { VideoEditScript } from './types';

function minimalScript(subtitles: { id: string; text: string; startTime: number; endTime: number }[]): VideoEditScript {
  return {
    version: '1.0.0',
    project: {
      id: 'p1',
      name: 'test',
      createdAt: 0,
      modifiedAt: 0,
      settings: { width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, channels: 2 },
      mediaLibrary: { items: [] },
      timeline: {
        duration: 10,
        tracks: [],
        subtitles,
        markers: [],
      },
    },
  };
}

describe('subtitlesToTextClips', () => {
  it('converts subtitles to bottom textClips without punctuation', () => {
    const clips = subtitlesToTextClips(
      minimalScript([{ id: 's1', text: '各位听众，', startTime: 0, endTime: 2.5 }])
    );
    expect(clips).toHaveLength(1);
    expect(clips[0]?.text).toBe('各位听众');
    expect(clips[0]?.transform.position).toEqual({ x: 0.5, y: 0.85 });
  });

  it('subtitle burn clips are separate from project textClips', () => {
    const script: VideoEditScript = {
      ...minimalScript([{ id: 's1', text: '口播', startTime: 1, endTime: 3 }]),
      project: {
        ...minimalScript([]).project,
        timeline: {
          duration: 10,
          tracks: [],
          subtitles: [{ id: 's1', text: '口播', startTime: 1, endTime: 3 }],
          markers: [],
        },
        textClips: [
          {
            id: 't1',
            trackId: 'track-text-overlay',
            startTime: 1,
            duration: 2,
            text: '标题',
            style: {
              fontFamily: 'Inter',
              fontSize: 44,
              fontWeight: 700,
              fontStyle: 'normal',
              color: '#fff',
              backgroundColor: 'rgba(0,0,0,0.5)',
              textAlign: 'center',
              verticalAlign: 'middle',
              lineHeight: 1.2,
              letterSpacing: 0,
            },
            transform: {
              position: { x: 0.5, y: 0.5 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0.5, y: 0.5 },
              opacity: 1,
            },
            keyframes: [],
          },
        ],
      },
    };
    const subs = subtitleTextClipsForVisualClip(script, 0, 5);
    const overlays = textClipsForVisualClip(script, 0, 5);
    expect(subs).toHaveLength(1);
    expect(subs[0]?.text).toBe('口播');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.text).toBe('标题');
  });
});
