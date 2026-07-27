'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Grid3X3, Sparkles } from 'lucide-react';
import type { JobResultItem } from '@/adapters/types';
import { ResultImage } from '@/components/jobs/ResultImage';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { useMobileDialog } from '@/contexts/MobileDialogContext';
import { cn } from '@/lib/cn';
import { dimsFromOutputGrid } from '@/lib/grid-cell';
import { buildGridResultGroups, groupCountFromParallel } from '@/lib/grid-result-groups';
import { runToolsHdFromJob, type HdParentJobContext } from '@/lib/hd-grid-layout';
import { resolveHdSubmitMode, type HdSubmitMode } from '@/lib/tools-hd-params';
import { useProjectJobs } from '@/hooks/useProject';
import { GridContactSheetPicker } from '@/components/studio/GridContactSheetPicker';
import { HdResultsGrid } from '@/components/studio/HdResultsGrid';
import { HdUpscaleSheet } from '@/components/studio/HdUpscaleSheet';
import { ParallelSheetNav } from '@/components/studio/ParallelSheetNav';
import { FormFixedFooter } from '@/components/ui/FormFixedFooter';

function toggleInSet(prev: Set<string>, cell: string): Set<string> {
  const next = new Set(prev);
  if (next.has(cell)) next.delete(cell);
  else next.add(cell);
  return next;
}

export function GridResultPanel({
  results,
  sourceSlug,
  projectId,
  rootPlatformJobId,
  outputGrid,
  isGridShoot,
  parallelCount,
}: {
  results: JobResultItem[];
  sourceSlug: string;
  projectId: string;
  rootPlatformJobId: string;
  outputGrid?: string;
  isGridShoot?: boolean;
  parallelCount?: number;
}) {
  const hdParent: HdParentJobContext = {
    sourceGraphTaskId: rootPlatformJobId,
    outputGrid,
    sourceSlug,
    results,
  };
  const { alert } = useMobileDialog();
  const effectiveGrid = outputGrid ?? (isGridShoot ? '3x3' : undefined);
  const dims = dimsFromOutputGrid(effectiveGrid);
  const groups = useMemo(
    () => buildGridResultGroups(results, effectiveGrid, isGridShoot, parallelCount),
    [results, effectiveGrid, isGridShoot, parallelCount]
  );

  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const activeGroup = groups[activeGroupIndex] ?? groups[0];
  const batchKey = activeGroup?.key ?? 'main';

  useEffect(() => {
    if (activeGroupIndex >= groups.length) setActiveGroupIndex(0);
  }, [groups.length, activeGroupIndex]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set());
  const [viewingItem, setViewingItem] = useState<JobResultItem | null>(null);
  const [hdLoading, setHdLoading] = useState(false);
  const [hdSheetOpen, setHdSheetOpen] = useState(false);

  const { items: hdItems, refresh: refreshHd } = useProjectJobs(projectId, {
    role: 'hd',
    batchKey,
    rootPlatformJobId,
  });

  const contactSheetItem =
    activeGroup?.mode === 'contact-sheet' ? activeGroup.item : null;

  const toggleCell = useCallback((cell: string) => {
    if (!cell) return;
    setSelectedCells((prev) => toggleInSet(prev, cell));
  }, []);

  const clearGroupSelection = () => {
    setSelectedCells(new Set());
    setSelectionMode(false);
  };

  const switchGroup = (fn: (i: number) => number) => {
    setActiveGroupIndex(fn);
    clearGroupSelection();
  };

  const resolveItemForCell = useCallback(
    (cell: string): JobResultItem | null => {
      if (contactSheetItem) return contactSheetItem;
      if (activeGroup?.mode === 'split') {
        return activeGroup.items.find((i) => i.gridCell === cell) ?? null;
      }
      return null;
    },
    [contactSheetItem, activeGroup]
  );

  const selectedList = useMemo(
    () => [...selectedCells].sort(),
    [selectedCells]
  );

  const hdForCell = (cell: string) =>
    hdItems.filter((h) => h.context?.gridCell === cell);

  const openHdSheet = async () => {
    if (selectedList.length === 0) {
      await alert({
        title: '请先选格',
        message: selectionMode
          ? '点选宫格缩略图；已选的格再点一次可取消。'
          : '先点「选择宫格」进入选格模式，再点要选中的格位。',
      });
      return;
    }
    setHdSheetOpen(true);
  };

  const submitHd = async (opts: { aspectRatio: string; mode: HdSubmitMode }) => {
    if (selectedList.length === 0) return;

    setHdLoading(true);
    try {
      for (const cell of selectedList) {
        const imageItem = resolveItemForCell(cell);
        if (!imageItem) continue;
        await runToolsHdFromJob({
          item: imageItem,
          gridCell: cell,
          parent: hdParent,
          mode: resolveHdSubmitMode(hdParent, imageItem, cell),
          aspectRatio: opts.aspectRatio,
          projectId,
          rootPlatformJobId,
          batchKey,
        });
      }
      setHdSheetOpen(false);
      setSelectedCells(new Set());
      setSelectionMode(false);
      await refreshHd();
    } catch (e) {
      await alert({
        title: 'HD 提交失败',
        message: e instanceof Error ? e.message : '请稍后重试',
      });
    } finally {
      setHdLoading(false);
    }
  };

  const showNav = groups.length > 1;
  const parallelTotal = groupCountFromParallel(groups, parallelCount);

  const handleSplitCellClick = (item: JobResultItem, index: number, groupKey: string) => {
    const cell = item.gridCell ?? '';
    if (selectionMode && cell) {
      toggleCell(cell);
      return;
    }
    setViewingItem(item);
  };

  const renderSplitGrid = (items: JobResultItem[], groupKey: string) => {
    const cols = dims?.cols ?? 3;
    return (
      <div className="space-y-3">
        <p className="text-xs text-text-muted">
          {selectionMode
            ? '选格模式：点格选中，再点取消；未选格时点击查看大图。'
            : '点击缩略图查看大图；需要 HD 放大请先点底部「选择宫格」。'}
        </p>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {items.map((item, index) => {
            const cell = item.gridCell ?? '';
            const isSelected = cell ? selectedCells.has(cell) : false;
            return (
              <div key={`${groupKey}-${index}`}>
                <button
                  type="button"
                  className={cn(
                    'relative aspect-[3/4] w-full overflow-hidden rounded-xl ring-1 ring-border/60 pressable',
                    selectionMode && isSelected && 'ring-2 ring-accent',
                    !selectionMode && 'active:opacity-90'
                  )}
                  onClick={() => handleSplitCellClick(item, index, groupKey)}
                >
                  <ResultImage
                    src={item.url}
                    alt={item.label ?? cell}
                    fill
                    className="object-cover"
                    sizes="33vw"
                  />
                  {cell && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {cell}
                    </span>
                  )}
                  {selectionMode && isSelected && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-black">
                      <Check size={14} />
                    </span>
                  )}
                </button>
                {cell ? (
                  <HdResultsGrid items={hdForCell(cell)} highlightCell={cell} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderContactSheet = (item: JobResultItem) => (
    <div className="space-y-3">
      <GridContactSheetPicker
        item={item}
        dims={dims ?? { rows: 3, cols: 3, layout: '3x3' }}
        selectionMode={selectionMode}
        selectedCells={selectedCells}
        onToggleCell={toggleCell}
      />
      {selectedList.length > 0 && (
        <HdResultsGrid
          items={hdItems.filter((h) =>
            h.context?.gridCell ? selectedCells.has(h.context.gridCell) : false
          )}
        />
      )}
      {!selectionMode && selectedList.length === 0 && hdItems.length > 0 && (
        <HdResultsGrid items={hdItems} />
      )}
    </div>
  );

  const renderActiveGroup = () => {
    if (!activeGroup) return null;
    if (activeGroup.mode === 'split') {
      return renderSplitGrid(activeGroup.items, activeGroup.key);
    }
    return renderContactSheet(activeGroup.item);
  };

  const firstSelectedCell = selectedList[0];
  const sheetItem = firstSelectedCell ? resolveItemForCell(firstSelectedCell) : null;

  const footer = (
    <div className="flex w-full gap-2">
      <button
        type="button"
        onClick={() => {
          setSelectionMode((m) => {
            if (m) setSelectedCells(new Set());
            return !m;
          });
        }}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-3 text-sm font-semibold pressable',
          selectionMode
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-border bg-surface text-text-secondary'
        )}
      >
        <Grid3X3 size={18} />
        {selectionMode ? '退出选格' : '选择宫格'}
      </button>
      <button
        type="button"
        disabled={hdLoading || selectedList.length === 0}
        onClick={() => void openHdSheet()}
        className="btn-primary flex-[1.4] pressable disabled:opacity-50"
      >
        <Sparkles size={18} />
        {hdLoading
          ? '提交中…'
          : selectedList.length > 0
            ? `HD 放大 · ${selectedList.length} 格`
            : 'HD 放大'}
      </button>
    </div>
  );

  return (
    <>
      <section className="card space-y-4 p-4">
        {showNav && (
          <ParallelSheetNav
            index={activeGroupIndex}
            total={parallelTotal}
            label={
              activeGroup?.mode === 'contact-sheet' ? activeGroup.label : activeGroup?.label
            }
            onPrev={() => switchGroup((i) => Math.max(0, i - 1))}
            onNext={() => switchGroup((i) => Math.min(groups.length - 1, i + 1))}
          />
        )}

        {showNav && activeGroup ? (
          <div className="flex items-center gap-1">
            <NavSideButton
              direction="prev"
              disabled={activeGroupIndex <= 0}
              onClick={() => switchGroup((i) => Math.max(0, i - 1))}
            />
            <div className="min-w-0 flex-1">{renderActiveGroup()}</div>
            <NavSideButton
              direction="next"
              disabled={activeGroupIndex >= groups.length - 1}
              onClick={() => switchGroup((i) => Math.min(groups.length - 1, i + 1))}
            />
          </div>
        ) : (
          renderActiveGroup()
        )}

        {sheetItem && firstSelectedCell && (
          <HdUpscaleSheet
            open={hdSheetOpen}
            onClose={() => setHdSheetOpen(false)}
            item={sheetItem}
            gridCell={firstSelectedCell}
            gridCells={selectedList.length > 1 ? selectedList : undefined}
            parent={hdParent}
            loading={hdLoading}
            onConfirm={(opts) => submitHd(opts)}
          />
        )}
      </section>

      <FormFixedFooter>{footer}</FormFixedFooter>

      {viewingItem && (
        <FullscreenImageViewer
          open={Boolean(viewingItem)}
          src={viewingItem.localUrl ?? viewingItem.url}
          alt={viewingItem.label ?? viewingItem.gridCell ?? '成片'}
          subtitle={viewingItem.gridCell ? `格位 ${viewingItem.gridCell}` : '查看大图'}
          onClose={() => setViewingItem(null)}
        />
      )}
    </>
  );
}

function NavSideButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={direction === 'prev' ? '上一份' : '下一份'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted pressable',
        disabled && 'pointer-events-none opacity-30'
      )}
    >
      <Icon size={22} />
    </button>
  );
}
