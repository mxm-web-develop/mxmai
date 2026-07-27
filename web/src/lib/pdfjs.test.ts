import { describe, expect, it } from 'vitest';
import { clampPdfZoom, computePdfPageScale, PDF_ZOOM_MAX, PDF_ZOOM_MIN } from './pdfjs';

describe('computePdfPageScale', () => {
  it('scales to fit container width at zoom 1', () => {
    expect(computePdfPageScale(520, 1040, 1)).toBe(0.5);
  });

  it('applies zoom factor on top of fit-width scale', () => {
    expect(computePdfPageScale(400, 800, 1.25)).toBe(0.625);
  });

  it('falls back when dimensions are invalid', () => {
    expect(computePdfPageScale(0, 800, 1)).toBe(1);
    expect(computePdfPageScale(400, 0, 0.8)).toBe(0.8);
  });
});

describe('clampPdfZoom', () => {
  it('clamps zoom to configured bounds', () => {
    expect(clampPdfZoom(0.5)).toBe(PDF_ZOOM_MIN);
    expect(clampPdfZoom(2)).toBe(PDF_ZOOM_MAX);
    expect(clampPdfZoom(1)).toBe(1);
  });
});
