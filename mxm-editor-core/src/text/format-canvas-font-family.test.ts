import { describe, expect, it } from 'vitest';
import { formatCanvasFontFamily } from './title-engine';

describe('formatCanvasFontFamily', () => {
  it('keeps CSS font-family lists intact (no double quotes)', () => {
    const family =
      '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", Inter, system-ui, sans-serif';
    expect(formatCanvasFontFamily(family)).toBe(family);
  });

  it('quotes multi-word single families', () => {
    expect(formatCanvasFontFamily('PingFang SC')).toBe('"PingFang SC"');
  });

  it('leaves simple identifiers alone', () => {
    expect(formatCanvasFontFamily('Inter')).toBe('Inter');
  });
});
