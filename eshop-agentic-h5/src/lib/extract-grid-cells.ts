import type { ExtractedMedia } from '@/lib/task-folder/types';

type GridCellMeta = {
  index?: number;
  row?: number;
  col?: number;
  url?: string;
};

function formatGridCell(row: number, col: number): string {
  return `${row + 1}-${col + 1}`;
}

function readGridCells(obj: unknown): GridCellMeta[] | null {
  if (!obj || typeof obj !== 'object') return null;
  const cells = (obj as Record<string, unknown>).gridCells;
  if (!Array.isArray(cells) || cells.length === 0) return null;
  const parsed = cells.filter(
    (c): c is GridCellMeta =>
      c != null &&
      typeof c === 'object' &&
      typeof (c as GridCellMeta).url === 'string' &&
      (c as GridCellMeta).url!.trim().length > 0
  );
  return parsed.length > 0 ? parsed : null;
}

function findContactSheetUrl(raw: Record<string, unknown>): string | undefined {
  const urls: string[] = [];
  const collect = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    const rec = obj as Record<string, unknown>;
    if (Array.isArray(rec.mediaUrls)) {
      for (const u of rec.mediaUrls) {
        if (typeof u === 'string' && u.trim()) {
          const t = u.trim();
          if (/^https?:\/\//i.test(t) || t.startsWith('/api/')) urls.push(t);
        }
      }
    }
    if (rec.result && typeof rec.result === 'object') collect(rec.result);
    if (rec.output_data && typeof rec.output_data === 'object') collect(rec.output_data);
  };
  collect(raw);
  collect(raw.result);
  return urls[0];
}

function cellsToMedia(
  cells: GridCellMeta[],
  gridSourceUrl: string | undefined,
  labelPrefix?: string
): ExtractedMedia[] {
  return cells.map((cell, i) => {
    const row = typeof cell.row === 'number' ? cell.row : Math.floor(i / 3);
    const col = typeof cell.col === 'number' ? cell.col : i % 3;
    const gridCell = formatGridCell(row, col);
    const url = String(cell.url).trim();
    return {
      remoteUrl: url,
      type: 'image' as const,
      label: labelPrefix ? `${labelPrefix} · ${gridCell}` : `格 ${gridCell}`,
      gridCell,
      isGridCell: true,
      gridSourceUrl: gridSourceUrl ?? url,
      source: 'metadata.gridCells',
    };
  });
}

/** 优先从 metadata.gridCells 解析宫格单格成片（平台裁格后） */
export function extractGridCellsFromPlatformJob(
  raw: Record<string, unknown>,
  opts?: { labelPrefix?: string }
): ExtractedMedia[] | null {
  const sources = [
    raw.metadata,
    (raw.result as Record<string, unknown> | undefined)?.metadata,
    (raw.task as Record<string, unknown> | undefined)?.metadata,
  ];
  for (const src of sources) {
    const cells = readGridCells(src);
    if (cells?.length) {
      const sheet = findContactSheetUrl(raw);
      return cellsToMedia(cells, sheet, opts?.labelPrefix);
    }
  }
  return null;
}
