'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { OpenApiTaskForm } from '@/components/studio/OpenApiTaskForm';
import {
  DESIGN_OFFERINGS,
  SMARTFLOW_SUITE_OFFERING,
  VIDEO_OFFERINGS,
} from '@/catalog/creative-offerings';
import { getGridShootLineBySlug, isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { getManifestBySlug } from '@/catalog/manifests';

function resolveTitle(slug: string): { title: string; subtitle?: string } {
  if (slug === SMARTFLOW_SUITE_OFFERING.slug) {
    return {
      title: SMARTFLOW_SUITE_OFFERING.title,
      subtitle: SMARTFLOW_SUITE_OFFERING.tagline,
    };
  }
  const design = DESIGN_OFFERINGS.find((d) => d.slug === slug);
  if (design) return { title: design.title, subtitle: design.tagline };
  const video = VIDEO_OFFERINGS.find((v) => v.slug === slug);
  if (video) return { title: video.title, subtitle: video.tagline };
  try {
    const m = getManifestBySlug(slug);
    return { title: m.title, subtitle: m.description ?? undefined };
  } catch {
    return { title: slug };
  }
}

export default function CreateFormPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug ?? '');

  useEffect(() => {
    if (isGridShootSlug(slug)) {
      const line = getGridShootLineBySlug(slug);
      router.replace(line ? `/start/shoot/${line.id}` : '/start');
    }
  }, [slug, router]);

  if (isGridShootSlug(slug)) {
    return <main className="p-6 text-center text-sm text-text-muted">跳转中…</main>;
  }

  const { title, subtitle } = resolveTitle(slug);

  return (
    <>
      <PageHeader title={title} subtitle={subtitle ?? '填写参数并提交'} backHref="/start" />
      <main className="px-4 py-2">
        <OpenApiTaskForm slug={slug} title={title} subtitle={subtitle} />
      </main>
    </>
  );
}
