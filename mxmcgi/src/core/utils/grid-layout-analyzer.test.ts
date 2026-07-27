import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  analyzeGridLayout,
  buildEqualSeamBounds,
  classifyOrientation,
  hasUsableSeamBounds,
  inferAspectRatioLabel,
} from './grid-layout-analyzer';
import { splitGridLayoutImage } from './grid-layout-splitter';

const PORTRAIT_2X2 = path.resolve(process.cwd(), '../graph-f1a73ddd537f0166ed77f-1.png');
const CHAR_SHEET_3X3 = path.resolve(process.cwd(), '../graph-c59c0486d60642575bfd5-1.png');

describe('grid-layout-analyzer', () => {
  it('classifyOrientation detects portrait', () => {
    expect(classifyOrientation(1024, 1536)).toBe('portrait');
    expect(inferAspectRatioLabel(1024, 1536)).toBe('3:4');
  });

  it('buildEqualSeamBounds produces n regions', () => {
    const bounds = buildEqualSeamBounds(1024, 1536, 2);
    expect(bounds.columns.starts).toHaveLength(2);
    expect(bounds.rows.starts).toHaveLength(2);
    expect(bounds.columns.sizes[0] + bounds.columns.sizes[1]).toBe(1024);
  });
});

describe('grid-layout-analyzer integration', () => {
  it('detects dynamic gutters on portrait 2x2', async () => {
    const analysis = await analyzeGridLayout(PORTRAIT_2X2);
    expect(analysis.width).toBe(1024);
    expect(analysis.height).toBe(1536);
    expect(analysis.gridN).toBe(2);
    expect(hasUsableSeamBounds(analysis, 2)).toBe(true);
  });

  it('detects dynamic gutters on character reference 3x3', async () => {
    if (!fs.existsSync(CHAR_SHEET_3X3)) return;
    const analysis = await analyzeGridLayout(CHAR_SHEET_3X3, { gridNHint: 3 });
    expect(analysis.gridN).toBe(3);
    expect(analysis.verticalGutters).toHaveLength(2);
    expect(analysis.horizontalGutters).toHaveLength(2);
    expect(hasUsableSeamBounds(analysis, 3)).toBe(true);

    const cols = analysis.seamBounds!.columns.sizes;
    const colSum = cols.reduce((a, b) => a + b, 0);
    expect(colSum).toBe(analysis.width);
    // 非等分：左列含文字区，应明显宽于右列
    expect(Math.max(...cols) - Math.min(...cols)).toBeGreaterThan(50);
  });

  it('splits character sheet into 9 cells by detected seams', async () => {
    if (!fs.existsSync(CHAR_SHEET_3X3)) return;
    const analysis = await analyzeGridLayout(CHAR_SHEET_3X3, { gridNHint: 3 });
    const split = await splitGridLayoutImage(CHAR_SHEET_3X3, 3, {
      seamBounds: hasUsableSeamBounds(analysis, 3) ? analysis.seamBounds : null,
    });
    expect(split.images).toHaveLength(9);
    expect(split.metadata.splitMode).toBe('seams');
  });
});
