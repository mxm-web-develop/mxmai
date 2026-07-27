import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import type { AssetMediaKind } from './asset-loading/types';
import { getKindMeta } from './asset-loading/kindMeta';
import { useReducedMotion } from '../lib/motion/useReducedMotion';
import {
  TASK_PROGRESS_RING_C,
  animateTaskProgressIndeterminate,
  animateTaskProgressOrbit,
  animateTaskProgressScan,
  animateTaskProgressValue,
  taskProgressRingOffset,
} from '../lib/motion/taskProgressMotion';
import '../styles/task-progress-compact.css';

gsap.registerPlugin(useGSAP);

export type TaskProgressCompactProps = {
  progress?: number | null;
  status?: string;
  kind?: AssetMediaKind;
  failed?: boolean;
  className?: string;
};

/** 列表卡片缩略图内的紧凑进度环（与 TaskProgressStage 共用 GSAP 动效） */
export function TaskProgressCompact({
  progress,
  status = 'processing',
  kind = 'image',
  failed = false,
  className = '',
}: TaskProgressCompactProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const counterRef = useRef({ value: 0 });
  const [displayPct, setDisplayPct] = useState(0);
  const reduced = useReducedMotion();

  const meta = getKindMeta(kind, t);
  const Icon = meta.icon;
  const isFailed = failed || status === 'failed' || status === 'cancelled';
  const hasProgress = typeof progress === 'number' && !Number.isNaN(progress);
  const target = hasProgress ? Math.min(100, Math.max(0, progress)) : null;

  useGSAP(
    () => {
      animateTaskProgressOrbit('.tpc__orbit', reduced);
      animateTaskProgressScan('.tpc__scan', reduced);

      if (!isFailed && target == null && ringRef.current) {
        gsap.set(ringRef.current, {
          attr: { 'stroke-dashoffset': taskProgressRingOffset(18) },
          opacity: 0.75,
        });
        animateTaskProgressIndeterminate(ringRef.current, reduced);
      }
    },
    { scope: containerRef, dependencies: [reduced, isFailed, target == null] }
  );

  useGSAP(
    () => {
      if (isFailed || target == null) return;
      animateTaskProgressValue(
        ringRef.current,
        counterRef.current,
        target,
        setDisplayPct,
        reduced
      );
    },
    {
      scope: containerRef,
      dependencies: [target, isFailed, reduced],
      revertOnUpdate: true,
    }
  );

  const label = isFailed
    ? t('common.task.status.taskFailed')
    : hasProgress
      ? t('common.task.status.processingPct', { pct: displayPct })
      : t('common.task.status.processing');

  return (
    <div
      ref={containerRef}
      className={`tpc ${isFailed ? 'tpc--failed' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="tpc__backdrop" aria-hidden="true">
        <span className="tpc__grid" />
        <span className="tpc__scan" />
      </div>

      <div className="tpc__ring-wrap">
        <svg className="tpc__svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="tpc__ring-track" cx="60" cy="60" r="52" />
          <circle
            ref={ringRef}
            className="tpc__ring-fill"
            cx="60"
            cy="60"
            r="52"
            strokeDasharray={TASK_PROGRESS_RING_C}
            strokeDashoffset={TASK_PROGRESS_RING_C}
          />
        </svg>
        {!isFailed ? (
          <div className="tpc__orbit" aria-hidden="true">
            <span className="tpc__dot tpc__dot--1" />
            <span className="tpc__dot tpc__dot--2" />
            <span className="tpc__dot tpc__dot--3" />
          </div>
        ) : null}
        <div className="tpc__center">
          {isFailed ? (
            <Icon className="tpc__icon tpc__icon--failed" size={22} strokeWidth={1.6} />
          ) : hasProgress ? (
            <span className="tpc__pct" aria-hidden="true">
              {displayPct}
              <small className="tpc__pct-unit">%</small>
            </span>
          ) : (
            <Icon className="tpc__icon" size={22} strokeWidth={1.6} />
          )}
        </div>
      </div>

      {!isFailed && hasProgress ? (
        <div className="tpc__bar" aria-hidden="true">
          <span className="tpc__bar-fill" style={{ width: `${target}%` }} />
        </div>
      ) : null}
    </div>
  );
}
