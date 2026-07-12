import type { MxmImageMotion } from './types';

/** 与 video-timeline-review.css @keyframes 一致，progress ∈ [0, 1] */
export function kenBurnsTransform(motion: MxmImageMotion, progress: number): string | undefined {
  if (motion === 'none') return undefined;
  const t = Math.max(0, Math.min(1, progress));
  const panScale = 1.12;

  switch (motion) {
    case 'zoom-in':
      return `scale(${(1 + 0.14 * t).toFixed(4)})`;
    case 'zoom-out':
      return `scale(${(1.14 - 0.14 * t).toFixed(4)})`;
    case 'pan-left':
      return `scale(${panScale}) translateX(${(2 - 4 * t).toFixed(4)}%)`;
    case 'pan-right':
      return `scale(${panScale}) translateX(${(-2 + 4 * t).toFixed(4)}%)`;
    case 'pan-up':
      return `scale(${panScale}) translateY(${(2 - 4 * t).toFixed(4)}%)`;
    case 'pan-down':
      return `scale(${panScale}) translateY(${(-2 + 4 * t).toFixed(4)}%)`;
    default:
      return undefined;
  }
}
