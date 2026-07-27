'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HistoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/projects');
  }, [router]);
  return <main className="p-4 text-sm text-text-muted">正在跳转…</main>;
}
