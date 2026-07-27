'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ensureGsapConfigured, MOTION } from '@/lib/motion/gsap-config';

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  iosToolbar,
  onCancel,
  onConfirm,
  confirmLabel = '完成',
  cancelLabel = '取消',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** iOS 风格顶栏：取消 | 标题 | 完成 */
  iosToolbar?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);

  useGSAP(
    () => {
      if (!open || !sheetRef.current) return;
      ensureGsapConfigured();
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          sheetRef.current,
          { y: '100%' },
          { y: 0, duration: MOTION.slow, ease: MOTION.easeOutExpo }
        );
        if (backdropRef.current) {
          gsap.fromTo(backdropRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: MOTION.normal });
        }
      });
      return () => mm.revert();
    },
    { dependencies: [open], scope: sheetRef }
  );

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!visible && !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        ref={backdropRef}
        type="button"
        aria-label="关闭"
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity',
          open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={cn(
          'relative flex max-h-[min(85vh,640px)] w-full flex-col overflow-hidden rounded-t-[1.25rem] bg-surface shadow-[var(--shadow-float)] safe-bottom',
          !open && 'translate-y-full transition-transform duration-[var(--motion-slow)] ease-[var(--ease-out-expo)]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border-strong/80" />
        </div>

        {iosToolbar ? (
          <div className="grid shrink-0 grid-cols-[4.5rem_1fr_4.5rem] items-center border-b border-border/80 px-2 py-2">
            <button
              type="button"
              onClick={onCancel ?? onClose}
              className="py-2 text-[17px] text-text-secondary pressable"
            >
              {cancelLabel}
            </button>
            <h3 className="truncate text-center text-[15px] font-semibold text-text">{title}</h3>
            <button
              type="button"
              onClick={onConfirm ?? onClose}
              className="py-2 text-right text-[17px] font-semibold text-accent pressable"
            >
              {confirmLabel}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-medium">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="touch-target pressable flex items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>
        )}

        <div className="sheet-scroll min-h-0 flex-1 px-4 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}
