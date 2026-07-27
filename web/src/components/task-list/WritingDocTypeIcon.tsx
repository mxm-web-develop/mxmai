import { Braces, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';
import type { WritingTaskItem } from '../../api/client';
import {
  resolveWritingDocFormat,
  WRITING_DOC_FORMAT_LABEL,
  type WritingDocFormat,
} from './writingDocFormat';

type WritingDocTypeIconProps = {
  task: WritingTaskItem;
  /** 显式指定格式，否则从 task 推断 */
  format?: WritingDocFormat;
  size?: 'sm' | 'md';
};

const FORMAT_META: Record<
  WritingDocFormat,
  { Icon: LucideIcon; ext: string; usePdfGlyph?: boolean }
> = {
  pdf: { Icon: FileText, ext: 'PDF', usePdfGlyph: true },
  markdown: { Icon: FileText, ext: 'MD' },
  json: { Icon: Braces, ext: 'JSON' },
  txt: { Icon: FileText, ext: 'TXT' },
  csv: { Icon: FileSpreadsheet, ext: 'CSV' },
};

function PdfSheetIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path
        d="M8 13h8M8 17h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function WritingDocTypeIcon({ task, format, size = 'md' }: WritingDocTypeIconProps) {
  const resolved = format ?? resolveWritingDocFormat(task);
  const meta = FORMAT_META[resolved];
  const label = WRITING_DOC_FORMAT_LABEL[resolved];
  const iconSize = size === 'sm' ? 22 : 28;

  return (
    <div
      className={`writing-doc-icon writing-doc-icon--${resolved} writing-doc-icon--${size}`}
      title={label}
      aria-label={`${label} 文档`}
    >
      <div className="writing-doc-icon__sheet">
        {meta.usePdfGlyph ? (
          <PdfSheetIcon size={iconSize} />
        ) : (
          <meta.Icon size={iconSize} strokeWidth={1.75} aria-hidden />
        )}
      </div>
      <span className="writing-doc-icon__badge">{meta.ext}</span>
    </div>
  );
}
