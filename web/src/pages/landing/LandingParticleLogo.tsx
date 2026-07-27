import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface Particle {
  x: number;
  y: number;
  tx: number;
  ty: number;
  size: number;
  alpha: number;
  phase: number;
  tint: number;
}

interface Point {
  x: number;
  y: number;
}

const STAGES = [
  { text: 'Mind', fontSize: 44, hold: 1.35, morph: 1.05 },
  { text: 'M', fontSize: 58, hold: 0.85, morph: 0.85 },
  { text: 'Machine', fontSize: 36, hold: 1.35, morph: 1.1 },
  { text: 'Mind × Machine', fontSize: 23, hold: 2.1, morph: 1.25 },
] as const;

const CANVAS_W = 288;
const CANVAS_H = 68;
const SAMPLE_GAP = 2;
const FONT =
  '700 %dpx "Space Grotesk", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

function sampleTextPoints(text: string, width: number, height: number, fontSize: number): Point[] {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d');
  if (!ctx) return [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT.replace('%d', String(fontSize));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);

  const { data } = ctx.getImageData(0, 0, width, height);
  const points: Point[] = [];

  for (let y = 0; y < height; y += SAMPLE_GAP) {
    for (let x = 0; x < width; x += SAMPLE_GAP) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 101) points.push({ x, y });
    }
  }

  return points;
}

function padPoints(points: Point[], count: number): Point[] {
  if (points.length === 0) return [];
  const result = [...points];
  while (result.length < count) {
    const src = points[result.length % points.length];
    result.push({
      x: src.x + (Math.random() - 0.5) * 2.4,
      y: src.y + (Math.random() - 0.5) * 2.4,
    });
  }
  return result;
}

function subsamplePoints(points: Point[], count: number): Point[] {
  if (points.length <= count) return padPoints(points, count);
  const step = points.length / count;
  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  return result;
}

function buildStageTargets(): Point[][] {
  const raw = STAGES.map((stage) =>
    sampleTextPoints(stage.text, CANVAS_W, CANVAS_H, stage.fontSize),
  );
  const count = Math.max(...raw.map((pts) => pts.length), 1);
  return raw.map((pts) => subsamplePoints(pts, count));
}

function createParticles(targets: Point[]): Particle[] {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  return targets.map((t, i) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 120;
    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      tx: t.x,
      ty: t.y,
      size: 2.05 + Math.random() * 0.35,
      alpha: 0,
      phase: i * 0.13,
      tint: Math.random(),
    };
  });
}

function drawStaticLogo(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
  ctx.font = FONT.replace('%d', '24');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Mind × Machine', CANVAS_W / 2, CANVAS_H / 2 + 1);
}

export function LandingParticleLogo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const stageTargetsRef = useRef<Point[][]>([]);
  const cycleRef = useRef<gsap.core.Timeline | null>(null);
  const drawFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let alive = true;

    const setupCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(CANVAS_W * dpr);
      canvas.height = Math.floor(CANVAS_H * dpr);
      canvas.style.width = `${CANVAS_W}px`;
      canvas.style.height = `${CANVAS_H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    setupCanvas();

    if (reduceMotion) {
      drawStaticLogo(ctx);
      return;
    }

    const scatter = (particles: Particle[]) => {
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;
      particles.forEach((p) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 55 + Math.random() * 105;
        p.x = cx + Math.cos(angle) * dist;
        p.y = cy + Math.sin(angle) * dist;
        p.alpha = 0.06;
      });
    };

    const morphToStage = (stageIndex: number, duration: number) => {
      const targets = stageTargetsRef.current[stageIndex];
      const particles = particlesRef.current;
      if (!targets?.length || !particles.length) return;

      gsap.killTweensOf(particles);
      particles.forEach((p, i) => {
        const target = targets[i];
        p.tx = target.x;
        p.ty = target.y;
        gsap.to(p, {
          x: target.x,
          y: target.y,
          alpha: 0.75 + Math.random() * 0.1,
          duration: duration * (0.88 + Math.random() * 0.22),
          delay: Math.random() * 0.18,
          ease: 'power3.inOut',
          overwrite: true,
        });
      });
    };

    const drawParticle = (
      ctx: CanvasRenderingContext2D,
      px: number,
      py: number,
      radius: number,
      alpha: number,
      tint: number,
    ) => {
      const a = Math.min(1, alpha);
      const cyanMix = 0.18 + tint * 0.14;

      ctx.beginPath();
      ctx.arc(px, py, radius * 1.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${a * 0.16})`;
      ctx.fill();

      ctx.beginPath();
      const side = radius * 1.72;
      const half = side / 2;
      const r = Math.min(half, 0.85);
      ctx.roundRect(px - half, py - half, side, side, r);
      const coreR = Math.round(248 - cyanMix * 28);
      const coreG = Math.round(250 - cyanMix * 18);
      const coreB = 252;
      ctx.fillStyle = `rgba(${coreR}, ${coreG}, ${coreB}, ${a * 0.96})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, radius * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.fill();
    };

    const startDrawLoop = () => {
      const draw = () => {
        if (!alive) return;
        const particles = particlesRef.current;
        if (!particles.length) return;

        const t = gsap.ticker.time;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const glow = ctx.createRadialGradient(
          CANVAS_W / 2,
          CANVAS_H / 2,
          0,
          CANVAS_W / 2,
          CANVAS_H / 2,
          CANVAS_W * 0.38,
        );
        glow.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
        glow.addColorStop(0.6, 'rgba(0, 47, 167, 0.06)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const wobbleX = Math.sin(t * 2.4 + p.phase) * 0.55;
          const wobbleY = Math.cos(t * 2.1 + p.phase) * 0.55;
          const pulse = 0.97 + Math.sin(t * 2.8 + p.phase) * 0.03;
          const flicker = 0.96 + Math.sin(t * 5.5 + p.phase * 1.6) * 0.04;
          const radius = p.size * pulse;

          drawParticle(ctx, p.x + wobbleX, p.y + wobbleY, radius, p.alpha * flicker, p.tint);
        }
      };

      gsap.ticker.add(draw);
      return draw;
    };

    const startMorphCycle = () => {
      const cycle = gsap.timeline({ repeat: -1, delay: STAGES[0].morph + 0.25 });

      for (let stage = 0; stage < STAGES.length; stage++) {
        const next = (stage + 1) % STAGES.length;
        cycle.to({}, { duration: STAGES[stage].hold });
        cycle.call(() => {
          if (!alive) return;
          morphToStage(next, STAGES[next].morph);
        });
      }

      cycleRef.current = cycle;
    };

    const init = () => {
      setupCanvas();
      stageTargetsRef.current = buildStageTargets();
      const firstTargets = stageTargetsRef.current[0];
      if (!firstTargets?.length) {
        drawStaticLogo(ctx);
        return;
      }

      const particles = createParticles(firstTargets);
      particlesRef.current = particles;

      scatter(particles);
      morphToStage(0, STAGES[0].morph);

      drawFnRef.current = startDrawLoop();
      gsap.ticker.wake();

      gsap.to(root, {
        scale: 1.03,
        duration: 3.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        transformOrigin: '50% 50%',
      });

      startMorphCycle();
    };

    const boot = async () => {
      try {
        await Promise.all(
          STAGES.map((stage) => document.fonts.load(FONT.replace('%d', String(stage.fontSize)))),
        );
      } catch {
        /* fallback font */
      }
      await document.fonts.ready;
      if (!alive) return;
      init();
    };

    void boot();

    return () => {
      alive = false;
      if (drawFnRef.current) {
        gsap.ticker.remove(drawFnRef.current);
        drawFnRef.current = null;
      }
      cycleRef.current?.kill();
      cycleRef.current = null;
      gsap.killTweensOf(root);
      gsap.killTweensOf(particlesRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="mxm-landing-hero__particle-logo">
      <canvas ref={canvasRef} aria-hidden />
      <span className="visually-hidden">Mind · M · Machine · Mind × Machine</span>
    </div>
  );
}
