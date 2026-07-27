'use client';

import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { cn } from '@/lib/cn';
import { ensureGsapConfigured, MOTION } from '@/lib/motion/gsap-config';

type StaggerRevealProps = {
  children: ReactNode;
  className?: string;
  /** Scoped selector for stagger targets; defaults to immediate children */
  childSelector?: string;
  delay?: number;
};

function resolveStaggerTargets(root: HTMLElement, childSelector?: string): Element[] {
  if (!childSelector || childSelector === '> *') {
    return Array.from(root.children);
  }

  // querySelectorAll on an element cannot start with a combinator — prefix :scope
  const selector = childSelector.startsWith('>') ? `:scope ${childSelector}` : childSelector;
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Subtle list/section entrance — product register: stagger siblings, no full-page choreography.
 * Content stays visible if JS fails; GSAP only enhances on mount.
 */
export function StaggerReveal({
  children,
  className,
  childSelector,
  delay = 0,
}: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      ensureGsapConfigured();
      const root = ref.current;
      if (!root) return;

      const targets = resolveStaggerTargets(root, childSelector);

      if (!targets.length) return;

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(targets, {
          y: 10,
          autoAlpha: 0,
          duration: MOTION.normal,
          stagger: { each: MOTION.stagger, ease: 'power2.out' },
          delay,
          ease: MOTION.easeOut,
          clearProps: 'transform,opacity,visibility',
        });
      });

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
