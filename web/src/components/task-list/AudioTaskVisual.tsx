import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { AudioLines } from 'lucide-react';
import type { WritingTaskItem } from '../../api/client';
import { pickTaskPromptPreview } from './taskPreviewText';
import { useReducedMotion } from '../../lib/motion/useReducedMotion';
import {
  TASK_PROGRESS_RING_C,
  animateTaskProgressIndeterminate,
  animateTaskProgressValue,
  taskProgressRingOffset,
} from '../../lib/motion/taskProgressMotion';

gsap.registerPlugin(useGSAP);

type AudioTaskVisualProps = {
  task: WritingTaskItem;
  status: string;
  awaitingReview?: boolean;
};

export function AudioTaskVisual({ task, status, awaitingReview }: AudioTaskVisualProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const counterRef = useRef({ value: 0 });
  const [displayPct, setDisplayPct] = useState(0);
  const reduced = useReducedMotion();
  const preview = pickTaskPromptPreview(task, 72);

  const isFailed = status === 'failed' || status === 'cancelled';
  const isDone = status === 'completed';
  const isActive =
    status === 'processing' || status === 'pending' || status === 'queued' || awaitingReview;

  const rawProgress = task.progress?.progress;
  const hasProgress =
    typeof rawProgress === 'number' && !Number.isNaN(rawProgress) && rawProgress > 0;
  const target = hasProgress ? Math.min(100, Math.max(0, rawProgress)) : null;

  useGSAP(
    () => {
      if (!isActive || isFailed || !ringRef.current) return;
      if (target == null) {
        gsap.set(ringRef.current, {
          attr: { 'stroke-dashoffset': taskProgressRingOffset(18) },
          opacity: 0.8,
        });
        animateTaskProgressIndeterminate(ringRef.current, reduced);
      }
    },
    { scope: rootRef, dependencies: [isActive, isFailed, target == null, reduced], revertOnUpdate: true }
  );

  useGSAP(
    () => {
      if (!isActive || isFailed || target == null) return;
      animateTaskProgressValue(ringRef.current, counterRef.current, target, setDisplayPct, reduced);
    },
    { scope: rootRef, dependencies: [isActive, isFailed, target, reduced], revertOnUpdate: true }
  );

  return (
    <div
      className={`audio-visual${awaitingReview ? ' audio-visual--review' : ''}${isDone ? ' audio-visual--done' : ''}`}
      ref={rootRef}
      role={isActive ? 'status' : undefined}
      aria-label={
        isActive
          ? hasProgress
            ? `音频生成中 ${displayPct}%`
            : '音频生成中'
          : undefined
      }
    >
      <div className="audio-visual__glow" aria-hidden />

      {isDone ? (
        <div className="audio-visual__icon-wrap">
          <span className="audio-visual__play" aria-hidden />
        </div>
      ) : isFailed ? (
        <div className="audio-visual__icon-wrap">
          <span className="audio-visual__placeholder">—</span>
        </div>
      ) : (
        <div className="audio-visual__ring-wrap">
          <svg className="audio-visual__ring-svg" viewBox="0 0 120 120" aria-hidden>
            <circle className="audio-visual__ring-track" cx="60" cy="60" r="52" />
            <circle
              ref={ringRef}
              className="audio-visual__ring-fill"
              cx="60"
              cy="60"
              r="52"
              strokeDasharray={TASK_PROGRESS_RING_C}
              strokeDashoffset={TASK_PROGRESS_RING_C}
            />
          </svg>
          <div className="audio-visual__ring-center">
            {hasProgress ? (
              <span className="audio-visual__pct" aria-hidden>
                {displayPct}
                <small>%</small>
              </span>
            ) : (
              <AudioLines className="audio-visual__wave-icon" size={22} strokeWidth={1.6} aria-hidden />
            )}
          </div>
        </div>
      )}

      {preview ? <p className="audio-visual__caption">{preview}</p> : null}
    </div>
  );
}
