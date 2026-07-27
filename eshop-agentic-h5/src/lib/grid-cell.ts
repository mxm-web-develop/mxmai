import type { JobResultItem, JobStatus } from '@/adapters/types';
import { GRID_OUTPUT_LAYOUT, isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { cellsPerGrid, isOutputGridLayout, type OutputGridLayout } from '@/lib/output-grid';

export type GridLayoutDims = { rows: number; cols: number; layout: OutputGridLayout };

function mediaUrlKey(item: JobResultItem): string {
  return (item.gridSourceUrl ?? item.remoteUrl ?? item.url ?? '').trim();
}

/** 多条结果实为同一张联系表（平台未裁格或重复条目） */
export function isContactSheetResults(items: JobResultItem[]): boolean {
  const images = items.filter((r) => r.type === 'image');
  if (images.length <= 1) return true;
  const keys = new Set(images.map(mediaUrlKey).filter(Boolean));
  return keys.size <= 1;
}

export function resolveOutputGridForJob(
  job: Pick<JobStatus, 'outputGrid' | 'results'> | null | undefined,
  slug: string
): string | undefined {
  if (job?.outputGrid && isOutputGridLayout(job.outputGrid)) return job.outputGrid;
  const cells = job?.results?.filter((r) => r.isGridCell) ?? [];
  if (cells.length >= 9) return '3x3';
  if (cells.length >= 4) return '2x2';
  if (isGridShootSlug(slug)) return GRID_OUTPUT_LAYOUT;
  return undefined;
}

export function dimsFromOutputGrid(outputGrid?: string): GridLayoutDims | null {
  if (!outputGrid || !isOutputGridLayout(outputGrid) || outputGrid === '1x1') return null;
  if (outputGrid === '2x2') return { rows: 2, cols: 2, layout: '2x2' };
  return { rows: 3, cols: 3, layout: '3x3' };
}

export function gridCellId(row: number, col: number): string {
  return `${row + 1}-${col + 1}`;
}

export function parseGridCellId(id: string): { row: number; col: number } | null {
  const m = /^(\d+)-(\d+)$/.exec(id.trim());
  if (!m) return null;
  return { row: Number(m[1]) - 1, col: Number(m[2]) - 1 };
}

/** 平台已裁格数量是否足够展示分格缩略图 */
export function hasSplitGridCells(
  results: { isGridCell?: boolean; type?: string }[],
  outputGrid?: string
): boolean {
  const dims = dimsFromOutputGrid(outputGrid);
  if (!dims) return false;
  const cells = results.filter((r) => r.isGridCell && r.type === 'image');
  return cells.length >= cellsPerGrid(dims.layout);
}
