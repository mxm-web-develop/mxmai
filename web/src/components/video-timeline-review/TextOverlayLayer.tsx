import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TitleEngine } from '@mxmai/mxm-editor-core/text/title-engine';
import type { TextClip } from './types';

type TextOverlayLayerProps = {
  textClips: TextClip[];
  currentTime: number;
  width: number;
  height: number;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string) => void;
  onMoveOverlay?: (id: string, position: { x: number; y: number }) => void;
};

function getTitleEngine(): TitleEngine {
  const g = globalThis as typeof globalThis & { __mxmTitleEngine?: TitleEngine };
  if (!g.__mxmTitleEngine) {
    g.__mxmTitleEngine = new TitleEngine();
  }
  return g.__mxmTitleEngine;
}

/**
 * TitleEngine 在支持 OffscreenCanvas 的浏览器返回 OffscreenCanvas，
 * 它没有 toDataURL，需要转绘到 HTMLCanvasElement 再导出，避免运行时崩溃。
 */
function canvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): string | null {
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL('image/png');
  }
  try {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas as unknown as CanvasImageSource, 0, 0);
    return tmp.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** 在基底画面上叠加 OpenReel textClips（TitleEngine 逐帧渲染） */
export function TextOverlayLayer({
  textClips,
  currentTime,
  width,
  height,
  selectedOverlayId,
  onSelectOverlay,
  onMoveOverlay,
}: TextOverlayLayerProps) {
  const engineRef = useRef<TitleEngine | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [frames, setFrames] = useState<Array<{ id: string; src: string }>>([]);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const activeClips = useMemo(
    () =>
      textClips.filter(
        (tc) => currentTime >= tc.startTime && currentTime < tc.startTime + tc.duration
      ),
    [textClips, currentTime]
  );

  useEffect(() => {
    if (!width || !height || activeClips.length === 0) {
      setFrames([]);
      return;
    }

    if (!engineRef.current) {
      engineRef.current = getTitleEngine();
    }
    const engine = engineRef.current;

    const nextFrames: Array<{ id: string; src: string }> = [];
    for (const clip of activeClips) {
      const localTime = Math.max(0, currentTime - clip.startTime);
      try {
        const result = engine.renderText(clip, width, height, localTime);
        const src = canvasToDataUrl(result.canvas);
        if (src) nextFrames.push({ id: clip.id, src });
      } catch {
        // 单个文字层渲染失败不应中断整个审核弹窗
      }
    }
    setFrames(nextFrames);
  }, [activeClips, currentTime, width, height]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, clip: TextClip) => {
      e.stopPropagation();
      onSelectOverlay?.(clip.id);
      if (!onMoveOverlay) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        id: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: clip.transform.position.x,
        originY: clip.transform.position.y,
      };
    },
    [onMoveOverlay, onSelectOverlay]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const layer = layerRef.current;
      if (!drag || !layer || !onMoveOverlay) return;
      const rect = layer.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const x = Math.min(1, Math.max(0, drag.originX + dx));
      const y = Math.min(1, Math.max(0, drag.originY + dy));
      onMoveOverlay(drag.id, { x, y });
    },
    [onMoveOverlay]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (frames.length === 0 && activeClips.length === 0) return null;

  return (
    <div
      ref={layerRef}
      className={`video-timeline-review__text-overlay-layer${
        onSelectOverlay ? ' video-timeline-review__text-overlay-layer--interactive' : ''
      }`}
    >
      {frames.map((frame) => (
        <img
          key={`${frame.id}-${currentTime.toFixed(3)}`}
          src={frame.src}
          alt=""
          className="video-timeline-review__text-overlay"
        />
      ))}
      {onSelectOverlay &&
        activeClips.map((clip) => {
          const selected = selectedOverlayId === clip.id;
          return (
            <button
              key={`hit-${clip.id}`}
              type="button"
              className={`video-timeline-review__text-overlay-hit${
                selected ? ' video-timeline-review__text-overlay-hit--selected' : ''
              }`}
              style={{
                left: `${clip.transform.position.x * 100}%`,
                top: `${clip.transform.position.y * 100}%`,
              }}
              title={clip.text}
              aria-label={`选中叠加：${clip.text}`}
              onPointerDown={(e) => handlePointerDown(e, clip)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          );
        })}
    </div>
  );
}
