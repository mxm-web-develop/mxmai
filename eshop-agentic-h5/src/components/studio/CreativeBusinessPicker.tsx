'use client';

import { ArrowRight, Camera, Layers, Palette, Sparkles, Video } from 'lucide-react';
import {
  DESIGN_OFFERINGS,
  getCreativeGroupsWithOfferings,
  SHOOT_OFFERINGS,
  SMARTFLOW_SUITE_OFFERING,
  VIDEO_OFFERINGS,
} from '@/catalog/creative-offerings';
import { StaggerReveal } from '@/components/motion/StaggerReveal';
import { NavLink } from '@/components/ui/NavLink';
import { LineCardIllustration } from '@/components/studio/LineCardIllustration';
import type { GridShootLineId } from '@/catalog/grid-shoot-lines';
import { usePrefetchRoutes } from '@/hooks/usePrefetchRoutes';
import { cn } from '@/lib/cn';

const GROUP_ICON = {
  shoot: Camera,
  design: Palette,
  video: Video,
} as const;

export function CreativeBusinessPicker() {
  usePrefetchRoutes([
    SMARTFLOW_SUITE_OFFERING.href,
    ...SHOOT_OFFERINGS.map((o) => o.href),
    ...DESIGN_OFFERINGS.map((o) => o.href),
    ...VIDEO_OFFERINGS.map((o) => o.href),
  ]);

  return (
    <StaggerReveal className="space-y-6" childSelector="> *">
      <NavLink
        href={SMARTFLOW_SUITE_OFFERING.href}
        className="relative block overflow-hidden rounded-[1.5rem] border border-accent/25 p-5 transition-transform duration-150"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#fff5f2] via-[#f8ebe8] to-[#e3edf5] opacity-95"
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-accent/15 blur-2xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-[var(--shadow-fab)]">
            <Layers size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="chip bg-accent-soft text-accent">Smartflow</p>
            <p className="mt-2 font-display text-lg font-semibold text-text">
              {SMARTFLOW_SUITE_OFFERING.title}
            </p>
            <p className="mt-1 text-sm text-text-secondary">{SMARTFLOW_SUITE_OFFERING.tagline}</p>
          </div>
          <ArrowRight size={20} className="shrink-0 text-accent" />
        </div>
      </NavLink>

      {getCreativeGroupsWithOfferings().map((group) => {
        const Icon = GROUP_ICON[group.id];
        const items =
          group.id === 'shoot'
            ? SHOOT_OFFERINGS
            : group.id === 'design'
              ? DESIGN_OFFERINGS
              : VIDEO_OFFERINGS;

        return (
          <section key={group.id} className="space-y-3">
            <div className="flex items-center gap-2 px-0.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-accent shadow-sm">
                <Icon size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-text">{group.title}</p>
                <p className="text-xs text-text-muted">{group.subtitle}</p>
              </div>
            </div>

            <div
              className={cn(
                'grid gap-3',
                group.id === 'shoot' ? 'grid-cols-2' : 'grid-cols-1'
              )}
            >
              {items.map((item) => (
                <NavLink
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'relative min-h-[6.75rem] overflow-hidden rounded-2xl border-2 border-transparent p-4 pr-[4.5rem] text-left shadow-sm transition-all hover:border-border-strong',
                    item.cardClass
                  )}
                >
                  {group.id === 'shoot' ? (
                    <LineCardIllustration lineId={item.id as GridShootLineId} />
                  ) : (
                    <span className="pointer-events-none absolute -bottom-2 -right-2 flex h-24 w-24 items-center justify-center opacity-40">
                      {group.id === 'design' ? (
                        <Palette size={56} strokeWidth={1.25} />
                      ) : (
                        <Video size={56} strokeWidth={1.25} />
                      )}
                    </span>
                  )}
                  <div className="relative z-[1]">
                    <p className="font-display text-xl font-semibold text-text">
                      {'shortTitle' in item ? item.shortTitle : item.title}
                    </p>
                    <p className="mt-1 max-w-[8.5rem] text-xs leading-snug text-text-secondary">
                      {item.tagline}
                    </p>
                  </div>
                  <Sparkles
                    size={14}
                    className="absolute bottom-4 right-4 z-[1] text-accent/50"
                  />
                </NavLink>
              ))}
            </div>
          </section>
        );
      })}
    </StaggerReveal>
  );
}
