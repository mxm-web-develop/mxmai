import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function LandingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      t += reduceMotion ? 0 : 0.004;
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.classList.contains('dark');
      const gridColor = isDark ? 'rgba(56, 189, 248, 0.07)' : 'rgba(0, 47, 167, 0.06)';
      const glowA = isDark ? 'rgba(0, 47, 167, 0.22)' : 'rgba(56, 189, 248, 0.14)';
      const glowB = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(0, 47, 167, 0.08)';

      const step = 48;
      const offsetX = reduceMotion ? 0 : Math.sin(t * 0.7) * 8;
      const offsetY = reduceMotion ? 0 : Math.cos(t * 0.5) * 6;

      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let x = -step; x < w + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, 0);
        ctx.lineTo(x + offsetX, h);
        ctx.stroke();
      }
      for (let y = -step; y < h + step; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + offsetY);
        ctx.lineTo(w, y + offsetY);
        ctx.stroke();
      }

      const g1 = ctx.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, w * 0.45);
      g1.addColorStop(0, glowA);
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * 0.85, h * 0.75, 0, w * 0.85, h * 0.75, w * 0.35);
      g2.addColorStop(0, glowB);
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);

    const onTheme = () => {
      if (!reduceMotion) draw();
    };
    const observer = new MutationObserver(onTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="mxm-landing-bg" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
