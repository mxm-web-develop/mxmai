'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/motion/Skeleton';

const GridShootStudio = dynamic(
  () =>
    import('@/components/studio/GridShootStudio').then((m) => ({ default: m.GridShootStudio })),
  {
    loading: () => (
      <div className="space-y-4" aria-busy="true" aria-label="加载表单">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    ),
  }
);

export default GridShootStudio;
