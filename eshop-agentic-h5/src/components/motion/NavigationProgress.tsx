'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ensureGsapConfigured, MOTION } from '@/lib/motion/gsap-config';

/** Top progress bar while client navigation is in flight. */
export function NavigationProgress() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    tweenRef.current?.kill();
    ensureGsapConfigured();

    gsap.to(bar, {
      scaleX: 1,
      duration: MOTION.normal,
      ease: MOTION.easeOut,
      onComplete: () => {
        gsap.to(bar, {
          opacity: 0,
          duration: 0.18,
          onComplete: () => {
            gsap.set(bar, { scaleX: 0, opacity: 1 });
            setVisible(false);
          },
        });
      },
    });
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!anchor || anchor.getAttribute('target') === '_blank') return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
        return;
      if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;

      const path = href.startsWith('http')
        ? new URL(href).pathname
        : href.split('?')[0] ?? href;
      if (path === pathname) return;

      const bar = barRef.current;
      if (!bar) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      setVisible(true);
      ensureGsapConfigured();
      tweenRef.current?.kill();
      gsap.set(bar, { scaleX: 0.08, opacity: 1 });
      tweenRef.current = gsap.to(bar, {
        scaleX: 0.85,
        duration: 6,
        ease: 'none',
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname]);

  if (!visible) {
    return (
      <div
        ref={barRef}
        aria-hidden
        className="pointer-events-none fixed left-0 right-0 top-0 z-[100] h-[2px] origin-left scale-x-0 bg-accent opacity-0"
      />
    );
  }

  return (
    <div
      ref={barRef}
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0 z-[100] h-[2px] origin-left bg-accent shadow-[0_0_8px_var(--color-accent-glow)]"
    />
  );
}
