import { useRef, type CSSProperties } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

type AudioWaveVisualizerProps = {
  playing: boolean;
  progress: number;
};

const BAR_COUNT = 48;

export function AudioWaveVisualizer({ playing, progress }: AudioWaveVisualizerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);

  useGSAP(
    () => {
      const bars = barsRef.current.filter(Boolean);
      if (!bars.length) return;

      gsap.killTweensOf(bars);

      if (playing) {
        bars.forEach((bar, i) => {
          gsap.to(bar, {
            scaleY: gsap.utils.random(0.25, 1),
            duration: gsap.utils.random(0.35, 0.65),
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: i * 0.018,
          });
        });
      } else {
        gsap.to(bars, {
          scaleY: 0.12,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.01,
        });
      }
    },
    { scope: rootRef, dependencies: [playing], revertOnUpdate: true }
  );

  useGSAP(
    () => {
      const el = rootRef.current?.querySelector('.audio-wave-viz__progress-glow');
      if (!el) return;
      gsap.to(el, {
        left: `${Math.max(0, Math.min(100, progress * 100))}%`,
        duration: 0.12,
        ease: 'power1.out',
      });
    },
    { scope: rootRef, dependencies: [progress] }
  );

  return (
    <div className="audio-wave-viz" ref={rootRef} aria-hidden>
      <div className="audio-wave-viz__bars">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              if (el) barsRef.current[i] = el;
            }}
            className="audio-wave-viz__bar"
            style={{ '--bar-i': i } as CSSProperties}
          />
        ))}
      </div>
      <div className="audio-wave-viz__progress-glow" />
    </div>
  );

}
