import { describe, expect, it } from 'vitest';
import { attachPdfSidecarToWritingResult } from './writing-task';

describe('attachPdfSidecarToWritingResult', () => {
  it('merges sidecar pdfStorage from warp post state into writing result', () => {
    const result = attachPdfSidecarToWritingResult(
      {
        text: '# 标题\n\n正文',
        format: 'markdown',
        storageInfo: { key: 'u/writing/a.md', bucket: 'gen', url: 'https://x/a.md' },
        metadata: {
          type: 'articles',
          format: 'markdown',
          storage_form: 'markdown',
          mxmWarp: true,
        },
      },
      {
        markdownToPdfStorage: {
          key: 'u/writing/a.pdf',
          bucket: 'gen',
          url: 'https://x/a.pdf',
        },
        markdownToPdfStatus: 'ok',
        markdownToPdfStorageMode: 'sidecar',
      }
    );

    expect(result.format).toBe('markdown');
    expect(result.storageInfo?.key).toBe('u/writing/a.md');
    expect(result.metadata?.reading_format).toBe('pdf');
    expect(result.metadata?.pdfRenderStatus).toBe('ok');
    expect(result.metadata?.pdfStorage).toEqual({
      key: 'u/writing/a.pdf',
      bucket: 'gen',
      url: 'https://x/a.pdf',
    });
  });

  it('falls back to finalArtifact.metadata.pdfStorage when state key missing', () => {
    const result = attachPdfSidecarToWritingResult(
      {
        text: 'hi',
        format: 'markdown',
        metadata: { format: 'markdown' },
      },
      {
        finalArtifact: {
          kind: 'text',
          text: 'hi',
          metadata: {
            pdfStorage: { key: 'u/b.pdf', bucket: 'gen', url: 'https://x/b.pdf' },
            pdfRenderStatus: 'ok',
          },
        },
      }
    );
    expect((result.metadata?.pdfStorage as { key?: string })?.key).toBe('u/b.pdf');
    expect(result.metadata?.reading_format).toBe('pdf');
  });

  it('records failed pdf without wiping markdown storage', () => {
    const result = attachPdfSidecarToWritingResult(
      {
        text: 'md',
        format: 'markdown',
        storageInfo: { key: 'u/c.md', bucket: 'gen' },
        metadata: { format: 'markdown' },
      },
      {
        markdownToPdfStatus: 'failed',
        markdownToPdfError: 'font missing',
      }
    );
    expect(result.metadata?.pdfRenderStatus).toBe('failed');
    expect(result.metadata?.pdfRenderError).toBe('font missing');
    expect(result.storageInfo?.key).toBe('u/c.md');
    expect(result.metadata?.pdfStorage).toBeUndefined();
  });
});

describe('attachPresentationSidecarToWritingResult', () => {
  it('merges presentationStorage sidecar', async () => {
    const { attachPresentationSidecarToWritingResult } = await import('./writing-task');
    const result = attachPresentationSidecarToWritingResult(
      {
        text: '# deck',
        format: 'markdown',
        metadata: { format: 'markdown' },
      },
      {
        presentationStorage: { key: 'u/d.pptx', bucket: 'gen', url: 'https://x/d.pptx' },
        renderPptxStatus: 'ok',
        deckSlideCount: 8,
      }
    );
    expect(result.metadata?.presentationRenderStatus).toBe('ok');
    expect(result.metadata?.presentationStorage).toEqual({
      key: 'u/d.pptx',
      bucket: 'gen',
      url: 'https://x/d.pptx',
    });
    expect(result.metadata?.presentationSlideCount).toBe(8);
    expect(result.metadata?.resultKind).toBe('presentation-deck');
  });
});
