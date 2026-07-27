import { useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { findActiveCueIndex, type SubtitleCue } from '../../lib/audioSubtitles';

gsap.registerPlugin(useGSAP);

type AudioSubtitlePanelProps = {
  cues: SubtitleCue[];
  currentTimeMs: number;
  loading?: boolean;
  error?: string | null;
  emptyHint?: string;
};

export function AudioSubtitlePanel({
  cues,
  currentTimeMs,
  loading,
  error,
  emptyHint = '暂无句级字幕',
}: AudioSubtitlePanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = findActiveCueIndex(cues, currentTimeMs);
  const prevActiveRef = useRef(-1);

  useGSAP(
    () => {
      if (!innerRef.current || !cues.length) return;
      const lines = innerRef.current.querySelectorAll('.audio-subtitle-panel__line');
      gsap.fromTo(
        lines,
        { opacity: 0, y: 20, filter: 'blur(4px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.55,
          stagger: 0.04,
          ease: 'power3.out',
        }
      );
    },
    { scope: scrollRef, dependencies: [cues.length], revertOnUpdate: true }
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (activeIndex < 0 || !container) return;
    const el = container.querySelector(`[data-cue-index="${activeIndex}"]`);
    if (!el) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetTop =
      container.scrollTop +
      (elRect.top - containerRect.top) -
      containerRect.height / 2 +
      elRect.height / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeIndex]);

  useGSAP(
    () => {
      if (!innerRef.current || activeIndex < 0) return;
      if (prevActiveRef.current === activeIndex) return;

      const prev = innerRef.current.querySelector(`[data-cue-index="${prevActiveRef.current}"]`);
      const next = innerRef.current.querySelector(`[data-cue-index="${activeIndex}"]`);

      if (prev) {
        gsap.to(prev, {
          opacity: 0.38,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.35,
          ease: 'power2.out',
        });
      }

      if (next) {
        gsap.fromTo(
          next,
          { scale: 0.96, filter: 'blur(2px)' },
          {
            scale: 1,
            opacity: 1,
            filter: 'blur(0px)',
            duration: 0.5,
            ease: 'power3.out',
          }
        );
      }

      prevActiveRef.current = activeIndex;
    },
    { scope: scrollRef, dependencies: [activeIndex] }
  );

  if (loading) {
    return (
      <div className="audio-subtitle-panel audio-subtitle-panel--centered">
        <div className="audio-subtitle-panel__loader" aria-hidden>
          <span /><span /><span />
        </div>
        <p className="audio-subtitle-panel__hint">同步句级字幕…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="audio-subtitle-panel audio-subtitle-panel--centered">
        <p className="audio-subtitle-panel__error">{error}</p>
      </div>
    );
  }

  if (!cues.length) {
    return (
      <div className="audio-subtitle-panel audio-subtitle-panel--centered">
        <p className="audio-subtitle-panel__hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="audio-subtitle-panel">
      <div className="audio-subtitle-panel__scroll" ref={scrollRef}>
        <div className="audio-subtitle-panel__inner" ref={innerRef}>
        {cues.map((cue, index) => {
          const active = index === activeIndex;
          const past = activeIndex >= 0 && index < activeIndex;
          const upcoming = activeIndex >= 0 && index > activeIndex;
          return (
            <p
              key={`${cue.startMs}-${index}`}
              data-cue-index={index}
              className={[
                'audio-subtitle-panel__line',
                active ? 'is-active' : '',
                past ? 'is-past' : '',
                upcoming ? 'is-upcoming' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {active ? <span className="audio-subtitle-panel__line-glow" aria-hidden /> : null}
              <span className="audio-subtitle-panel__line-text">{cue.text}</span>
            </p>
          );
        })}
        </div>
      </div>
    </div>
  );
}
