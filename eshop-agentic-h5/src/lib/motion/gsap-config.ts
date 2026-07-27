import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

let configured = false;

/** Project-wide GSAP defaults — warm product UI, snappy feedback. */
export function ensureGsapConfigured() {
  if (configured) return;
  gsap.registerPlugin(useGSAP);
  gsap.defaults({
    duration: 0.28,
    ease: 'power3.out',
  });
  configured = true;
}

export const MOTION = {
  fast: 0.14,
  normal: 0.22,
  slow: 0.36,
  stagger: 0.045,
  easeOut: 'power3.out',
  easeOutExpo: 'expo.out',
} as const;
