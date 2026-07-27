import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Mic2 } from 'lucide-react';
import type { WritingTaskItem } from '../../api/client';
import { pickTaskPromptPreview } from './taskPreviewText';
import { MediaLoadingState } from '../MediaLoadingState';
import { animateListBarPulse } from '../../lib/motion/gsapPresets';

gsap.registerPlugin(useGSAP);

const BAR_HEIGHTS = [0.35, 0.62, 0.48, 0.78, 0.42, 0.68, 0.55, 0.82, 0.38, 0.71, 0.5, 0.64];

type AudioTaskVisualProps = {
  task: WritingTaskItem;
  status: string;
  awaitingReview?: boolean;
};

export function AudioTaskVisual({ task, status, awaitingReview }: AudioTaskVisualProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const preview = pickTaskPromptPreview(task, 72);
  const isActive =
    status === 'processing' || status === 'pending' || status === 'queued' || awaitingReview;

  useGSAP(
    () => {
      const bars = rootRef.current?.querySelectorAll('.audio-visual__bar');
      if (!bars?.length || !isActive) return;
      animateListBarPulse(bars);
    },
    { scope: rootRef, dependencies: [isActive], revertOnUpdate: true }
  );

  return (
    <div
      className={`audio-visual${awaitingReview ? ' audio-visual--review' : ''}${status === 'completed' ? ' audio-visual--done' : ''}`}
      ref={rootRef}
    >
      <div className="audio-visual__glow" aria-hidden />
      <div className="audio-visual__wave" aria-hidden>
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="audio-visual__bar"
            style={{ '--h': h } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="audio-visual__icon-wrap">
        {status === 'completed' ? (
          <span className="audio-visual__play" aria-hidden />
        ) : status === 'failed' || status === 'cancelled' ? (
          <span className="audio-visual__placeholder">—</span>
        ) : (
          <>
            <MediaLoadingState variant="compact" kind="audio" />
            <Mic2 className="audio-visual__mic" size={18} strokeWidth={1.75} aria-hidden />
          </>
        )}
      </div>
      {preview ? <p className="audio-visual__caption">{preview}</p> : null}
    </div>
  );
}
