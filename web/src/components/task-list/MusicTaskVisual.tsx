import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Music2 } from 'lucide-react';
import type { WritingTaskItem } from '../../api/client';
import { pickTaskPromptPreview } from './taskPreviewText';

gsap.registerPlugin(useGSAP);

type MusicTaskVisualProps = {
  task: WritingTaskItem;
  status: string;
  awaitingReview?: boolean;
};

export function MusicTaskVisual({ task, status, awaitingReview }: MusicTaskVisualProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const preview = pickTaskPromptPreview(task, 64);
  const isSpinning =
    !awaitingReview &&
    (status === 'processing' || status === 'pending' || status === 'queued');
  const isFailed = status === 'failed' || status === 'cancelled';

  useGSAP(
    () => {
      if (!discRef.current || !isSpinning) return;
      gsap.to(discRef.current, {
        rotation: 360,
        duration: 8,
        repeat: -1,
        ease: 'none',
      });
    },
    { scope: rootRef, dependencies: [isSpinning], revertOnUpdate: true }
  );

  return (
    <div
      className={`music-visual${awaitingReview ? ' music-visual--review' : ''}${status === 'completed' ? ' music-visual--done' : ''}${isSpinning ? ' music-visual--spinning' : ''}`}
      ref={rootRef}
      role={isSpinning ? 'status' : undefined}
      aria-label={isSpinning ? '音乐生成中' : undefined}
    >
      <div className="music-visual__ambient" aria-hidden />
      <div className="music-visual__disc-wrap">
        <div className="music-visual__disc" ref={discRef}>
          <div className="music-visual__groove" aria-hidden />
          <div className="music-visual__groove music-visual__groove--inner" aria-hidden />
          <div className="music-visual__label">
            {isFailed ? (
              <span aria-hidden>—</span>
            ) : (
              <>
                <Music2 size={status === 'completed' ? 22 : 20} strokeWidth={1.5} aria-hidden />
                <span className="music-visual__hub" aria-hidden />
              </>
            )}
          </div>
        </div>
        {status === 'completed' ? <span className="music-visual__tonearm" aria-hidden /> : null}
      </div>
      {preview ? <p className="music-visual__caption">{preview}</p> : null}
    </div>
  );
}
