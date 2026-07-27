'use client';

import Link, { useLinkStatus, type LinkProps } from 'next/link';
import { Loader2 } from 'lucide-react';
import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { usePressFeedback } from '@/lib/motion/use-press-feedback';

function NavLinkPending({ subtle }: { subtle?: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  if (subtle) {
    return (
      <span
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-black/[0.04]"
        aria-hidden
      />
    );
  }

  return (
    <span
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-black/[0.06] backdrop-blur-[1px]"
      aria-hidden
    >
      <Loader2 size={18} className="animate-spin text-accent" strokeWidth={2.5} />
    </span>
  );
}

export type NavLinkProps = LinkProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof LinkProps> & {
    pressScale?: number;
    /** Smaller pending overlay — for tab bar / compact targets */
    pendingSubtle?: boolean;
    children?: ReactNode;
  };

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { className, children, pressScale, pendingSubtle, prefetch = true, ...props },
  forwardedRef
) {
  const innerRef = useRef<HTMLAnchorElement>(null);
  usePressFeedback(innerRef, { scale: pressScale });

  const setRef = (node: HTMLAnchorElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  return (
    <Link
      ref={setRef}
      prefetch={prefetch}
      className={cn('pressable relative', className)}
      {...props}
    >
      {children}
      <NavLinkPending subtle={pendingSubtle} />
    </Link>
  );
});
