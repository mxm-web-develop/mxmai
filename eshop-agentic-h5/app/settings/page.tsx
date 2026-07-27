'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { PressableButton } from '@/components/ui/PressableButton';
import { resetOpenApiAdapter } from '@/adapters';
import {
  clearPartnerSession,
  getStoredPhoneMasked,
  isSmsLoggedIn,
  logoutPartnerSession,
} from '@/lib/partner-session';
import { useMobileDialog } from '@/contexts/MobileDialogContext';
import { cn } from '@/lib/cn';

const PRODUCTION_HTTP =
  process.env.NEXT_PUBLIC_API_MODE === 'http' && process.env.NODE_ENV === 'production';

export default function SettingsPage() {
  const router = useRouter();
  const { confirm } = useMobileDialog();
  const [apiMode, setApiMode] = useState<'mock' | 'http'>('mock');
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const mode = localStorage.getItem('eshop_api_mode');
    if (mode === 'http' || mode === 'mock') setApiMode(mode);
    else if (PRODUCTION_HTTP) setApiMode('http');
    setPhoneMasked(getStoredPhoneMasked());
  }, []);

  const handleSave = () => {
    localStorage.setItem('eshop_api_mode', apiMode);
    localStorage.removeItem('eshop_api_base');
    resetOpenApiAdapter();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    const ok = await confirm({
      message: '退出后需重新手机号登录；云端项目仍保留在您的账户下。',
      confirmLabel: '退出',
      cancelLabel: '取消',
    });
    if (!ok) return;
    await logoutPartnerSession();
    resetOpenApiAdapter();
    setPhoneMasked(null);
    router.replace('/login');
  };

  const handleClearCache = async () => {
    const ok = await confirm({
      message: '清除本机已下载的成片与项目缓存？\n登录状态会保留。',
      confirmLabel: '清除',
      cancelLabel: '取消',
      destructive: true,
    });
    if (!ok) return;
    const keep = {
      mode: localStorage.getItem('eshop_api_mode'),
      device: localStorage.getItem('eshop_device_id'),
      phone: localStorage.getItem('eshop_partner_phone_masked'),
      method: localStorage.getItem('eshop_partner_login_method'),
      session: localStorage.getItem('eshop_partner_session'),
      sessionExp: localStorage.getItem('eshop_partner_session_exp'),
      endUser: localStorage.getItem('eshop_partner_end_user_id'),
    };
    localStorage.clear();
    if (keep.mode) localStorage.setItem('eshop_api_mode', keep.mode);
    if (keep.device) localStorage.setItem('eshop_device_id', keep.device);
    if (keep.phone) localStorage.setItem('eshop_partner_phone_masked', keep.phone);
    if (keep.method) localStorage.setItem('eshop_partner_login_method', keep.method);
    if (keep.session) localStorage.setItem('eshop_partner_session', keep.session);
    if (keep.sessionExp) localStorage.setItem('eshop_partner_session_exp', keep.sessionExp);
    if (keep.endUser) localStorage.setItem('eshop_partner_end_user_id', keep.endUser);
    void indexedDB.deleteDatabase('eshop-agentic-h5');
  };

  const loggedIn = isSmsLoggedIn();

  return (
    <>
      <PageHeader title="设置" subtitle="账户与本地缓存" backHref="/" />
      <main className="space-y-4 px-4 py-4 pb-8">
        {!PRODUCTION_HTTP && (
          <section className="card space-y-4 p-5">
            <p className="section-label">连接模式</p>
            <div className="flex gap-2">
              {(['mock', 'http'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setApiMode(m)}
                  className={cn(
                    'flex-1 rounded-2xl py-3 text-sm font-semibold pressable',
                    apiMode === m
                      ? 'bg-accent text-white shadow-sm'
                      : 'border border-border bg-surface-muted/30 text-text-secondary'
                  )}
                >
                  {m === 'mock' ? '演示模式' : '正式环境'}
                </button>
              ))}
            </div>
          </section>
        )}

        {(apiMode === 'http' || PRODUCTION_HTTP) && (
          <section className="card space-y-3 p-5">
            <p className="section-label">账户</p>
            {loggedIn && phoneMasked ? (
              <>
                <p className="text-sm text-text-secondary">已登录：{phoneMasked}</p>
                <Link
                  href="/my-uploads"
                  className="block w-full rounded-2xl border border-border bg-surface-muted/30 py-3 text-center text-sm font-semibold text-text-primary pressable"
                >
                  我的上传
                </Link>
                <PressableButton type="button" onClick={() => void handleLogout()} className="btn-secondary w-full">
                  退出登录
                </PressableButton>
              </>
            ) : (
              <PressableButton
                type="button"
                onClick={() => router.push('/login')}
                className="btn-primary w-full"
              >
                手机号登录
              </PressableButton>
            )}
          </section>
        )}

        <section className="card p-5">
          <PressableButton type="button" onClick={handleClearCache} className="btn-secondary w-full">
            清除本地缓存
          </PressableButton>
        </section>

        {!PRODUCTION_HTTP && (
          <PressableButton type="button" onClick={handleSave} className="btn-primary w-full">
            {saved ? '已保存 ✓' : '保存连接模式'}
          </PressableButton>
        )}
      </main>
    </>
  );
}
