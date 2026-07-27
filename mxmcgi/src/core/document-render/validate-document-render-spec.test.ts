import { describe, expect, it } from 'vitest';
import { parseLayoutLlmOutput, validateDocumentRenderSpec } from './validate-document-render-spec';

describe('validateDocumentRenderSpec', () => {
  const baseSpec = {
    version: '1' as const,
    page: { size: 'A4' as const },
    theme: { paletteId: 'tech_blue', designStyle: 'tech_blue' },
    blocks: [{ type: 'markdown' as const, contentBinding: 'markdown' }],
  };

  it('accepts valid styled spec', () => {
    const result = validateDocumentRenderSpec(baseSpec, 'styled');
    expect(result.ok).toBe(true);
  });

  it('rejects markdown renderer with twoColumn', () => {
    const result = validateDocumentRenderSpec(
      {
        ...baseSpec,
        blocks: [{ type: 'twoColumn', left: [], right: [] }],
      },
      'markdown'
    );
    expect(result.ok).toBe(false);
  });

  it('parses fenced JSON from layout output', () => {
    const parsed = parseLayoutLlmOutput('```json\n{"version":"1"}\n```');
    expect(parsed).toEqual({ version: '1' });
  });
});
