import { describe, expect, it } from 'vitest';
import { formatToPdf } from './document-formatter';

describe('formatToPdf', () => {
  it('returns a valid PDF buffer', async () => {
    const buf = await formatToPdf('Hello export test.\nLine two.', 'Test Title');
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(100);
  });
});
