import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useAuth } from '../../context/AuthContext';
import { useReducedMotion } from '../../lib/motion/useReducedMotion';
import { BusinessBubble, type BubbleTone } from './BusinessBubble';

gsap.registerPlugin(useGSAP);

const CAPABILITIES: { id: string; label: string; tone: BubbleTone }[] = [
  { id: 'writing', label: 'Writing', tone: 'writing' },
  { id: 'graph', label: 'Image', tone: 'image' },
  { id: 'audio', label: 'Audio', tone: 'audio' },
  { id: 'music', label: 'Music', tone: 'music' },
  { id: 'video', label: 'Video', tone: 'video' },
  { id: 'agent', label: 'Agent', tone: 'agent' },
];

const BUBBLE_COUNT = 18;
const SPECK_COUNT = 32;
const ORBIT_COUNT = 10;

type OrbitConfig = { radius: number; duration: number; start: number; size: number };

const ORBIT_PARTICLES: OrbitConfig[] = Array.from({ length: ORBIT_COUNT }, (_, i) => ({
  radius: 118 + (i % 5) * 28,
  duration: 16 + (i % 4) * 5,
  start: (360 / ORBIT_COUNT) * i,
  size: 5 + (i % 3) * 3,
}));

function animateOrbitParticle(
  el: HTMLElement,
  centerX: number,
  centerY: number,
  config: OrbitConfig,
  dir: 1 | -1
) {
  const state = { angle: config.start };
  gsap.to(state, {
    angle: config.start + 360 * dir,
    duration: config.duration,
    repeat: -1,
    ease: 'none',
    onUpdate: () => {
      const rad = (state.angle * Math.PI) / 180;
      const wobble = Math.sin(rad * 3) * 8;
      const r = config.radius + wobble;
      gsap.set(el, {
        x: centerX + Math.cos(rad) * r - config.size / 2,
        y: centerY + Math.sin(rad) * r - config.size / 2,
      });
    },
  });
}

export function DashboardVisual() {
  const rootRef = useRef<HTMLElement>(null);
  const { user, isAdmin } = useAuth();
  const reducedMotion = useReducedMotion();

  useGSAP(
    (_context, contextSafe) => {
      const root = rootRef.current;
      if (!root) return;

      const orbs = gsap.utils.toArray<HTMLElement>('.dv-orb', root);
      const grid = root.querySelector('.dv-grid');
      const heroGlow = root.querySelector('.dv-hero-glow');
      const kicker = root.querySelector('.dv-kicker');
      const title = root.querySelector('.dv-title');
      const subtitle = root.querySelector('.dv-subtitle');
      const greet = root.querySelector('.dv-greet');
      const bubbles = gsap.utils.toArray<HTMLElement>('.dv-bubble-item', root);
      const ambientBubbles = gsap.utils.toArray<HTMLElement>('.dv-ambient-dot', root);
      const specks = gsap.utils.toArray<HTMLElement>('.dv-speck', root);
      const orbitParticles = gsap.utils.toArray<HTMLElement>('.dv-orbit-particle', root);
      const particleField = root.querySelector('.dv-particle-field');

      if (reducedMotion) {
        gsap.set(
          [kicker, title, subtitle, greet, heroGlow, ...orbs, ...bubbles, ...ambientBubbles, ...specks, ...orbitParticles],
          { opacity: 1, y: 0, scale: 1, filter: 'none' }
        );
        if (grid) gsap.set(grid, { opacity: 1 });
        return;
      }

      gsap.set([kicker, subtitle, greet], { opacity: 0, y: 16 });
      if (title) gsap.set(title, { opacity: 0, y: 20, filter: 'blur(8px)' });
      gsap.set(bubbles, { opacity: 0, scale: 0.88, y: 10 });
      gsap.set(orbs, { opacity: 0, scale: 0.7 });
      gsap.set([...ambientBubbles, ...specks, ...orbitParticles], { opacity: 0, scale: 0.4 });
      if (heroGlow) gsap.set(heroGlow, { opacity: 0, scale: 0.85 });
      if (grid) gsap.set(grid, { opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.to(orbs, { opacity: 1, scale: 1, duration: 1.1, stagger: 0.08 }, 0)
        .to(grid, { opacity: 1, duration: 0.75 }, 0.06)
        .to(heroGlow, { opacity: 1, scale: 1, duration: 1, ease: 'power2.out' }, 0.08)
        .to(
          [...ambientBubbles, ...specks, ...orbitParticles],
          { opacity: 1, scale: 1, duration: 0.9, stagger: 0.02, ease: 'power2.out' },
          0.1
        )
        .to(kicker, { opacity: 1, y: 0, duration: 0.55 }, 0.15)
        .to(title, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75, ease: 'power4.out' }, 0.24)
        .to(subtitle, { opacity: 1, y: 0, duration: 0.5 }, 0.38)
        .to(
          bubbles,
          { opacity: 1, scale: 1, y: 0, duration: 0.55, stagger: 0.06, ease: 'power2.out' },
          0.42
        )
        .to(greet, { opacity: 1, y: 0, duration: 0.45 }, 0.62);

      if (heroGlow) {
        gsap.to(heroGlow, {
          scale: 1.08,
          opacity: 0.85,
          duration: 3.2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      }

      if (grid) {
        gsap.to(grid, {
          backgroundPosition: '48px 48px',
          duration: 24,
          repeat: -1,
          ease: 'none',
        });
      }

      ambientBubbles.forEach((dot, i) => {
        const driftY = 14 + (i % 5) * 6;
        const driftX = (i % 2 === 0 ? 1 : -1) * (8 + (i % 4) * 3);
        gsap.to(dot, {
          y: `+=${driftY}`,
          x: `+=${driftX}`,
          rotation: i % 2 === 0 ? 8 : -8,
          duration: 4.5 + (i % 6) * 0.7,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.08,
        });
        gsap.to(dot, {
          scale: 1 + (i % 3) * 0.08,
          opacity: 0.55 + (i % 4) * 0.1,
          duration: 2.8 + (i % 5) * 0.4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });

      specks.forEach((speck, i) => {
        const rise = 40 + (i % 6) * 12;
        gsap.fromTo(
          speck,
          { y: 0, opacity: 0.15 + (i % 3) * 0.12 },
          {
            y: -rise,
            opacity: 0.55 + (i % 4) * 0.1,
            duration: 3.5 + (i % 7) * 0.6,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: i * 0.05,
          }
        );
        gsap.to(speck, {
          x: `+=${(i % 2 === 0 ? 1 : -1) * (6 + (i % 5))}`,
          duration: 2.2 + (i % 4) * 0.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });

      if (particleField) {
        const rect = root.getBoundingClientRect();
        const cx = rect.width * 0.5;
        const cy = rect.height * 0.46;

        orbitParticles.forEach((el, i) => {
          const cfg = ORBIT_PARTICLES[i];
          if (!cfg) return;
          animateOrbitParticle(el, cx, cy, cfg, i % 2 === 0 ? 1 : -1);
          gsap.to(el, {
            scale: 1.2,
            opacity: 0.7,
            duration: 2 + (i % 3),
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        });
      }

      orbs.forEach((orb, i) => {
        gsap.to(orb, {
          x: `+=${16 + i * 6}`,
          y: `+=${-12 + i * 4}`,
          scale: 1.06,
          duration: 5 + i * 0.8,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });

      const onMove = contextSafe((e: MouseEvent) => {
        const rect = root.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        gsap.to(orbs, {
          x: nx * 32,
          y: ny * 26,
          duration: 1.4,
          ease: 'power2.out',
          overwrite: 'auto',
        });
        gsap.to('.dv-ambient, .dv-particle-field', {
          x: nx * 12,
          y: ny * 10,
          duration: 1.6,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      });

      root.addEventListener('mousemove', onMove);
      return () => root.removeEventListener('mousemove', onMove);
    },
    { scope: rootRef, dependencies: [reducedMotion], revertOnUpdate: true }
  );

  const username = user?.username ?? '';

  return (
    <section ref={rootRef} className="dashboard-visual" aria-label="Console welcome">
      <div className="dv-bg" aria-hidden="true">
        <div className="dv-orb dv-orb--cyan" />
        <div className="dv-orb dv-orb--blue" />
        <div className="dv-orb dv-orb--violet" />
        <div className="dv-grid" />
        <div className="dv-hero-glow" />

        <div className="dv-particle-field">
          {ORBIT_PARTICLES.map((cfg, i) => (
            <span
              key={`orbit-${i}`}
              className="dv-orbit-particle"
              style={{ width: cfg.size, height: cfg.size, ['--dv-i' as string]: i } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="dv-ambient">
          {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
            <span key={i} className="dv-ambient-dot" style={{ ['--dv-i' as string]: i } as React.CSSProperties} />
          ))}
          {Array.from({ length: SPECK_COUNT }, (_, i) => (
            <span key={`s-${i}`} className="dv-speck" style={{ ['--dv-i' as string]: i } as React.CSSProperties} />
          ))}
        </div>
      </div>

      <div className="dv-hero">
        <p className="dv-kicker">AI Workflow Console</p>
        <h2 className="dv-title">
          <span className="dv-title__inner">
            <span className="dv-title__base">
              Mind <span className="dv-title__x">×</span> Machine
            </span>
            <span className="dv-title__shine" aria-hidden="true">
              Mind <span className="dv-title__x">×</span> Machine
            </span>
          </span>
        </h2>
        <p className="dv-subtitle">Describe · Generate · Orchestrate</p>

        <ul className="dv-bubbles" aria-label="Capabilities">
          {CAPABILITIES.map((cap) => (
            <li key={cap.id} className="dv-bubble-item">
              <BusinessBubble label={cap.label} tone={cap.tone} />
            </li>
          ))}
        </ul>
      </div>

      <p className="dv-greet">
        {username}
        {isAdmin ? ' · Admin' : ''}
      </p>
    </section>
  );
}
