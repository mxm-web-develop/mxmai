'use client';

import type { ReactNode } from 'react';
import { NavigationProgress } from '@/components/motion/NavigationProgress';
import { PwaInstallBanner } from '@/components/pwa/PwaInstallBanner';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <NavigationProgress />
      <div className="app-shell-inner mx-auto min-h-dvh max-w-lg pb-[calc(72px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <PwaInstallBanner />
    </>
  );
}
