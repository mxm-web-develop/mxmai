'use client';

import { useCallback, useEffect, useState } from 'react';
import { getOpenApiAdapter } from '@/adapters';
import type { ServiceSummary } from '@/adapters/types';
import { listPublicServices } from '@/catalog/services';

export function useServiceCatalog() {
  const [services, setServices] = useState<ServiceSummary[]>(() => listPublicServices());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { background?: boolean }) => {
    if (!opts?.background && services.length === 0) setLoading(true);
    setError(null);
    try {
      const data = await getOpenApiAdapter().listServices();
      setServices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [services.length]);

  useEffect(() => {
    void refresh({ background: true });
  }, [refresh]);

  return { services, loading, error, refresh };
}
