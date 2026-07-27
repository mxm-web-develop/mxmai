'use client';

import { useCallback, useEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ensureGsapConfigured, MOTION } from '@/lib/motion/gsap-config';

type Options = {
  scale?: number;
  disabled?: boolean;
};

/** Instant pointer-down scale via GSAP — faster than CSS :active on mobile WebViews. */
export function usePressFeedback<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { scale = 0.97, disabled = false }: Options = {}
) {
  const press = useCallback(() => {
    const el = ref.current;
    if (!el || disabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensureGsapConfigured();
    gsap.to(el, {
      scale,
      duration: MOTION.fast,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }, [ref, scale, disabled]);

  const release = useCallback(() => {
    const el = ref.current;
    if (!el || disabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensureGsapConfigured();
    gsap.to(el, {
      scale: 1,
      duration: MOTION.normal,
      ease: MOTION.easeOutExpo,
      overwrite: 'auto',
    });
  }, [ref, disabled]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      press();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('pointercancel', release);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointerleave', release);
      el.removeEventListener('pointercancel', release);
    };
  }, [ref, press, release, disabled]);

  return { press, release };
}
