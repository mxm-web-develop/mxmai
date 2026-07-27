'use client';

import { Loader2 } from 'lucide-react';
import { forwardRef, useRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { usePressFeedback } from '@/lib/motion/use-press-feedback';

export type PressableButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pressScale?: number;
  loading?: boolean;
};

export const PressableButton = forwardRef<HTMLButtonElement, PressableButtonProps>(
  function PressableButton(
    { className, children, pressScale, loading, disabled, ...props },
    forwardedRef
  ) {
    const innerRef = useRef<HTMLButtonElement>(null);
    const isDisabled = disabled || loading;
    usePressFeedback(innerRef, { scale: pressScale, disabled: isDisabled });

    const setRef = (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    return (
      <button
        ref={setRef}
        type="button"
        disabled={isDisabled}
        className={cn('pressable relative', className)}
        {...props}
      >
        {children}
        {loading && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/[0.06]">
            <Loader2 size={18} className="animate-spin text-accent" strokeWidth={2.5} />
          </span>
        )}
      </button>
    );
  }
);
