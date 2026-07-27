export type MediaSourceOrigin = 'upload' | 'asset' | 'knowledge-folder' | 'stock';

export type MediaListRow = Record<string, unknown> & {
  content?: string;
  purpose?: string;
  mediaKind?: 'image' | 'video';
  type?: string;
  groupKey?: string;
  __source?: MediaSourceOrigin;
  __sourceLabel?: string;
  __uploading?: boolean;
  __localPreview?: string;
};

export type MediaPickPayload = {
  content: string;
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  source: MediaSourceOrigin;
  sourceLabel?: string;
  purpose?: string;
  /** 文档选取时已解析的正文（与 content 相同或并行） */
  textContent?: string;
  /** 知识库音频/任务软链关联的 task_id */
  sourceTaskId?: string;
};

export type MediaSourcePickerTab = 'upload' | 'library' | 'knowledge' | 'stock';

export function rowMediaKind(row: MediaListRow): 'image' | 'video' {
  return row.mediaKind === 'video' ? 'video' : 'image';
}

export function rowHasContent(row: MediaListRow): boolean {
  return typeof row.content === 'string' && row.content.trim().length > 0;
}
