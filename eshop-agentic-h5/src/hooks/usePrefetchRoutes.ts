'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Warm route chunks before the user taps — cuts perceived navigation delay. */
export function usePrefetchRoutes(hrefs: readonly string[]) {
  const router = useRouter();
  const key = hrefs.join('\0');

  useEffect(() => {
    const unique = [...new Set(hrefs.filter(Boolean))];
    for (const href of unique) {
      router.prefetch(href);
    }
  }, [router, key, hrefs]);
}
