import { describe, expect, it } from 'vitest';
import {
  countAlbumItemsFromParams,
  countTimelineAiUsage,
} from './estimate-pipeline-helpers';

describe('estimate-pipeline-helpers', () => {
  it('countAlbumItemsFromParams reads items length', () => {
    expect(
      countAlbumItemsFromParams({
        album_spec: {
          title: 't',
          items: [
            { id: '1', order: 1, title: 'a', mxmImagePrompt: 'p1' },
            { id: '2', order: 2, title: 'b', mxmImagePrompt: 'p2' },
          ],
        },
      }),
    ).toBe(2);
  });

  it('countAlbumItemsFromParams accepts reviewJson', () => {
    expect(
      countAlbumItemsFromParams({
        reviewJson: { items: [{ id: '1', order: 1, title: 'a', mxmImagePrompt: 'x' }] },
      }),
    ).toBe(1);
  });

  it('countTimelineAiUsage splits image vs video AI clips', () => {
    const usage = countTimelineAiUsage({
      reviewJson: {
        segments: [
          { mxmRenderMode: 'static-image' },
          { mxmRenderMode: 'ai-video-gen', mxmAiOutputKind: 'image' },
          { mxmRenderMode: 'ai-video-gen', mxmAiOutputKind: 'video' },
          { mxmRenderMode: 'ai-video-gen', mxmAiOutputKind: 'video' },
        ],
      },
    });
    expect(usage.imageCount).toBe(1);
    expect(usage.videoClipCount).toBe(2);
  });
});
