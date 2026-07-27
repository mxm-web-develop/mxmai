import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import type { ServiceSummary } from '@/adapters/types';
import { cn } from '@/lib/cn';

const CATEGORY_META: Record<string, { badge: string; tint: string }> = {
  shoot: { badge: '商拍', tint: 'bg-accent-soft text-accent' },
  batch: { badge: '批量', tint: 'bg-accent-coral/15 text-accent-coral' },
  video: { badge: '视频', tint: 'bg-blue-50 text-blue-600' },
  poster: { badge: '海报', tint: 'bg-purple-50 text-purple-600' },
  design: { badge: '设计', tint: 'bg-emerald-50 text-emerald-700' },
};

export function ServiceCard({ service }: { service: ServiceSummary }) {
  const meta = CATEGORY_META[service.category] ?? CATEGORY_META.shoot;

  return (
    <Link
      href={`/services/${service.slug}`}
      className={cn(
        'group flex gap-3 rounded-xl border border-border bg-surface p-3 pressable',
        'transition-[border-color,box-shadow] duration-[var(--motion-normal)] ease-[var(--ease-out-quart)]',
        'hover:border-border-strong hover:shadow-[var(--shadow-card)]',
        service.comingSoon && 'opacity-70'
      )}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-elevated ring-1 ring-border/60">
        <Image src={service.coverImage} alt="" fill className="object-cover" sizes="64px" />
        <span
          className={cn(
            'absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none backdrop-blur-sm',
            meta.tint
          )}
        >
          {meta.badge}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight text-text">{service.title}</h3>
          <ChevronRight
            size={18}
            className="shrink-0 text-text-muted transition-transform duration-[var(--motion-fast)] group-hover:translate-x-0.5"
          />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{service.description}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {service.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-muted"
            >
              {tag}
            </span>
          ))}
          {service.comingSoon && (
            <span className="rounded-md bg-accent-coral/15 px-2 py-0.5 text-xs font-medium text-accent-coral">
              即将上线
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
