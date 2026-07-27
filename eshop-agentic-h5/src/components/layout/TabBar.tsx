'use client';

import { usePathname } from 'next/navigation';
import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Clock, Home, Sparkles } from 'lucide-react';
import { NavLink } from '@/components/ui/NavLink';
import { usePrefetchRoutes } from '@/hooks/usePrefetchRoutes';
import { cn } from '@/lib/cn';
import { ensureGsapConfigured, MOTION } from '@/lib/motion/gsap-config';

const HIDE_PREFIXES = ['/create/', '/jobs/', '/projects/', '/settings', '/start/shoot/', '/login'];

export function TabBar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const fabRef = useRef<HTMLAnchorElement>(null);
  const homeIconRef = useRef<HTMLSpanElement>(null);
  const projectsIconRef = useRef<HTMLSpanElement>(null);

  const isHome = pathname === '/';
  const isStart =
    pathname === '/start' ||
    (pathname.startsWith('/start/') && !pathname.startsWith('/start/shoot/'));
  const isProjects = pathname === '/projects' || pathname.startsWith('/projects/');

  usePrefetchRoutes(['/', '/start', '/projects']);

  useGSAP(
    () => {
      ensureGsapConfigured();
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (fabRef.current && isStart) {
          gsap.fromTo(
            fabRef.current,
            { scale: 0.92 },
            { scale: 1, duration: MOTION.slow, ease: MOTION.easeOutExpo }
          );
        }

        const activeIcon = isHome
          ? homeIconRef.current
          : isProjects
            ? projectsIconRef.current
            : null;

        if (activeIcon) {
          gsap.fromTo(
            activeIcon,
            { scale: 0.85 },
            { scale: 1, duration: MOTION.normal, ease: MOTION.easeOutExpo }
          );
        }
      });

      return () => mm.revert();
    },
    { dependencies: [isHome, isStart, isProjects], scope: navRef }
  );

  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between rounded-[1.75rem] border border-border/80 bg-nav-bar px-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
        <TabItem
          href="/"
          active={isHome}
          icon={Home}
          label="首页"
          iconRef={homeIconRef}
        />

        <div className="relative -top-5 flex flex-col items-center">
          <NavLink
            ref={fabRef}
            href="/start"
            aria-label="开始创作"
            aria-current={isStart ? 'page' : undefined}
            pressScale={0.94}
            pendingSubtle
            className={cn(
              'flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full',
              'bg-gradient-to-br from-[#e07866] via-accent to-[#a84d3f] text-white',
              'shadow-[var(--shadow-fab)]',
              isStart && 'ring-4 ring-accent-soft'
            )}
          >
            <Sparkles size={26} strokeWidth={2} fill="currentColor" className="opacity-95" />
          </NavLink>
          <span
            className={cn(
              'mt-1.5 text-[11px] font-semibold transition-colors',
              'duration-[var(--motion-normal)] ease-[var(--ease-out-quart)]',
              isStart ? 'text-accent' : 'text-text-muted'
            )}
          >
            创作
          </span>
        </div>

        <TabItem
          href="/projects"
          active={isProjects}
          icon={Clock}
          label="项目"
          iconRef={projectsIconRef}
        />
      </div>
    </nav>
  );
}

function TabItem({
  href,
  active,
  icon: Icon,
  label,
  iconRef,
}: {
  href: string;
  active: boolean;
  icon: typeof Home;
  label: string;
  iconRef?: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <NavLink
      href={href}
      aria-current={active ? 'page' : undefined}
      pendingSubtle
      className={cn(
        'flex flex-1 flex-col items-center gap-1 py-3',
        active ? 'text-accent' : 'text-nav-inactive'
      )}
    >
      <span
        ref={iconRef}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-2xl',
          'transition-[background-color,color,box-shadow]',
          'duration-[var(--motion-normal)] ease-[var(--ease-out-quart)]',
          active && 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_rgba(196,92,74,0.12)]'
        )}
      >
        <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
      </span>
      <span
        className={cn(
          'text-[11px] transition-[font-weight,color]',
          'duration-[var(--motion-fast)]',
          active ? 'font-semibold' : 'font-medium'
        )}
      >
        {label}
      </span>
    </NavLink>
  );
}
