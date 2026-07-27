import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useReducedMotion } from '../lib/motion/useReducedMotion';
import './BrandLoading.css';

gsap.registerPlugin(useGSAP);

export type BrandLoadingSize = 'small' | 'default' | 'large';

export interface BrandLoadingProps {
  size?: BrandLoadingSize;
  tip?: ReactNode;
  spinning?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  fullscreen?: boolean;
}

const ORBIT_DOTS = 3;

/** 品牌 GSAP 轨道加载器 — 替代 antd Spin */
export function BrandLoading({
  size = 'default',
  tip,
  spinning = true,
  className = '',
  style,
  children,
  fullscreen = false,
}: BrandLoadingProps) {
  const reduced = useReducedMotion();
  const gradientId = useId().replace(/:/g, '');
  const orbRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = orbRef.current;
      if (!root || reduced) return;

      const ring = root.querySelector('.brand-loading__ring');
      const core = root.querySelector('.brand-loading__core');
      const dots = root.querySelectorAll('.brand-loading__dot');

      if (ring) {
        gsap.to(ring, {
          rotate: 360,
          duration: 2.6,
          repeat: -1,
          ease: 'none',
          transformOrigin: '50% 50%',
        });
      }

      if (core) {
        gsap.to(core, {
          scale: 1.14,
          opacity: 0.88,
          duration: 1.05,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          transformOrigin: '50% 50%',
        });
      }

      dots.forEach((dot, index) => {
        gsap.to(dot, {
          opacity: 0.35,
          scale: 0.78,
          duration: 0.55,
          repeat: -1,
          yoyo: true,
          delay: index * 0.16,
          ease: 'sine.inOut',
          transformOrigin: '50% 50%',
        });
      });
    },
    { scope: orbRef, dependencies: [reduced, size] }
  );

  const indicator = (
    <div
      className={`brand-loading brand-loading--${size} ${className}`.trim()}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="brand-loading__orb" ref={orbRef} aria-hidden="true">
        <svg className="brand-loading__ring" viewBox="0 0 40 40" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#002fa7" />
            </linearGradient>
          </defs>
          <circle className="brand-loading__ring-track" cx="20" cy="20" r="15.5" />
          <circle
            className="brand-loading__ring-arc"
            cx="20"
            cy="20"
            r="15.5"
            style={{ stroke: `url(#${gradientId})` }}
          />
        </svg>
        {Array.from({ length: ORBIT_DOTS }, (_, i) => (
          <span key={i} className="brand-loading__dot" style={{ ['--bl-dot-index' as string]: i }} />
        ))}
        <span className="brand-loading__core" />
      </div>
      {tip ? <p className="brand-loading__tip">{tip}</p> : null}
    </div>
  );

  if (!children) {
    if (!spinning) return null;
    return indicator;
  }

  return (
    <div
      className={[
        'brand-loading-nest',
        fullscreen ? 'brand-loading-nest--fullscreen' : '',
        spinning ? 'brand-loading-nest--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {spinning ? <div className="brand-loading-nest__overlay">{indicator}</div> : null}
      <div
        className={
          spinning ? 'brand-loading-nest__content brand-loading-nest__content--dim' : 'brand-loading-nest__content'
        }
        aria-hidden={spinning ? true : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export default BrandLoading;
