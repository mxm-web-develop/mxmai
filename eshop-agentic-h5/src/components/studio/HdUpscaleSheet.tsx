'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { JobResultItem } from '@/adapters/types';
import { BottomSheet } from '@/components/schema/BottomSheet';
import { cn } from '@/lib/cn';
import {
  HD_ASPECT_RATIO_OPTIONS,
  hdModeLabel,
  inferHdGridLayoutForJob,
  resolveHdSubmitMode,
  type HdParentJobContext,
  type HdSubmitMode,
} from '@/lib/tools-hd-params';

type Props = {
  open: boolean;
  onClose: () => void;
  item: JobResultItem;
  gridCell: string;
  /** 批量放大时传入全部格位（含 gridCell） */
  gridCells?: string[];
  parent: HdParentJobContext;
  loading?: boolean;
  onConfirm: (opts: { aspectRatio: string; mode: HdSubmitMode }) => void | Promise<void>;
};

const GRID_LAYOUT_LABELS: Record<string, string> = {
  '2x2': '2×2 四宫格',
  '3x3': '3×3 九宫格',
  '4x4': '4×4 十六宫格',
};

export function HdUpscaleSheet({
  open,
  onClose,
  item,
  gridCell,
  gridCells,
  parent,
  loading,
  onConfirm,
}: Props) {
  const cells = gridCells?.length ? gridCells : [gridCell];
  const isBatch = cells.length > 1;
  const mode = useMemo(
    () => resolveHdSubmitMode(parent, item, gridCell),
    [parent, item, gridCell]
  );
  const gridLayout = inferHdGridLayoutForJob(parent);
  const [aspectRatio, setAspectRatio] = useState('');

  useEffect(() => {
    if (open) setAspectRatio('');
  }, [open, gridCell]);

  const previewSrc = item.localUrl ?? item.url;
  const modeHint =
    mode === 'split-cell'
      ? '平台已裁好单格，将直接 4K 放大该图（无需再切联系表）。'
      : mode === 'contact-sheet'
        ? `将从整张联系表按 ${GRID_LAYOUT_LABELS[gridLayout] ?? gridLayout} 裁出格位 ${gridCell} 后放大。`
        : '对所选单张图片进行 4K 放大。';

  return (
    <BottomSheet open={open} onClose={onClose} title="高清放大">
      <div className="space-y-4 px-1 pb-2">
        <div className="flex gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-elevated">
            {previewSrc ? (
              <Image src={previewSrc} alt="" fill className="object-cover" sizes="80px" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-text-muted">预览</div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <span className="chip bg-accent-soft text-accent text-[11px]">{hdModeLabel(mode)}</span>
              {mode === 'contact-sheet' && (
                <span className="chip bg-surface-elevated text-text-secondary text-[11px]">
                  {GRID_LAYOUT_LABELS[gridLayout] ?? gridLayout}
                </span>
              )}
              {gridCell && !isBatch && (
                <span className="chip bg-surface-elevated text-text-secondary text-[11px]">
                  格位 {gridCell}
                </span>
              )}
              {isBatch && (
                <span className="chip bg-surface-elevated text-text-secondary text-[11px]">
                  {cells.length} 格 · {cells.join('、')}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-text-muted">{modeHint}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-text">输出画幅（可选）</p>
          <div className="flex flex-wrap gap-2">
            {HD_ASPECT_RATIO_OPTIONS.map((opt) => (
              <button
                key={opt.value || 'auto'}
                type="button"
                disabled={loading}
                onClick={() => setAspectRatio(opt.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium pressable',
                  aspectRatio === opt.value
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border bg-surface text-text-secondary'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          className="btn-primary w-full"
          onClick={() => void onConfirm({ aspectRatio, mode })}
        >
          <Sparkles size={18} />
          {loading ? '提交中…' : isBatch ? `开始放大 ${cells.length} 格` : '开始 4K 放大'}
        </button>
        <p className="text-center text-[11px] text-text-muted">
          计费按次 · 尽量保持原图内容与构图
        </p>
      </div>
    </BottomSheet>
  );
}
