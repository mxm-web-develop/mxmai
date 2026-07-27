'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { ResultImage } from '@/components/jobs/ResultImage';
import { cn } from '@/lib/cn';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

export function FullscreenImageViewer({
  open,
  src,
  alt,
  subtitle,
  onClose,
  overlay,
  headerActions,
}: {
  open: boolean;
  src: string;
  alt: string;
  subtitle?: string;
  onClose: () => void;
  /** 叠在图片上（选格模式）；随图片一起缩放平移 */
  overlay?: ReactNode;
  headerActions?: ReactNode;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ px: number; py: number; startX: number; startY: number } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) resetView();
  }, [open, src, resetView]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () =>
    setScale((s) => {
      const next = Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { px: pan.x, py: pan.y, startX: e.clientX, startY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = panRef.current;
    if (!start) return;
    setPan({
      x: start.px + (e.clientX - start.startX),
      y: start.py + (e.clientY - start.startY),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    panRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 safe-top safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {subtitle ?? alt}
        </p>
        <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white pressable"
          aria-label="关闭"
        >
          <X size={22} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden px-2 pb-2">
        <div
          className={cn(
            'relative mx-auto h-full w-full max-w-lg touch-none',
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="relative h-full w-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: panRef.current ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <ResultImage src={src} alt={alt} fill className="object-contain" sizes="100vw" />
            {overlay}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white pressable disabled:opacity-40"
          aria-label="缩小"
        >
          <Minus size={20} />
        </button>
        <span className="min-w-[3rem] text-center text-sm tabular-nums text-white/80">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white pressable disabled:opacity-40"
          aria-label="放大"
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white pressable"
          aria-label="重置视图"
        >
          <RotateCcw size={18} />
        </button>
      </footer>
    </div>
  );
}
