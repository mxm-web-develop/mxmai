import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';

const MIN_PX_PER_SECOND = 8;
const MAX_PX_PER_SECOND = 240;
const ZOOM_FACTOR = 1.25;

export function pickRulerInterval(pxPerSecond: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60];
  const targetPx = 72;
  for (const interval of candidates) {
    if (interval * pxPerSecond >= targetPx) return interval;
  }
  return 60;
}

export function buildRulerTicks(totalDuration: number, pxPerSecond: number): number[] {
  const dur = Math.max(totalDuration, 0.01);
  const interval = pickRulerInterval(pxPerSecond);
  const ticks: number[] = [];
  for (let t = 0; t <= dur + 0.001; t += interval) {
    ticks.push(Math.round(t * 1000) / 1000);
  }
  if (ticks[ticks.length - 1]! < dur) ticks.push(dur);
  return ticks;
}

export function useTimelineZoom(totalDuration: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pxPerSecond, setPxPerSecond] = useState(40);
  const [viewportWidth, setViewportWidth] = useState(0);

  const dur = Math.max(totalDuration, 0.01);
  const contentWidth = Math.max(dur * pxPerSecond, viewportWidth || 320);

  const fitToWidth = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? viewportWidth;
    if (!w || w <= LABEL_GUTTER) return;
    const laneWidth = Math.max(w - LABEL_GUTTER, 120);
    const next = clampPxPerSecond(laneWidth / dur);
    setPxPerSecond(next);
  }, [dur, viewportWidth]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setViewportWidth(w);
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (viewportWidth > 0 && totalDuration > 0) {
      fitToWidth();
    }
    // 仅在总时长变化时自动适应宽度，避免覆盖用户手动缩放
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDuration]);

  const zoomIn = useCallback(() => {
    setPxPerSecond((prev) => clampPxPerSecond(prev * ZOOM_FACTOR));
  }, []);

  const zoomOut = useCallback(() => {
    setPxPerSecond((prev) => clampPxPerSecond(prev / ZOOM_FACTOR));
  }, []);

  const setZoom = useCallback((next: number) => {
    setPxPerSecond(clampPxPerSecond(next));
  }, []);

  const zoomAtPointer = useCallback(
    (clientX: number, deltaY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollLeft = el.scrollLeft;
      const pointerX = clientX - rect.left + scrollLeft - LABEL_GUTTER;
      const timeAtPointer = Math.max(0, pointerX / pxPerSecond);

      const factor = deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const nextPx = clampPxPerSecond(pxPerSecond * factor);
      if (nextPx === pxPerSecond) return;

      setPxPerSecond(nextPx);
      requestAnimationFrame(() => {
        const newPointerX = timeAtPointer * nextPx;
        el.scrollLeft = Math.max(0, newPointerX - (clientX - rect.left - LABEL_GUTTER));
      });
    },
    [pxPerSecond]
  );

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAtPointer(e.clientX, e.deltaY);
    },
    [zoomAtPointer]
  );

  return {
    scrollRef,
    pxPerSecond,
    contentWidth,
    zoomIn,
    zoomOut,
    setZoom,
    fitToWidth,
    onWheel,
    minPxPerSecond: MIN_PX_PER_SECOND,
    maxPxPerSecond: MAX_PX_PER_SECOND,
  };
}

const LABEL_GUTTER = 80;

function clampPxPerSecond(v: number): number {
  return Math.max(MIN_PX_PER_SECOND, Math.min(MAX_PX_PER_SECOND, v));
}

export const TIMELINE_LABEL_WIDTH_PX = LABEL_GUTTER;
