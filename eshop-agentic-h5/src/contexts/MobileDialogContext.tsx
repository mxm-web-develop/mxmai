'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export type MobileConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type MobileAlertOptions = {
  title?: string;
  message: string;
  buttonLabel?: string;
};

type DialogRequest =
  | ({ kind: 'confirm' } & MobileConfirmOptions)
  | ({ kind: 'alert' } & MobileAlertOptions);

type MobileDialogContextValue = {
  confirm: (options: MobileConfirmOptions) => Promise<boolean>;
  alert: (options: MobileAlertOptions) => Promise<void>;
};

const MobileDialogContext = createContext<MobileDialogContextValue | null>(null);

export function useMobileDialog(): MobileDialogContextValue {
  const ctx = useContext(MobileDialogContext);
  if (!ctx) {
    throw new Error('useMobileDialog 须在 MobileDialogProvider 内使用');
  }
  return ctx;
}

export function MobileDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      const t = setTimeout(() => setVisible(false), 220);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const finish = useCallback((confirmed: boolean) => {
    setOpen(false);
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options: MobileConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest({ kind: 'confirm', ...options });
      setOpen(true);
    });
  }, []);

  const alert = useCallback((options: MobileAlertOptions) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = (ok) => {
        if (ok) resolve();
      };
      setRequest({ kind: 'alert', ...options });
      setOpen(true);
    });
  }, []);

  if (!visible && !open) {
    return (
      <MobileDialogContext.Provider value={{ confirm, alert }}>
        {children}
      </MobileDialogContext.Provider>
    );
  }

  const isConfirm = request?.kind === 'confirm';
  const title = request?.title;
  const message = request?.message ?? '';
  const confirmLabel =
    request?.kind === 'confirm' ? (request.confirmLabel ?? '确定') : '好';
  const cancelLabel = request?.kind === 'confirm' ? (request.cancelLabel ?? '取消') : '';
  const destructive = request?.kind === 'confirm' && request.destructive !== false;

  return (
    <MobileDialogContext.Provider value={{ confirm, alert }}>
      {children}
      <div
        className="fixed inset-0 z-[100] flex flex-col justify-end px-3 pb-3 safe-bottom"
        role="presentation"
      >
        <button
          type="button"
          aria-label="关闭"
          className={cn(
            'absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => finish(false)}
        />
        <div
          className={cn(
            'relative mx-auto w-full max-w-md transition-transform duration-300 ease-out',
            open ? 'translate-y-0' : 'translate-y-8 opacity-0'
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-dialog-message"
          onClick={(e) => e.stopPropagation()}
        >
          {isConfirm ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-2xl bg-surface/95 text-center shadow-[var(--shadow-float)] backdrop-blur-xl">
                {(title || message) && (
                  <div className="border-b border-border/60 px-5 py-4">
                    {title && (
                      <p className="text-[13px] font-semibold text-text-secondary">{title}</p>
                    )}
                    <p
                      id="mobile-dialog-message"
                      className={cn(
                        'text-[15px] leading-relaxed text-text',
                        title ? 'mt-1.5' : ''
                      )}
                    >
                      {message.split('\n').map((line, i) => (
                        <span key={i} className="block">
                          {line}
                        </span>
                      ))}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className={cn(
                    'w-full py-3.5 text-[17px] font-semibold pressable',
                    destructive ? 'text-danger' : 'text-accent'
                  )}
                  onClick={() => finish(true)}
                >
                  {confirmLabel}
                </button>
              </div>
              <button
                type="button"
                className="w-full rounded-2xl bg-surface py-3.5 text-[17px] font-semibold text-accent shadow-[var(--shadow-float)] pressable"
                onClick={() => finish(false)}
              >
                {cancelLabel}
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-surface/95 text-center shadow-[var(--shadow-float)] backdrop-blur-xl">
              <div className="border-b border-border/60 px-5 py-4">
                <p className="text-[13px] font-semibold text-text">
                  {title ?? '提示'}
                </p>
                <p
                  id="mobile-dialog-message"
                  className="mt-2 text-[15px] leading-relaxed text-text-secondary"
                >
                  {message}
                </p>
              </div>
              <button
                type="button"
                className="w-full py-3.5 text-[17px] font-semibold text-accent pressable"
                onClick={() => finish(true)}
              >
                {confirmLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </MobileDialogContext.Provider>
  );
}
