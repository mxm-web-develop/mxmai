import gsap from 'gsap';
import { prefersReducedMotion } from './useReducedMotion';

export const MOTION = {
  cardEnter: { duration: 0.42, ease: 'power3.out' as const, y: 14, scale: 0.98 },
  viewerBackdrop: { duration: 0.45, ease: 'power2.out' as const },
  viewerShell: { duration: 0.65, ease: 'power3.out' as const, y: 36 },
  listBar: { duration: 0.45, ease: 'sine.inOut' as const },
  landingReveal: { duration: 0.7, ease: 'power3.out' as const, y: 24 },
} as const;

type GsapTarget = gsap.TweenTarget;

/** Task grid card entrance */
export function animateCardEnter(target: GsapTarget, reduced?: boolean): gsap.core.Tween | null {
  const skip = reduced ?? prefersReducedMotion();
  if (skip) {
    gsap.set(target, { opacity: 1, y: 0, scale: 1 });
    return null;
  }
  return gsap.fromTo(
    target,
    { opacity: 0, y: MOTION.cardEnter.y, scale: MOTION.cardEnter.scale },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: MOTION.cardEnter.duration,
      ease: MOTION.cardEnter.ease,
    }
  );
}

/** Immersive viewer: backdrop + shell timeline */
export function animateViewerShellEnter(
  backdrop: GsapTarget,
  shell: GsapTarget,
  reduced?: boolean
): gsap.core.Timeline | null {
  const skip = reduced ?? prefersReducedMotion();
  if (skip) {
    gsap.set([backdrop, shell], { opacity: 1, y: 0, scale: 1 });
    return null;
  }
  const tl = gsap.timeline();
  tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: MOTION.viewerBackdrop.duration, ease: MOTION.viewerBackdrop.ease })
    .fromTo(
      shell,
      { opacity: 0, y: MOTION.viewerShell.y, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: MOTION.viewerShell.duration,
        ease: MOTION.viewerShell.ease,
      },
      0.08
    );
  return tl;
}

/** Audio waveform bars pulse loop */
export function animateListBarPulse(
  bars: GsapTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  const skip = reduced ?? prefersReducedMotion();
  if (skip) return null;
  return gsap.to(bars, {
    scaleY: () => 0.25 + Math.random() * 0.85,
    duration: MOTION.listBar.duration,
    stagger: { each: 0.04, from: 'center' },
    repeat: -1,
    yoyo: true,
    ease: MOTION.listBar.ease,
    transformOrigin: '50% 100%',
  });
}

/** Landing section reveal */
export function animateLandingReveal(
  targets: GsapTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  const skip = reduced ?? prefersReducedMotion();
  if (skip) {
    gsap.set(targets, { opacity: 1, y: 0 });
    return null;
  }
  return gsap.fromTo(
    targets,
    { opacity: 0, y: MOTION.landingReveal.y },
    {
      opacity: 1,
      y: 0,
      duration: MOTION.landingReveal.duration,
      ease: MOTION.landingReveal.ease,
      stagger: 0.1,
    }
  );
}
