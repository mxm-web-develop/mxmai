import { describe, expect, it } from 'vitest';
import { renderDocumentPdfBuffer } from './render-document-pdf';

describe('renderDocumentPdfBuffer', () => {
  it('falls back to markdown pdf when spec missing', async () => {
    const result = await renderDocumentPdfBuffer({
      context: {
        markdown: '# Hello\n\nWorld.',
        renderer: 'styled',
        designStyle: 'modern_sidebar',
        assets: [],
      },
      spec: null,
      title: 'Hello',
    });
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.meta.usedFallback).toBe(true);
  });
});
