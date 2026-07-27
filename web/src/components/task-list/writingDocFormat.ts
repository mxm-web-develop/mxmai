import type { WritingTaskItem } from '../../api/client';

export type WritingDocFormat = 'pdf' | 'markdown' | 'json' | 'txt' | 'csv';

const KNOWN: WritingDocFormat[] = ['pdf', 'markdown', 'json', 'txt', 'csv'];

function normalizeFormat(raw: unknown): WritingDocFormat | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'md') return 'markdown';
  if (KNOWN.includes(s as WritingDocFormat)) return s as WritingDocFormat;
  return null;
}

function pickFromParams(params: Record<string, unknown> | undefined): WritingDocFormat | null {
  if (!params) return null;
  return (
    normalizeFormat(params.storage_form) ??
    normalizeFormat(params.format) ??
    normalizeFormat(params.output_format) ??
    null
  );
}

/** 从列表行推断文档格式（不请求详情 API） */
export function resolveWritingDocFormat(task: WritingTaskItem): WritingDocFormat {
  const result = task.result as
    | {
        outputFormat?: string;
        format?: string;
        hasMedia?: boolean;
        metadata?: { format?: string; storage_form?: string; storageForm?: string };
      }
    | undefined;

  const fromResult =
    normalizeFormat(result?.outputFormat) ??
    normalizeFormat(result?.format) ??
    normalizeFormat(result?.metadata?.format) ??
    normalizeFormat(result?.metadata?.storage_form) ??
    normalizeFormat(result?.metadata?.storageForm);
  if (fromResult) return fromResult;

  const rp = task.requestParams as Record<string, unknown> | undefined;
  const inner = rp?.params as Record<string, unknown> | undefined;
  const nestedInner =
    inner?.params && typeof inner.params === 'object'
      ? (inner.params as Record<string, unknown>)
      : undefined;
  const fromParams =
    pickFromParams(inner) ??
    pickFromParams(nestedInner) ??
    pickFromParams(rp) ??
    pickFromParams(task.metadata as Record<string, unknown> | undefined);
  if (fromParams) return fromParams;

  const meta = task.metadata;
  const fromMeta =
    normalizeFormat(meta?.listOutputFormat) ??
    normalizeFormat(meta?.format) ??
    normalizeFormat(meta?.storage_form) ??
    normalizeFormat(meta?.storageForm);
  if (fromMeta) return fromMeta;

  const writingType = String(
    meta?.writing_type ?? inner?.writing_type ?? rp?.writing_type ?? ''
  ).toLowerCase();
  if (writingType === 'outline') return 'json';

  return 'markdown';
}

export const WRITING_DOC_FORMAT_LABEL: Record<WritingDocFormat, string> = {
  pdf: 'PDF',
  markdown: 'Markdown',
  json: 'JSON',
  txt: 'TXT',
  csv: 'CSV',
};
