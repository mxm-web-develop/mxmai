'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { cn } from '@/lib/cn';
import type { ServiceCategory } from '@/adapters/types';
import { ensureGsapConfigured, MOTION } from '@/lib/motion/gsap-config';

const CATEGORIES: { id: ServiceCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'shoot', label: '商拍' },
  { id: 'batch', label: '批量' },
  { id: 'video', label: '视频' },
  { id: 'poster', label: '海报' },
];

export function CategoryChips({
  value,
  onChange,
}: {
  value: ServiceCategory | 'all';
  onChange: (v: ServiceCategory | 'all') => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useGSAP(
    () => {
      ensureGsapConfigured();
      const pill = pillRef.current;
      const btn = btnRefs.current.get(value);
      const track = trackRef.current;
      if (!pill || !btn || !track) return;

      const trackRect = track.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(pill, {
          x: btnRect.left - trackRect.left + track.scrollLeft,
          width: btnRect.width,
          duration: MOTION.normal,
          ease: MOTION.easeOutExpo,
        });
      });
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(pill, {
          x: btnRect.left - trackRect.left + track.scrollLeft,
          width: btnRect.width,
        });
      });

      return () => mm.revert();
    },
    { dependencies: [value], scope: trackRef }
  );

  return (
    <div
      ref={trackRef}
      className="relative flex gap-2 overflow-x-auto pb-1 scrollbar-none"
    >
      <span
        ref={pillRef}
        className="pointer-events-none absolute top-0 left-0 h-[calc(100%-4px)] rounded-full bg-accent shadow-[0_2px_8px_var(--color-accent-glow)]"
        aria-hidden
        style={{ width: 0 }}
      />
      {CATEGORIES.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            ref={(el) => {
              if (el) btnRefs.current.set(c.id, el);
              else btnRefs.current.delete(c.id);
            }}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              'relative z-[1] shrink-0 rounded-full px-4 py-2 text-sm pressable',
              'transition-colors duration-[var(--motion-fast)]',
              active ? 'font-semibold text-white' : 'font-medium text-text-muted'
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
