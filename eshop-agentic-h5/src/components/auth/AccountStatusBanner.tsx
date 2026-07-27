'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { getStoredPhoneMasked } from '@/lib/partner-session';
import { getApiMode } from '@/lib/runtime-config';

/** 首页账户状态：已短信登录时展示手机号 */
export function AccountStatusBanner() {
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);

  useEffect(() => {
    setPhoneMasked(getStoredPhoneMasked());
  }, []);

  if (getApiMode() !== 'http' || !phoneMasked) return null;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 text-sm text-text-secondary">
      <User size={18} className="shrink-0 text-accent" />
      <span className="flex-1">已登录 {phoneMasked}</span>
      <Link href="/settings" className="text-xs font-semibold text-accent">
        账户
      </Link>
    </div>
  );
}
