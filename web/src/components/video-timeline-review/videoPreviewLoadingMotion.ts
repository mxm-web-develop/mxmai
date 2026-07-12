import gsap from 'gsap';

const RING_R = 36;
export const VIDEO_PREVIEW_RING_C = 2 * Math.PI * RING_R;

export function videoPreviewRingOffset(percent: number): number {
  const p = Math.min(100, Math.max(0, percent));
  return VIDEO_PREVIEW_RING_C * (1 - p / 100);
}

export function animateVideoPreviewEnter(
  root: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) {
    gsap.set(root, { opacity: 1, y: 0 });
    return null;
  }
  return gsap.fromTo(
    root,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }
  );
}

/** 取景框内扫描线 */
export function animateVideoPreviewScan(
  scan: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.fromTo(
    scan,
    { top: '8%', opacity: 0.2 },
    { top: '92%', opacity: 0.9, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' }
  );
}

/** 画面占位 shimmer */
export function animateVideoPreviewShimmer(
  shimmer: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.fromTo(
    shimmer,
    { xPercent: -120, opacity: 0 },
    { xPercent: 120, opacity: 0.55, duration: 1.8, repeat: -1, ease: 'power2.inOut' }
  );
}

/** 进度环旋转（不确定进度） */
export function animateVideoPreviewRingSpin(
  ring: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.to(ring, {
    rotation: 360,
    duration: 2.4,
    repeat: -1,
    ease: 'none',
    transformOrigin: '50% 50%',
  });
}

/** 环呼吸 */
export function animateVideoPreviewRingPulse(
  ring: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.to(ring, {
    opacity: 0.45,
    duration: 1.2,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

/** 胶片齿孔闪烁 */
export function animateVideoPreviewSprockets(
  holes: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Timeline | null {
  if (reduced) return null;
  return gsap.fromTo(
    holes,
    { opacity: 0.25, scale: 0.92 },
    {
      opacity: 0.85,
      scale: 1,
      duration: 0.9,
      stagger: { each: 0.08, from: 'random' },
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    }
  );
}

/** 口播波形条 */
export function animateVideoPreviewWaveBars(
  bars: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Timeline | null {
  if (reduced) return null;
  return gsap.to(bars, {
    scaleY: () => 0.35 + Math.random() * 0.85,
    duration: 0.55,
    stagger: { each: 0.07, repeat: -1, yoyo: true },
    ease: 'sine.inOut',
    transformOrigin: '50% 100%',
  });
}

/** 轨道粒子 */
export function animateVideoPreviewOrbit(
  dot: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.to(dot, {
    rotation: 360,
    duration: 4.5,
    repeat: -1,
    ease: 'none',
    transformOrigin: '50% 50%',
  });
}

/** 文案后的等待点 */
export function animateVideoPreviewDots(
  dots: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Timeline | null {
  if (reduced) return null;
  return gsap.to(dots, {
    opacity: 0.25,
    duration: 0.45,
    stagger: { each: 0.15, repeat: -1, yoyo: true },
    ease: 'sine.inOut',
  });
}
