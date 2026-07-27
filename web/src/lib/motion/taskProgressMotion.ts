import gsap from 'gsap';

const RING_RADIUS = 52;
export const TASK_PROGRESS_RING_C = 2 * Math.PI * RING_RADIUS;

/** 进度环 stroke-dashoffset（0% → 满圈） */
export function taskProgressRingOffset(percent: number): number {
  const p = Math.min(100, Math.max(0, percent));
  return TASK_PROGRESS_RING_C * (1 - p / 100);
}

/** 进度舞台入场 */
export function animateTaskProgressEnter(
  panel: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) {
    gsap.set(panel, { opacity: 1, scale: 1 });
    return null;
  }
  return gsap.fromTo(
    panel,
    { opacity: 0, scale: 0.94, y: 12 },
    { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: 'power3.out' }
  );
}

/** 轨道粒子公转 */
export function animateTaskProgressOrbit(
  orbit: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.to(orbit, {
    rotation: 360,
    duration: 10,
    repeat: -1,
    ease: 'none',
    transformOrigin: '50% 50%',
  });
}

/** 扫描线上下移动 */
export function animateTaskProgressScan(
  scan: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.fromTo(
    scan,
    { top: '12%', opacity: 0.35 },
    { top: '88%', opacity: 0.85, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' }
  );
}

/** 无具体进度时的呼吸脉冲 */
export function animateTaskProgressIndeterminate(
  ring: gsap.TweenTarget,
  reduced?: boolean
): gsap.core.Tween | null {
  if (reduced) return null;
  return gsap.to(ring, {
    opacity: 0.35,
    duration: 1.4,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

/** 进度数值与环同步 */
export function animateTaskProgressValue(
  ring: SVGCircleElement | null,
  counter: { value: number },
  target: number,
  onTick: (n: number) => void,
  reduced?: boolean
): gsap.core.Timeline | null {
  if (!ring) return null;
  const offset = taskProgressRingOffset(target);
  if (reduced) {
    gsap.set(ring, { attr: { 'stroke-dashoffset': offset }, opacity: 1 });
    counter.value = target;
    onTick(Math.round(target));
    return null;
  }
  const tl = gsap.timeline();
  tl.to(
    ring,
    { attr: { 'stroke-dashoffset': offset }, duration: 0.85, ease: 'power2.out' },
    0
  ).to(
    counter,
    {
      value: target,
      duration: 0.85,
      ease: 'power2.out',
      onUpdate: () => onTick(Math.round(counter.value)),
    },
    0
  );
  return tl;
}
