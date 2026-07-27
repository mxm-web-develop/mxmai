'use client';

import { Suspense } from 'react';
import JobDetailRedirectClient from './JobDetailRedirectClient';

export default function JobDetailPage() {
  return (
    <Suspense fallback={<main className="p-4 text-text-muted">加载中…</main>}>
      <JobDetailRedirectClient />
    </Suspense>
  );
}
