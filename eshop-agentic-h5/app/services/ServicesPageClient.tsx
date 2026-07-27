'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { StaggerReveal } from '@/components/motion/StaggerReveal';
import { ServiceCardSkeleton } from '@/components/motion/Skeleton';
import { CategoryChips } from '@/components/services/CategoryChips';
import { ServiceCard } from '@/components/services/ServiceCard';
import { useServiceCatalog } from '@/hooks/useServiceCatalog';
import type { ServiceCategory } from '@/adapters/types';

export default function ServicesPageClient() {
  const { services, loading } = useServiceCatalog();
  const searchParams = useSearchParams();
  const initialCategory = (searchParams.get('category') as ServiceCategory | null) ?? 'all';
  const [category, setCategory] = useState<ServiceCategory | 'all'>(initialCategory);

  const filtered = useMemo(() => {
    if (category === 'all') return services;
    return services.filter((s) => s.category === category);
  }, [services, category]);

  return (
    <>
      <PageHeader title="创作服务" subtitle="选择电商广告能力" />
      <main className="space-y-4 px-4 py-4">
        <CategoryChips value={category} onChange={setCategory} />
        <div className="space-y-3">
          {loading && !services.length ? (
            <div className="space-y-3" aria-busy="true" aria-label="加载服务">
              <ServiceCardSkeleton />
              <ServiceCardSkeleton />
              <ServiceCardSkeleton />
            </div>
          ) : filtered.length ? (
            <StaggerReveal key={category} className="space-y-3" childSelector="> *">
              {filtered.map((s) => (
                <ServiceCard key={s.slug} service={s} />
              ))}
            </StaggerReveal>
          ) : (
            <p className="py-8 text-center text-sm text-text-secondary">该分类暂无服务</p>
          )}
        </div>
      </main>
    </>
  );
}
