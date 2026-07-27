import type { JobResultItem } from '@/adapters/types';
import {
  dimsFromOutputGrid,
  hasSplitGridCells,
  isContactSheetResults,
} from '@/lib/grid-cell';

export type GridResultGroup =
  | {
      mode: 'split';
      key: string;
      label?: string;
      items: JobResultItem[];
    }
  | {
      mode: 'contact-sheet';
      key: string;
      label?: string;
      item: JobResultItem;
    };

function cellSortKey(cell?: string): number {
  if (!cell) return 99;
  const [r, c] = cell.split('-').map(Number);
  return (r || 0) * 10 + (c || 0);
}

function mediaUrlKey(item: JobResultItem): string {
  return (item.gridSourceUrl ?? item.remoteUrl ?? item.url ?? '').trim();
}

function labelPrefix(label?: string): string {
  if (!label?.includes(' · ')) return '';
  return label.split(' · ')[0]?.trim() ?? '';
}

function pickContactSheetItem(images: JobResultItem[]): JobResultItem {
  const withSource = images.find((i) => i.gridSourceUrl);
  return withSource ?? images[0];
}

/** 并发多份时拆成多组联系表（每份一套九宫格） */
function parallelContactSheetGroups(
  results: JobResultItem[],
  effectiveGrid?: string
): GridResultGroup[] {
  const images = results.filter((r) => r.type === 'image');
  const byUrl = new Map<string, JobResultItem>();
  for (const img of images) {
    if (img.isGridCell) continue;
    const key = mediaUrlKey(img);
    if (key && !byUrl.has(key)) byUrl.set(key, img);
  }
  if (byUrl.size > 1) {
    return [...byUrl.entries()].map(([key, item], i) => ({
      mode: 'contact-sheet' as const,
      key: `sheet-${i}`,
      label: labelPrefix(item.label) || `第 ${i + 1} 份`,
      item,
    }));
  }

  const byPrefix = new Map<string, JobResultItem>();
  for (const img of images) {
    const prefix = labelPrefix(img.label) || 'main';
    const existing = byPrefix.get(prefix);
    if (!existing || mediaUrlKey(img).length > mediaUrlKey(existing).length) {
      byPrefix.set(prefix, img.isGridCell ? pickContactSheetItem([img]) : img);
    }
  }
  if (byPrefix.size > 1) {
    return [...byPrefix.entries()].map(([prefix, item], i) => ({
      mode: 'contact-sheet' as const,
      key: prefix.startsWith('child:') ? prefix : `batch-${i}`,
      label: labelPrefix(item.label) || (prefix !== 'main' ? `第 ${i + 1} 份` : undefined),
      item: item.isGridCell ? pickContactSheetItem(images.filter((x) => labelPrefix(x.label) === labelPrefix(item.label))) : item,
    }));
  }

  const sheet = pickContactSheetItem(images);
  return sheet
    ? [{ mode: 'contact-sheet', key: 'contact', item: sheet }]
    : [];
}

export function buildGridResultGroups(
  results: JobResultItem[],
  outputGrid?: string,
  isGridShoot?: boolean,
  parallelCount?: number
): GridResultGroup[] {
  const effectiveGrid = outputGrid ?? (isGridShoot ? '3x3' : undefined);
  const dims = dimsFromOutputGrid(effectiveGrid);
  const images = results.filter((r) => r.type === 'image');
  const cells = results.filter((r) => r.isGridCell && r.type === 'image');

  if (!dims || images.length === 0) {
    return images.length
      ? [{ mode: 'split', key: 'fallback', items: images }]
      : [];
  }

  const useContactSheet =
    isContactSheetResults(images) ||
    isContactSheetResults(cells) ||
    images.length === 1 ||
    (parallelCount != null && parallelCount > 1 && cells.length < 4);

  if (useContactSheet) {
    const groups = parallelContactSheetGroups(results, effectiveGrid);
    if (groups.length > 1) return groups;
    if (groups.length === 1) return groups;
    return [
      {
        mode: 'contact-sheet',
        key: 'contact',
        item: pickContactSheetItem(images),
      },
    ];
  }

  if (hasSplitGridCells(results, effectiveGrid)) {
    const byPrefix = new Map<string, JobResultItem[]>();
    for (const c of cells) {
      const prefix = labelPrefix(c.label);
      const list = byPrefix.get(prefix) ?? [];
      list.push(c);
      byPrefix.set(prefix, list);
    }
    if (byPrefix.size > 1) {
      return [...byPrefix.entries()].map(([label, items], i) => ({
        mode: 'split' as const,
        key: label || `batch-${i}`,
        label: label || `第 ${i + 1} 份`,
        items: items.sort((a, b) => cellSortKey(a.gridCell) - cellSortKey(b.gridCell)),
      }));
    }
    return [
      {
        mode: 'split',
        key: 'main',
        items: cells.sort((a, b) => cellSortKey(a.gridCell) - cellSortKey(b.gridCell)),
      },
    ];
  }

  return parallelContactSheetGroups(results, effectiveGrid);
}

export function groupCountFromParallel(
  groups: GridResultGroup[],
  parallelCount?: number
): number {
  if (groups.length > 1) return groups.length;
  if (parallelCount != null && parallelCount > 1) return parallelCount;
  return groups.length;
}
