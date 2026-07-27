import { describe, expect, it } from 'vitest';
import { isLikelyValidAlbumSpec, normalizeAlbumSpec } from './album-spec';

describe('album-spec', () => {
  it('normalizes items and fills ids/orders', () => {
    const spec = normalizeAlbumSpec({
      title: '远程协作说明',
      aspect_ratio: '16:9',
      items: [
        { mxmImagePrompt: '三步协作流程：沟通、同步、交付', title: '三步流程' },
        { id: 'x2', order: 9, mxmImagePrompt: '隐私保护四点要点图解' },
      ],
    });
    expect(spec.items).toHaveLength(2);
    expect(spec.items[0]?.id).toBe('i1');
    expect(spec.items[0]?.order).toBe(1);
    expect(spec.items[1]?.id).toBe('x2');
    expect(spec.items[1]?.order).toBe(2);
    expect(spec.items[0]?.mxmImagePrompt).toContain('三步');
  });

  it('accepts JSON string and rejects empty items', () => {
    expect(isLikelyValidAlbumSpec('{"items":[{"mxmImagePrompt":"A"}]}')).toBe(true);
    expect(isLikelyValidAlbumSpec('{"items":[]}')).toBe(false);
  });

  it('maps core_content alias', () => {
    const spec = normalizeAlbumSpec({
      items: [{ core_content: '季度增长 37% 示意图' }],
    });
    expect(spec.items[0]?.mxmImagePrompt).toContain('37%');
  });
});
