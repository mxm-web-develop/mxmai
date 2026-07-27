import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import type { AssetMediaKind } from './asset-loading/types';
import { getKindMeta } from './asset-loading/kindMeta';
import { useReducedMotion } from '../lib/motion/useReducedMotion';
import {
  TASK_PROGRESS_RING_C,
  animateTaskProgressEnter,
  animateTaskProgressIndeterminate,
  animateTaskProgressOrbit,
  animateTaskProgressScan,
  animateTaskProgressValue,
  taskProgressRingOffset,
} from '../lib/motion/taskProgressMotion';
import '../styles/task-progress-stage.css';

gsap.registerPlugin(useGSAP);

export type TaskProgressStageProps = {
  /** 0–100；无值时展示不确定进度动画 */
  progress?: number | null;
  status?: string;
  statusLabel?: string;
  kind?: AssetMediaKind;
  error?: string | null;
  className?: string;
};

export function TaskProgressStage({
  progress,
  status = 'processing',
  statusLabel,
  kind = 'image',
  error,
  className = '',
}: TaskProgressStageProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const counterRef = useRef({ value: 0 });
  const [displayPct, setDisplayPct] = useState(0);
  const reduced = useReducedMotion();

  const meta = getKindMeta(kind, t);
  const Icon = meta.icon;
  const isFailed = status === 'failed' || status === 'cancelled' || Boolean(error);
  const hasProgress = typeof progress === 'number' && !Number.isNaN(progress);
  const target = hasProgress ? Math.min(100, Math.max(0, progress)) : null;

  const progressHint = (s: string) => {
    const key = `common.task.progressHint.${s}` as const;
    if (s === 'pending' || s === 'queued' || s === 'processing') {
      return t(key);
    }
    return t('common.task.progressHint.processing');
  };

  const headline = isFailed
    ? statusLabel ?? t('common.task.status.taskFailed')
    : statusLabel ?? progressHint(status);

  const subline = isFailed
    ? error ?? t('common.task.status.failed')
    : progressHint(status);

  useGSAP(
    () => {
      animateTaskProgressEnter('.tps__panel', reduced);
      animateTaskProgressOrbit('.tps__orbit', reduced);
      animateTaskProgressScan('.tps__scan', reduced);

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

  return (
    <div
      ref={containerRef}
      className={`tps ${isFailed ? 'tps--failed' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={headline}
    >
      <div className="tps__backdrop" aria-hidden="true">
        <span className="tps__grid" />
        <span className="tps__glow tps__glow--a" />
        <span className="tps__glow tps__glow--b" />
        <span className="tps__scan" />
      </div>

      <div className="tps__panel">
        <div className={`tps__ring-wrap ${isFailed ? 'tps__ring-wrap--failed' : ''}`}>
          <svg className="tps__svg" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="tps__ring-track" cx="60" cy="60" r="52" />
            <circle
              ref={ringRef}
              className="tps__ring-fill"
              cx="60"
              cy="60"
              r="52"
              strokeDasharray={TASK_PROGRESS_RING_C}
              strokeDashoffset={TASK_PROGRESS_RING_C}
            />
          </svg>
          {!isFailed ? (
            <div className="tps__orbit" aria-hidden="true">
              <span className="tps__dot tps__dot--1" />
              <span className="tps__dot tps__dot--2" />
              <span className="tps__dot tps__dot--3" />
            </div>
          ) : null}
          <div className="tps__center">
            {isFailed ? (
              <Icon className="tps__icon tps__icon--failed" size={28} strokeWidth={1.6} />
            ) : hasProgress ? (
              <span className="tps__pct" aria-hidden="true">
                {displayPct}
                <small className="tps__pct-unit">%</small>
              </span>
            ) : (
              <Icon className="tps__icon" size={28} strokeWidth={1.6} />
            )}
          </div>
        </div>

        <div className="tps__copy">
          <p className="tps__headline">{headline}</p>
          <p className="tps__subline">{subline}</p>
          {!isFailed && hasProgress ? (
            <div className="tps__bar" aria-hidden="true">
              <span className="tps__bar-fill" style={{ width: `${target}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
