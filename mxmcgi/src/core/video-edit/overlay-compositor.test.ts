import { describe, expect, it } from 'vitest';
import { buildDrawtextFilter, escapeDrawtext } from './overlay-compositor';
import { mapTransitionToXfade } from './ffmpeg-runner';

describe('overlay-compositor', () => {
  it('escapes drawtext special chars', () => {
    expect(escapeDrawtext('100%')).toBe('100\\%');
  });

  it('builds drawtext filter with fade', () => {
    const filter = buildDrawtextFilter(
      {
        id: 't1',
        trackId: 'track-text-overlay',
        startTime: 2,
        duration: 4,
        text: '芯片制程',
        style: {
          fontFamily: 'Inter',
          fontSize: 44,
          fontWeight: 700,
          fontStyle: 'normal',
          color: '#ffffff',
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          textAlign: 'center',
          verticalAlign: 'middle',
          lineHeight: 1.25,
          letterSpacing: 0,
        },
        transform: {
          position: { x: 0.5, y: 0.82 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        animation: { preset: 'fade', params: {}, inDuration: 0.55, outDuration: 0.35, unit: 'word' },
        keyframes: [],
      },
      0,
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    );
    expect(filter).toContain('drawtext=');
    expect(filter).toContain('芯片制程');
    expect(filter).toContain('enable=');
  });

  it('builds drawtext filter with stroke for yt-style overlays', () => {
    const filter = buildDrawtextFilter(
      {
        id: 't2',
        trackId: 'track-text-overlay',
        startTime: 0,
        duration: 3,
        text: '下一个 iPhone 时刻',
        style: {
          fontFamily: 'Inter',
          fontSize: 72,
          fontWeight: 900,
          fontStyle: 'normal',
          color: '#FACC15',
          strokeColor: '#0a0a0a',
          strokeWidth: 6,
          shadowOffsetX: 4,
          shadowOffsetY: 4,
          shadowColor: 'rgba(0,0,0,0.85)',
          textAlign: 'center',
          verticalAlign: 'middle',
          lineHeight: 1.15,
          letterSpacing: 1,
        },
        transform: {
          position: { x: 0.5, y: 0.48 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        animation: { preset: 'pop', params: {}, inDuration: 0.45, outDuration: 0.35, unit: 'word' },
        keyframes: [],
      },
      0,
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    );
    expect(filter).toContain('borderw=6');
    expect(filter).toContain('shadowx=4');
  });
});

describe('ffmpeg xfade map', () => {
  it('maps crossfade', () => {
    expect(mapTransitionToXfade('crossfade')).toBe('fade');
    expect(mapTransitionToXfade('dipToBlack')).toBe('fadeblack');
  });
});
