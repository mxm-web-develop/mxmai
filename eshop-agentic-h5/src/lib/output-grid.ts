export type OutputGridLayout = '1x1' | '2x2' | '3x3';

export const OUTPUT_GRID_LAYOUTS: OutputGridLayout[] = ['1x1', '2x2', '3x3'];

export const OUTPUT_GRID_LABELS: Record<OutputGridLayout, string> = {
  '1x1': '单张（1×1）',
  '2x2': '四宫格（2×2）',
  '3x3': '九宫格（3×3）',
};

export function cellsPerGrid(layout: OutputGridLayout): number {
  if (layout === '1x1') return 1;
  if (layout === '2x2') return 4;
  return 9;
}

export function isOutputGridLayout(v: string): v is OutputGridLayout {
  return OUTPUT_GRID_LAYOUTS.includes(v as OutputGridLayout);
}
