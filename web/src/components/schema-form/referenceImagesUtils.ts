import type { ReactNode } from 'react';

export type RefRow = Record<string, unknown>;

export type ReferenceImagesFieldProps = {
  fieldName: string;
  fieldDef: Record<string, unknown>;
  title: ReactNode;
  help: ReactNode;
  rows: RefRow[];
  onChange: (next: RefRow[]) => void;
  formTaskId?: string;
  embedded?: boolean;
  acceptVideos?: boolean;
  enableKnowledgeFolder?: boolean;
  maxImageItems?: number;
  maxVideoItems?: number;
  /** 免费图库打开时预填的检索词 */
  stockSearchDefault?: string;
};

/** 从表单字段值推断图库默认检索词 */
export function deriveFormStockSearchDefault(formValue: Record<string, unknown>): string {
  const direct = formValue.mxmStockSearchQuery ?? formValue.stockSearchQuery;
  if (typeof direct === 'string' && direct.trim()) return direct.trim().slice(0, 200);

  const topic = formValue.topic ?? formValue.title ?? formValue.subject;
  if (typeof topic === 'string' && topic.trim()) return topic.trim().slice(0, 200);

  const prompt = typeof formValue.prompt === 'string' ? formValue.prompt.trim() : '';
  if (prompt) {
    const topicFromPrompt = prompt.match(/主题[「『"']([^」』"']+)[」』"']/)?.[1]?.trim();
    if (topicFromPrompt) return topicFromPrompt.slice(0, 200);
    const segment =
      prompt.match(/本段(?:口播|内容)?[：:]\s*[「『"']([^」』"']+)[」』"']/)?.[1]?.trim() ??
      prompt.match(/本段内容[：:]\s*[「『"']([^」』"']+)[」』"']/)?.[1]?.trim();
    if (segment) return segment.slice(0, 200);
    if (prompt.length <= 120) return prompt.slice(0, 200);
    return prompt.slice(0, 120);
  }

  const description = formValue.description;
  if (typeof description === 'string' && description.trim()) return description.trim().slice(0, 120);

  return '';
}

export function countMediaRows(rows: RefRow[], kind: 'image' | 'video'): number {
  return rows.filter(
    (r) =>
      typeof r.content === 'string' &&
      r.content.trim() &&
      rowMediaKind(r) === kind
  ).length;
}

export function rowMediaKind(row: RefRow): 'image' | 'video' {
  return row.mediaKind === 'video' ? 'video' : 'image';
}
