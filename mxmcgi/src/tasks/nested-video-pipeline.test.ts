import { describe, expect, it, vi } from 'vitest';

vi.mock('../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: { search: vi.fn() },
}));

import { parseNestedVideoTaskKey } from './business-pipeline';

describe('parseNestedVideoTaskKey', () => {
  it('解析 video/edit/render', () => {
    expect(parseNestedVideoTaskKey('video/edit/render')).toEqual({
      scope: 'video',
      taskKey: 'edit',
      subtype: 'render',
    });
  });

  it('非 video scope 抛错', () => {
    expect(() => parseNestedVideoTaskKey('text/plan/foo')).toThrow(/必须以 video\/ 开头/);
  });
});
