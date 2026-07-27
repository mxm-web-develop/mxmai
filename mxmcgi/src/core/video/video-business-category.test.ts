import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_VIDEO_GENERATOR,
  DEFAULT_NESTED_VIDEO_RENDER_KEY,
  inferVideoCategoryFromTaskKey,
  isGeneratorTaskKey,
  isUserFacingGenerator,
  normalizeVideoGeneratorRoute,
  parseNestedVideoRouteKey,
} from './video-business-category';

describe('video-business-category', () => {
  it('taskKey 即大分类', () => {
    expect(inferVideoCategoryFromTaskKey('autocut')).toBe('autocut');
    expect(inferVideoCategoryFromTaskKey('generator')).toBe('generator');
    expect(inferVideoCategoryFromTaskKey('edit')).toBe('autocut');
    expect(inferVideoCategoryFromTaskKey('resource')).toBe('generator');
  });

  it('normalizeVideoGeneratorRoute 旧 resource → generator/fragment', () => {
    expect(normalizeVideoGeneratorRoute('resource', 'fragment')).toEqual({
      taskKey: 'generator',
      subtype: 'fragment',
    });
    expect(normalizeVideoGeneratorRoute(undefined, undefined)).toEqual(DEFAULT_AI_VIDEO_GENERATOR);
  });

  it('isUserFacingGenerator 仅 canonical generator taskKey', () => {
    expect(
      isUserFacingGenerator({
        scope: 'video',
        type: 'generator',
        subtype: 'fragment',
        is_active: true,
        extra: {},
      })
    ).toBe(true);
    expect(
      isUserFacingGenerator({
        scope: 'video',
        type: 'resource',
        subtype: 'fragment',
        is_active: true,
        extra: {},
      })
    ).toBe(false);
  });

  it('parseNestedVideoRouteKey 兼容 edit/render', () => {
    expect(parseNestedVideoRouteKey('video/edit/render')).toBe(DEFAULT_NESTED_VIDEO_RENDER_KEY);
    expect(parseNestedVideoRouteKey('video/autocut/render')).toBe('video/autocut/render');
  });
});
