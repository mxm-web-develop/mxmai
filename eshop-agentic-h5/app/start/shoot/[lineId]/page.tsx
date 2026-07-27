'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { getShootOfferingByLineId, isGridShootLineId } from '@/catalog/creative-offerings';
import GridShootStudio from './ShootStudioDynamic';
import type { GridShootLineId } from '@/catalog/grid-shoot-lines';

export default function ShootFormPage() {
  const params = useParams();
  const router = useRouter();
  const lineId = String(params.lineId ?? '');
  const offering = getShootOfferingByLineId(lineId);

  useEffect(() => {
    if (!isGridShootLineId(lineId)) {
      router.replace('/start');
    }
  }, [lineId, router]);

  if (!offering || !isGridShootLineId(lineId)) {
    return <main className="p-6 text-center text-sm text-text-muted">跳转中…</main>;
  }

  return (
    <>
      <PageHeader
        title={offering.shortTitle}
        subtitle="上传参考图 · 3×3 宫格"
        backHref="/start"
      />
      <main className="px-4 py-2">
        <GridShootStudio lineId={lineId as GridShootLineId} />
      </main>
    </>
  );
}
