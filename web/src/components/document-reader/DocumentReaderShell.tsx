import type { ReactNode } from 'react';
import clsx from 'clsx';
import './DocumentReader.css';

export type DocumentReaderVariant = 'full' | 'compact' | 'immersive';

interface DocumentReaderShellProps {
  variant?: DocumentReaderVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function DocumentReaderShell({
  variant = 'full',
  title,
  children,
  className,
}: DocumentReaderShellProps) {
  return (
    <div className={clsx('doc-reader', `doc-reader--${variant}`, className)}>
      {title ? <div className="doc-reader-header">{title}</div> : null}
      <div className="doc-reader-body">{children}</div>
    </div>
  );
}
