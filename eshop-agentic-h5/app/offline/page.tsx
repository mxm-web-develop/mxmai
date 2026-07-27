import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';

export default function OfflinePage() {
  return (
    <>
      <PageHeader title="离线" />
      <main className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-lg font-medium">当前无网络连接</p>
        <p className="mt-2 text-sm text-text-muted">请检查网络后重试</p>
        <Link
          href="/"
          className="mt-6 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-black pressable"
        >
          返回首页
        </Link>
      </main>
    </>
  );
}
