import { describe, expect, it } from 'vitest';
import { resolveAiImageLeafRoute } from './graph-image-business';

describe('resolveAiImageLeafRoute', () => {
  it('maps album/group route to content-illustration leaf', () => {
    expect(resolveAiImageLeafRoute('group', 'content-album')).toEqual({
      taskKey: 'design',
      subtype: 'content-illustration',
    });
  });

  it('keeps content-illustration as-is', () => {
    expect(resolveAiImageLeafRoute('design', 'content-illustration')).toEqual({
      taskKey: 'design',
      subtype: 'content-illustration',
    });
  });
});
