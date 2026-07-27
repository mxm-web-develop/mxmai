import { describe, expect, it } from 'vitest';
import { parseGraphMediaProxyTaskId } from './graph-tools-hd-image-io';
import {
  parseGridCellIndex,
  parseGridLayoutN,
  inferAspectRatioLabel,
  isGraphToolsHdBusiness,
  HD_PRESERVE_UPSCALE_PROMPT,
  HD_GRID_CELL_ISOLATION_PROMPT,
  buildHdUpscalePrompt,
  prepareGraphToolsHdInput,
} from './graph-tools-hd';

describe('graph-tools-hd', () => {
  it('isGraphToolsHdBusiness', () => {
    expect(isGraphToolsHdBusiness('tools', 'hd')).toBe(true);
    expect(isGraphToolsHdBusiness('photograph', 'hd')).toBe(false);
  });

  it('parseGridLayoutN', () => {
    expect(parseGridLayoutN('2x2')).toBe(2);
    expect(parseGridLayoutN('4X4')).toBe(4);
    expect(() => parseGridLayoutN('1x1')).toThrow();
    expect(() => parseGridLayoutN('5x5')).toThrow();
  });

  it('parseGridCellIndex row-major 1-based', () => {
    expect(parseGridCellIndex(2, '1-1')).toBe(0);
    expect(parseGridCellIndex(3, '2-3')).toBe(5);
    expect(() => parseGridCellIndex(2, '3-1')).toThrow();
  });

  it('inferAspectRatioLabel', () => {
    expect(inferAspectRatioLabel(1080, 1920)).toBe('9:16');
    expect(inferAspectRatioLabel(1000, 1000)).toBe('1:1');
  });

  it('HD_PRESERVE_UPSCALE_PROMPT mentions preservation', () => {
    expect(HD_PRESERVE_UPSCALE_PROMPT).toMatch(/Do NOT change/i);
    expect(HD_PRESERVE_UPSCALE_PROMPT).toMatch(/4K/i);
  });

  it('buildHdUpscalePrompt adds grid isolation when isGrid', () => {
    const grid = buildHdUpscalePrompt(undefined, true);
    expect(grid).toContain(HD_GRID_CELL_ISOLATION_PROMPT);
    expect(grid).toContain(HD_PRESERVE_UPSCALE_PROMPT);
    const single = buildHdUpscalePrompt();
    expect(single).not.toContain('GRID CELL ISOLATION');
  });

  it('parseGraphMediaProxyTaskId', () => {
    expect(parseGraphMediaProxyTaskId('http://localhost:3000/api/v1/media/graph/abc-123?token=x')).toBe(
      'abc-123'
    );
    expect(parseGraphMediaProxyTaskId('/media/graph/task%2F1')).toBe('task/1');
  });

});
