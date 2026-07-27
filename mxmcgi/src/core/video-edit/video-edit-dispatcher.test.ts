import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { VideoEditScript } from './types';

const mockRunTaskV2Single = vi.fn();
const mockStatic = vi.fn();
const mockConcat = vi.fn();

vi.mock('../../tasks/task-engine', () => ({
  runTaskV2Single: (...args: unknown[]) => mockRunTaskV2Single(...args),
}));

vi.mock('./static-image-renderer', () => ({
  dispatchStaticImageHold: (...args: unknown[]) => mockStatic(...args),
}));

vi.mock('./concat-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./concat-engine')>();
  return {
    ...actual,
    concatClipsToFinal: (...args: unknown[]) => mockConcat(...args),
  };
});

function minimalScript(): VideoEditScript {
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
        duration: 10,
        tracks: [
          {
            id: 't1',
            type: 'video',
            name: 'v',
            clips: [
              {
                id: 'c-ai',
                mediaId: 'm1',
                trackId: 't1',
                startTime: 0,
                duration: 5,
                transform: {
                  position: { x: 0, y: 0 },
                  scale: { x: 1, y: 1 },
                  rotation: 0,
                  anchor: { x: 0.5, y: 0.5 },
                  opacity: 1,
                },
                volume: 0,
                keyframes: [],
                effects: [],
                audioEffects: [],
                metadata: { mxmRenderMode: 'ai-video-gen', mxmPrompt: 'test prompt' },
              },
              {
                id: 'c-static',
                mediaId: 'm2',
                trackId: 't1',
                startTime: 5,
                duration: 5,
                transform: {
                  position: { x: 0, y: 0 },
                  scale: { x: 1, y: 1 },
                  rotation: 0,
                  anchor: { x: 0.5, y: 0.5 },
                  opacity: 1,
                },
                volume: 0,
                keyframes: [],
                effects: [],
                audioEffects: [],
                metadata: {
                  mxmRenderMode: 'static-image',
                  mxmSourceImageUrl: 'https://example.com/a.png',
                },
              },
            ],
            transitions: [],
            locked: false,
            hidden: false,
            muted: false,
            solo: false,
          },
        ],
        subtitles: [],
        markers: [],
      },
    },
  } as VideoEditScript;
}

describe('dispatchVideoEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunTaskV2Single.mockResolvedValue({ syncResult: { mediaUrls: ['https://cdn/v.mp4'] } });
    mockStatic.mockResolvedValue({
      clipId: 'c-static',
      renderMode: 'static-image',
      videoUrl: 'https://cdn/static.mp4',
      durationMs: 100,
    });
    mockConcat.mockResolvedValue('https://cdn/final.mp4');
  });

  it('按 mxmRenderMode 分发并拼接最终视频', async () => {
    const { dispatchVideoEdit } = await import('./dispatcher');
    const script = minimalScript();
    const out = await dispatchVideoEdit({ script, userId: 'u1', parentTaskId: 'parent-1' });

    expect(mockRunTaskV2Single).toHaveBeenCalled();
    expect(mockStatic).toHaveBeenCalled();
    expect(out.clips).toHaveLength(2);
    expect(out.finalVideoUrl).toBe('https://cdn/final.mp4');
    expect(out.script).toBeDefined();
    expect(out.failedCount).toBe(0);
  });

  it('单 clip 失败不阻断其他 clip', async () => {
    mockStatic.mockRejectedValue(new Error('ffmpeg failed'));
    const { dispatchVideoEdit } = await import('./dispatcher');
    const out = await dispatchVideoEdit({ script: minimalScript(), userId: 'u1' });
    expect(out.failedCount).toBe(1);
    expect(out.clips.some((c) => c.clipId === 'c-static' && c.error)).toBe(true);
  });
});
