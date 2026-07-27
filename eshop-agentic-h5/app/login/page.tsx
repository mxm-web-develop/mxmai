'use client';

import { Suspense } from 'react';
import LoginPageInner from './LoginPageInner';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-12 text-center text-sm text-text-secondary">加载中…</main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
