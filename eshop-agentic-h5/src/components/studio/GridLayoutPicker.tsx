'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/schema/BottomSheet';
import { cn } from '@/lib/cn';

import {
  OUTPUT_GRID_LABELS,
  OUTPUT_GRID_LAYOUTS,
  cellsPerGrid,
  type OutputGridLayout,
} from '@/lib/output-grid';

export type { OutputGridLayout } from '@/lib/output-grid';
export { OUTPUT_GRID_LABELS, OUTPUT_GRID_LAYOUTS, cellsPerGrid };

type Props = {
  value: OutputGridLayout;
  onChange: (next: OutputGridLayout) => void;
  options?: OutputGridLayout[];
};

/** 点击宫格图标 → iOS 底部选择 1×1 / 2×2 / 3×3 */
export function GridLayoutPicker({ value, onChange, options = OUTPUT_GRID_LAYOUTS }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<OutputGridLayout>(value);

  useEffect(() => {
    if (!open) setPending(value);
  }, [value, open]);

  const close = () => setOpen(false);
  const confirm = () => {
    onChange(pending);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`宫格布局：${OUTPUT_GRID_LABELS[value]}，点击修改`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent pressable ring-2 ring-transparent transition-all active:scale-95 hover:ring-accent/25"
      >
        <GridLayoutIcon layout={value} size={22} />
      </button>

      <BottomSheet
        open={open}
        onClose={close}
        title="输出宫格"
        iosToolbar
        onCancel={close}
        onConfirm={confirm}
      >
        <ul className="divide-y divide-border/80 touch-pan-y">
          {options.map((layout) => {
            const selected = pending === layout;
            return (
              <li key={layout}>
                <button
                  type="button"
                  onClick={() => {
                    setPending(layout);
                    onChange(layout);
                    close();
                  }}
                  className={cn(
                    'flex w-full items-center gap-4 py-3.5 select-none active:bg-surface-muted/80',
                    selected ? 'text-accent' : 'text-text'
                  )}
                >
                  <div className="w-14 shrink-0">
                    <GridLayoutIcon layout={layout} size={40} className="text-current" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className={cn('text-[17px]', selected && 'font-semibold')}>
                      {OUTPUT_GRID_LABELS[layout]}
                    </p>
                    <p className="text-xs text-text-muted">
                      每份 {cellsPerGrid(layout)} 张成片
                    </p>
                  </div>
                  {selected && <Check size={20} className="shrink-0" strokeWidth={2.5} />}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
}

export function GridLayoutIcon({
  layout,
  size = 22,
  className,
}: {
  layout: OutputGridLayout | string;
  size?: number;
  className?: string;
}) {
  const cols = layout === '3x3' ? 3 : layout === '2x2' ? 2 : 1;
  const count = cols * cols;
  const gap = Math.max(1, Math.floor(size / 14));

  return (
    <div
      className={cn('grid text-current', className)}
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
      }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[2px] bg-current opacity-85"
          style={{ minHeight: 0, minWidth: 0 }}
        />
      ))}
    </div>
  );
}
