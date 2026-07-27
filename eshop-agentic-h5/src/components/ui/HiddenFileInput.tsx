'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** 不可 display:none — iOS Safari 会阻断相册/拍摄选择与 change 事件 */
export const HiddenFileInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function HiddenFileInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        'pointer-events-none fixed left-0 top-0 h-px w-px opacity-0',
        className
      )}
    />
  );
});
