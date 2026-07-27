'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Film, Grid3X3, Sparkles } from 'lucide-react';
import type { JobResultItem } from '@/adapters/types';
import { ResultImage } from '@/components/jobs/ResultImage';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';
import { useMobileDialog } from '@/contexts/MobileDialogContext';
import { cn } from '@/lib/cn';
import { runToolsHdFromJob, type HdParentJobContext } from '@/lib/hd-grid-layout';
import { resolveHdSubmitMode } from '@/lib/tools-hd-params';
import { HdUpscaleSheet } from '@/components/studio/HdUpscaleSheet';
import { FormFixedFooter } from '@/components/ui/FormFixedFooter';
import { HdResultsStrip } from '@/components/studio/HdResultsStrip';
import { useProjectJobs } from '@/hooks/useProject';
import type { HdSubmitMode } from '@/lib/tools-hd-params';

export function ResultGrid({
  results,
  outputGrid,
  sourceSlug,
  projectId,
  rootPlatformJobId,
  isGridShoot,
  clothesLine,
}: {
  results: JobResultItem[];
  outputGrid?: string;
  sourceSlug?: string;
  projectId: string;
  rootPlatformJobId: string;
  isGridShoot?: boolean;
  clothesLine?: 'women' | 'men' | 'kids';
}) {
  const router = useRouter();
  const { alert: showAlert } = useMobileDialog();
  const isGridLayout = outputGrid && outputGrid !== '1x1';
  const selectable = isGridLayout || results.some((r) => r.isGridCell);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [hdLoading, setHdLoading] = useState(false);
  const [hdSheetOpen, setHdSheetOpen] = useState(false);

  const { items: hdItems, refresh: refreshHd } = useProjectJobs(projectId, {
    role: 'hd',
    batchKey: 'main',
    rootPlatformJobId,
  });

  const cols =
    outputGrid === '3x3' ? 3 : outputGrid === '2x2' && results.length >= 4 ? 2 : results.length > 1 ? 2 : 1;

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectedItems = results.filter((_, i) => selected.has(i));
  const hdParent: HdParentJobContext = {
    sourceGraphTaskId: rootPlatformJobId,
    outputGrid,
    sourceSlug,
    results,
  };

  const hdForCell = (cell: string) =>
    hdItems.filter((h) => h.context?.gridCell === cell);

  const handleMakeVideo = (item: JobResultItem) => {
    const prefill = {
      hero_still_images: [{ content: item.url, type: 'main-subject' as const }],
      motion_preset: 'gentle_turn',
      ratio: '9:16',
      resolution: '720p',
      duration: 5,
      product_title: clothesLine === 'women' ? '女装' : clothesLine === 'men' ? '男装' : '童装',
    };
    sessionStorage.setItem('eshop-video-prefill', JSON.stringify(prefill));
    router.push(
      `/create/${S.clothesVideo}?prefill=1&projectId=${encodeURIComponent(projectId)}`
    );
  };

  const submitHd = async (opts: { aspectRatio: string; mode: HdSubmitMode }) => {
    if (!selectedItems.length || !sourceSlug) return;
    setHdLoading(true);
    try {
      for (const item of selectedItems) {
        await runToolsHdFromJob({
          item,
          gridCell: item.gridCell,
          parent: hdParent,
          mode: resolveHdSubmitMode(hdParent, item, item.gridCell),
          aspectRatio: opts.aspectRatio,
          projectId,
          rootPlatformJobId,
          batchKey: 'main',
        });
      }
      setHdSheetOpen(false);
      setSelected(new Set());
      setSelectionMode(false);
      await refreshHd();
    } catch (e) {
      await showAlert({
        title: 'HD 提交失败',
        message: e instanceof Error ? e.message : '请稍后重试',
      });
    } finally {
      setHdLoading(false);
    }
  };

  const openHdSheet = async () => {
    if (selected.size === 0) {
      await showAlert({
        title: '请先选格',
        message: selectionMode
          ? '点选宫格；已选的再点一次可取消。'
          : '先点「选择宫格」，再点要选中的格位。',
      });
      return;
    }
    setHdSheetOpen(true);
  };

  const handleCellClick = (i: number, canSelect: boolean) => {
    if (!canSelect) return;
    if (selectionMode) {
      toggleSelect(i);
    } else {
      setViewingIndex(i);
    }
  };

  const viewingItem = viewingIndex != null ? results[viewingIndex] : null;
  const firstSelected = selectedItems[0];
  const selectedCells = selectedItems
    .map((it) => it.gridCell)
    .filter((c): c is string => Boolean(c));

  return (
    <>
      <div className="space-y-4">
        {selectable && (
          <p className="text-sm text-text-muted">
            {selectionMode
              ? '选格模式：点格选中/取消，选好后点 HD 放大。'
              : '点击缩略图查看大图；HD 放大请先点底部「选择宫格」。'}
          </p>
        )}

        <div
          className={cn(
            'grid gap-3',
            cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {results.map((item, i) => {
            const isSelected = selected.has(i);
            const canSelect = selectable && item.type === 'image';
            const cell = item.gridCell ?? '';
            return (
              <div key={i}>
                <div
                  role={canSelect ? 'button' : undefined}
                  tabIndex={canSelect ? 0 : undefined}
                  className={cn(
                    'group relative overflow-hidden rounded-xl bg-surface-elevated pressable',
                    canSelect && 'cursor-pointer',
                    selectionMode && isSelected && 'ring-2 ring-accent'
                  )}
                  onClick={() => handleCellClick(i, canSelect)}
                  onKeyDown={(e) => {
                    if (canSelect && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleCellClick(i, canSelect);
                    }
                  }}
                >
                  {item.type === 'video' ? (
                    <div className="relative aspect-[9/16] bg-black">
                      <ResultImage
                        src={item.url}
                        alt={item.label ?? ''}
                        fill
                        className="object-cover opacity-80"
                        sizes="50vw"
                      />
                    </div>
                  ) : (
                    <div className="relative aspect-square">
                      <ResultImage
                        src={item.url}
                        alt={item.label ?? ''}
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
                        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent bg-accent text-black">
                          <Check size={14} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {cell && canSelect ? <HdResultsStrip items={hdForCell(cell)} compact /> : null}
              </div>
            );
          })}
        </div>

        {!selectable && results.length === 1 && results[0].type === 'image' && clothesLine && (
          <button
            type="button"
            onClick={() => handleMakeVideo(results[0])}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent py-3 text-accent pressable"
          >
            <Film size={18} />
            生成服装展示视频
          </button>
        )}
      </div>

      {selectable && (
        <FormFixedFooter>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectionMode((m) => {
                  if (m) setSelected(new Set());
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
              disabled={hdLoading || selected.size === 0}
              onClick={() => void openHdSheet()}
              className="btn-primary flex-[1.4] pressable disabled:opacity-50"
            >
              <Sparkles size={18} />
              {hdLoading
                ? '提交中…'
                : selected.size > 0
                  ? `HD 放大 · ${selected.size} 格`
                  : 'HD 放大'}
            </button>
          </div>
        </FormFixedFooter>
      )}

      {firstSelected && selected.size > 0 && (
        <HdUpscaleSheet
          open={hdSheetOpen}
          onClose={() => setHdSheetOpen(false)}
          item={firstSelected}
          gridCell={firstSelected.gridCell ?? '1-1'}
          gridCells={selectedCells.length > 1 ? selectedCells : undefined}
          parent={hdParent}
          loading={hdLoading}
          onConfirm={(opts) => submitHd(opts)}
        />
      )}

      {viewingItem && (
        <FullscreenImageViewer
          open
          src={viewingItem.localUrl ?? viewingItem.url}
          alt={viewingItem.label ?? viewingItem.gridCell ?? '成片'}
          subtitle={viewingItem.gridCell ? `格位 ${viewingItem.gridCell}` : '查看大图'}
          onClose={() => setViewingIndex(null)}
        />
      )}
    </>
  );
}
