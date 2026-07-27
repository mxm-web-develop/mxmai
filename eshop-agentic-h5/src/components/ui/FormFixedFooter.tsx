'use client';

import type { ReactNode } from 'react';

/** 表单页底部主按钮：相对视口固定，避免 sticky 在滚动容器内失效 */
export function FormFixedFooter({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        className="h-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
        <div className="pointer-events-auto w-full max-w-lg border-t border-border/70 bg-bg-elevated/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(26,22,20,0.06)] backdrop-blur-xl pb-[max(12px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  );
}
