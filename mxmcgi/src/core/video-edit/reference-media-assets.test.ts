import { describe, expect, it } from 'vitest';
import {
  mapReferenceAssetsToVideoParams,
  normalizeReferenceAssets,
  resolveVideoModeFromReferenceAssets,
  SEEDANCE_MAX_REFERENCE_VIDEOS,
} from './reference-media-assets';
import type { MxmClipMetadata } from './types';

describe('reference-media-assets', () => {
  it('migrates legacy mxmReferenceImages', () => {
    const meta: MxmClipMetadata = {
      mxmRenderMode: 'ai-video-gen',
      mxmReferenceImages: ['https://a.jpg', 'https://b.jpg'],
    };
    expect(normalizeReferenceAssets(meta)).toHaveLength(2);
    expect(resolveVideoModeFromReferenceAssets(normalizeReferenceAssets(meta))).toBe('reference-to-video');
  });

  it('supports up to 3 reference videos', () => {
    const assets = Array.from({ length: 4 }, (_, i) => ({
      content: `https://v${i}.mp4`,
      mediaKind: 'video' as const,
    }));
    const mapped = mapReferenceAssetsToVideoParams(assets);
    expect(mapped.reference_videos).toHaveLength(SEEDANCE_MAX_REFERENCE_VIDEOS);
    expect(resolveVideoModeFromReferenceAssets(assets)).toBe('reference-to-video');
  });

  it('single image uses image-to-video', () => {
    const assets = [{ content: 'https://frame.png', mediaKind: 'image' as const }];
    expect(resolveVideoModeFromReferenceAssets(assets)).toBe('image-to-video');
  });
});
