'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { CreativeBusinessPicker } from '@/components/studio/CreativeBusinessPicker';

export default function StartPage() {
  return (
    <>
      <PageHeader title="创作" subtitle="选择要生成的业务" backHref="/" />
      <main className="px-4 py-2 pb-4">
        <CreativeBusinessPicker />
      </main>
    </>
  );
}
