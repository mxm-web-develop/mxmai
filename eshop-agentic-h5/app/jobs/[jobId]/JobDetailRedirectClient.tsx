'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { findProjectIdByPlatformJob } from '@/lib/project/project-store';

/** 兼容旧书签 /jobs/:platformJobId?slug= */
export default function JobDetailRedirectClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = String(params.jobId);
  const slug = searchParams.get('slug') ?? '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (slug) {
        const projectId = await findProjectIdByPlatformJob(slug, jobId);
        if (projectId && !cancelled) {
          router.replace(`/projects/${projectId}`);
          return;
        }
      }
      if (!cancelled) router.replace('/projects');
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, slug, router]);

  return <main className="p-4 text-sm text-text-muted">正在跳转…</main>;
}
