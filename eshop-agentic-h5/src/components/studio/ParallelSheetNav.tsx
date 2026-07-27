'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function ParallelSheetNav({
  index,
  total,
  label,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  label?: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="上一份"
        disabled={index <= 0}
        onClick={onPrev}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated pressable',
          index <= 0 && 'pointer-events-none opacity-30'
        )}
      >
        <ChevronLeft size={22} />
      </button>

      <div className="min-w-0 flex-1 text-center">
        <p className="text-sm font-semibold text-text">
          {label ?? `第 ${index + 1} 份`}
        </p>
        <p className="text-[11px] text-text-muted">
          {index + 1} / {total}
        </p>
      </div>

      <button
        type="button"
        aria-label="下一份"
        disabled={index >= total - 1}
        onClick={onNext}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated pressable',
          index >= total - 1 && 'pointer-events-none opacity-30'
        )}
      >
        <ChevronRight size={22} />
      </button>
    </div>
  );
}
