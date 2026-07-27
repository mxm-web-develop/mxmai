import { Suspense } from 'react';
import ProjectDetailDynamic from './ProjectDetailDynamic';

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<main className="p-4 text-text-muted">加载中…</main>}>
      <ProjectDetailDynamic />
    </Suspense>
  );
}
