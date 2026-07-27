'use client';

import { useCallback, useState } from 'react';
import { Check, ZoomIn } from 'lucide-react';
import type { JobResultItem } from '@/adapters/types';
import { ResultImage } from '@/components/jobs/ResultImage';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { cn } from '@/lib/cn';
import { gridCellId, type GridLayoutDims } from '@/lib/grid-cell';

type Props = {
  item: JobResultItem;
  dims: GridLayoutDims;
  selectionMode: boolean;
  selectedCells: Set<string>;
  onToggleCell: (cellId: string) => void;
};

function CellOverlay({
  dims,
  selectedCells,
  onToggleCell,
}: {
  dims: GridLayoutDims;
  selectedCells: Set<string>;
  onToggleCell: (cellId: string) => void;
}) {
  const cells: { row: number; col: number; id: string }[] = [];
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.cols; col++) {
      cells.push({ row, col, id: gridCellId(row, col) });
    }
  }

  return (
    <div
      className="absolute inset-0 grid gap-px"
      style={{
        gridTemplateColumns: `repeat(${dims.cols}, 1fr)`,
        gridTemplateRows: `repeat(${dims.rows}, 1fr)`,
      }}
    >
      {cells.map(({ id }) => {
        const isSel = selectedCells.has(id);
        return (
          <button
            key={id}
            type="button"
            aria-label={`格位 ${id}${isSel ? '，已选' : ''}`}
            aria-pressed={isSel}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCell(id);
            }}
            className={cn(
              'relative pressable transition-colors',
              isSel
                ? 'bg-accent/35 ring-2 ring-inset ring-accent'
                : 'bg-black/0 hover:bg-white/10 active:bg-accent/20'
            )}
          >
            <span
              className={cn(
                'absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm',
                isSel ? 'bg-accent text-white' : 'bg-black/45 text-white/90'
              )}
            >
              {id}
            </span>
            {isSel && (
              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-black">
                <Check size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GridContactSheetPicker({
  item,
  dims,
  selectionMode,
  selectedCells,
  onToggleCell,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = item.localUrl ?? item.url;

  const openPreview = useCallback(() => setPreviewOpen(true), []);
  const closePreview = useCallback(() => setPreviewOpen(false), []);

  const selectedCount = selectedCells.size;
  const summary =
    selectedCount > 0
      ? `已选 ${selectedCount} 格：${[...selectedCells].sort().join('、')}`
      : selectionMode
        ? '选格模式：点格选中，再点取消'
        : '点击查看大图（双指/按钮缩放）';

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="card group relative w-full overflow-hidden pressable"
      >
        <div className="relative aspect-square w-full bg-surface-elevated">
          <ResultImage
            src={src}
            alt="宫格成片"
            fill
            className="object-contain"
            sizes="100vw"
          />
          {selectionMode && (
            <CellOverlay
              dims={dims}
              selectedCells={selectedCells}
              onToggleCell={onToggleCell}
            />
          )}
          {!selectionMode && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white opacity-80 backdrop-blur-sm">
                <ZoomIn size={14} />
                点击查看大图
              </span>
            </div>
          )}
        </div>
        <p className="px-3 py-2.5 text-center text-xs text-text-muted">{summary}</p>
      </button>

      <FullscreenImageViewer
        open={previewOpen}
        src={src}
        alt="宫格全图"
        subtitle={
          selectionMode
            ? selectedCount > 0
              ? `选格 · ${selectedCount} 格已选`
              : '选格模式 · 点格选中/取消'
            : '查看大图'
        }
        onClose={closePreview}
        overlay={
          selectionMode ? (
            <CellOverlay
              dims={dims}
              selectedCells={selectedCells}
              onToggleCell={onToggleCell}
            />
          ) : undefined
        }
      />
    </>
  );
}
