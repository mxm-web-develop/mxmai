'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isSmsLoggedIn, clearPartnerSession } from '@/lib/partner-session';
import { getApiMode } from '@/lib/runtime-config';

const PUBLIC_PATHS = new Set(['/login', '/offline']);

/** HTTP 模式下未短信登录则跳转 /login */
export function RequireSmsLogin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (getApiMode() !== 'http') return;
    if (PUBLIC_PATHS.has(pathname)) return;

    if (!isSmsLoggedIn()) {
      clearPartnerSession();
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [pathname, router]);

  if (getApiMode() === 'http' && !PUBLIC_PATHS.has(pathname) && !isSmsLoggedIn()) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6 text-sm text-text-secondary">
        正在跳转登录…
      </div>
    );
  }

  return <>{children}</>;
}
