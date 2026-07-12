import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useReducedMotion } from '../../lib/motion/useReducedMotion';
import {
  VIDEO_PREVIEW_RING_C,
  animateVideoPreviewDots,
  animateVideoPreviewEnter,
  animateVideoPreviewOrbit,
  animateVideoPreviewRingPulse,
  animateVideoPreviewRingSpin,
  animateVideoPreviewScan,
  animateVideoPreviewShimmer,
  animateVideoPreviewSprockets,
  animateVideoPreviewWaveBars,
  videoPreviewRingOffset,
} from './videoPreviewLoadingMotion';
import './video-preview-loading.css';

gsap.registerPlugin(useGSAP);

export type VideoPreviewLoadingPhase = 'script' | 'audio' | 'content' | 'default';

export type VideoPreviewLoadingProps = {
  message: string;
  phase?: VideoPreviewLoadingPhase;
  /** 素材选择器等小区域 */
  compact?: boolean;
  className?: string;
};

const SPROCKET_COUNT = 5;

export function VideoPreviewLoading({
  message,
  phase = 'default',
  compact = false,
  className = '',
}: VideoPreviewLoadingProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const reduced = useReducedMotion();

  const showWave = phase === 'audio' || phase === 'default';
  const showShimmer = phase === 'content' || phase === 'default';

  useGSAP(
    () => {
      animateVideoPreviewEnter(rootRef.current, reduced);
      animateVideoPreviewScan('.vpr-loading__scan', reduced);
      if (showShimmer) animateVideoPreviewShimmer('.vpr-loading__shimmer', reduced);
      animateVideoPreviewOrbit('.vpr-loading__orbit', reduced);
      animateVideoPreviewSprockets('.vpr-loading__hole', reduced);
      if (showWave) animateVideoPreviewWaveBars('.vpr-loading__bar', reduced);
      animateVideoPreviewDots('.vpr-loading__dot', reduced);

      if (ringRef.current) {
        gsap.set(ringRef.current, {
          attr: { 'stroke-dashoffset': videoPreviewRingOffset(28) },
          opacity: 0.9,
        });
        animateVideoPreviewRingSpin('.vpr-loading__ring-svg', reduced);
        animateVideoPreviewRingPulse(ringRef.current, reduced);
      }
    },
    { scope: rootRef, dependencies: [reduced, phase, showWave, showShimmer] }
  );

  return (
    <div
      ref={rootRef}
      className={`vpr-loading${compact ? ' vpr-loading--compact' : ''}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="vpr-loading__visual" aria-hidden>
        <div className="vpr-loading__sprockets vpr-loading__sprockets--left">
          {Array.from({ length: SPROCKET_COUNT }).map((_, i) => (
            <span key={`l-${i}`} className="vpr-loading__hole" />
          ))}
        </div>

        <div className="vpr-loading__frame">
          <div className="vpr-loading__frame-inner">
            {showShimmer ? <div className="vpr-loading__shimmer" /> : null}
            <div className="vpr-loading__scan" />
            <svg className="vpr-loading__ring-svg" viewBox="0 0 88 88" aria-hidden>
              <circle
                className="vpr-loading__ring-track"
                cx="44"
                cy="44"
                r="36"
                fill="none"
              />
              <circle
                ref={ringRef}
                className="vpr-loading__ring-progress"
                cx="44"
                cy="44"
                r="36"
                fill="none"
                strokeDasharray={VIDEO_PREVIEW_RING_C}
                strokeDashoffset={videoPreviewRingOffset(28)}
              />
            </svg>
            <div className="vpr-loading__play">
              <span className="vpr-loading__play-icon" />
            </div>
            <div className="vpr-loading__orbit">
              <span className="vpr-loading__orbit-dot" />
            </div>
          </div>
        </div>

        <div className="vpr-loading__sprockets vpr-loading__sprockets--right">
          {Array.from({ length: SPROCKET_COUNT }).map((_, i) => (
            <span key={`r-${i}`} className="vpr-loading__hole" />
          ))}
        </div>
      </div>

      {showWave ? (
        <div className="vpr-loading__wave" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="vpr-loading__bar" />
          ))}
        </div>
      ) : null}

      <p className="vpr-loading__label">
        {message}
        <span className="vpr-loading__dots" aria-hidden>
          <span className="vpr-loading__dot">.</span>
          <span className="vpr-loading__dot">.</span>
          <span className="vpr-loading__dot">.</span>
        </span>
      </p>
    </div>
  );
}
