'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Download, Share, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { cn } from '@/lib/cn';

const HIDE_ON_PATHS = new Set(['/login', '/offline']);

/** 底部 TabBar 上方展示「安装到主屏幕」提示 */
export function PwaInstallBanner() {
  const pathname = usePathname();
  const { canPrompt, hasNativePrompt, ios, install, dismiss } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  const allowedPath = pathname ? !HIDE_ON_PATHS.has(pathname) : true;

  useEffect(() => {
    if (!canPrompt || !allowedPath) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 1800);
    return () => window.clearTimeout(t);
  }, [canPrompt, allowedPath]);

  if (!visible) return null;

  const handleInstall = async () => {
    if (!hasNativePrompt) return;
    setInstalling(true);
    try {
      const ok = await install();
      if (ok) setVisible(false);
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3',
        'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]'
      )}
      role="region"
      aria-label="安装应用到主屏幕"
    >
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border border-border/80',
          'bg-bg-elevated/95 p-3 shadow-float backdrop-blur-md'
        )}
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
          <Image
            src="/icons/icon-192.png"
            alt=""
            fill
            className="object-cover"
            sizes="44px"
            priority
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">安装「一拍上架」到主屏幕</p>
          {ios ? (
            <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
              Safari 点底部
              <Share size={12} className="mx-0.5 inline align-text-bottom" aria-hidden />
              分享，选择「添加到主屏幕」
            </p>
          ) : hasNativePrompt ? (
            <p className="mt-0.5 text-xs text-text-muted">
              像 App 一样全屏打开，任务进度更顺手
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-text-muted">
              浏览器菜单中选择「安装应用」或「添加到主屏幕」
            </p>
          )}

          {hasNativePrompt && (
            <button
              type="button"
              disabled={installing}
              onClick={() => void handleInstall()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black pressable disabled:opacity-60"
            >
              <Download size={14} />
              {installing ? '安装中…' : '立即安装'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1.5 text-text-muted pressable hover:bg-surface-muted"
          aria-label="关闭安装提示"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
