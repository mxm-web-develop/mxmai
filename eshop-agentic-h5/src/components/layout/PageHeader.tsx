'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PressableButton } from '@/components/ui/PressableButton';

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
  transparent,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: ReactNode;
  transparent?: boolean;
}) {
  const router = useRouter();

  return (
    <header
      className={
        transparent
          ? 'safe-top sticky top-0 z-30'
          : 'safe-top sticky top-0 z-30 border-b border-border/60 bg-bg-elevated/85 backdrop-blur-md'
      }
    >
      <div className="flex items-center gap-2 px-4 py-3.5">
        {backHref !== undefined && (
          <PressableButton
            onClick={() => (backHref ? router.push(backHref) : router.back())}
            className="touch-target -ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-text-secondary shadow-sm"
            aria-label="返回"
          >
            <ChevronLeft size={22} strokeWidth={2} />
          </PressableButton>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[1.35rem] font-semibold leading-tight text-text">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-[13px] text-text-secondary">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}
