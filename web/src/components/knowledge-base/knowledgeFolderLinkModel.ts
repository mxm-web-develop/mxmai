import {
  normalizeUploadedMediaUrl,
  type KnowledgeFolderLinkItem,
  type WritingTaskItem,
} from '../../api/client';

export type KnowledgeFolderLinkCardKind = 'audio' | 'music' | 'graph' | 'video' | 'writing' | 'upload';

/** 文集单篇移入知识库时写入 storage_objects.metadata */
export const WRITING_MANUSCRIPT_ASSET_TYPE = 'writing_manuscript';

function linkMeta(link: KnowledgeFolderLinkItem): Record<string, unknown> {
  return (link.metadata ?? {}) as Record<string, unknown>;
}

/** 写作任务，或 Markdown/纯文本上传（含文集单篇）→ 走 WritingTaskCard */
export function isWritingManuscriptLink(link: KnowledgeFolderLinkItem): boolean {
  if (link.ref_type === 'task') {
    const t = link.task_type ?? '';
    return t === 'writing' || t === 'text';
  }
  if (link.ref_type !== 'storage_object') return false;
  const meta = linkMeta(link);
  if (meta.asset_type === WRITING_MANUSCRIPT_ASSET_TYPE) return true;
  const ct = (link.content_type ?? '').toLowerCase();
  if (
    ct.includes('markdown') ||
    ct.startsWith('text/plain') ||
    ct.startsWith('text/markdown') ||
    ct === 'text/x-markdown'
  ) {
    return true;
  }
  // 文件名可能含空格/不可见字符；也兼容「标题.md」被截断后仍带 .md
  const name = (link.name ?? '').trim().toLowerCase();
  if (/\.(md|markdown|txt)$/.test(name)) return true;
  return name.includes('.md') || name.endsWith('.markdown') || name.endsWith('.txt');
}

export function resolveKnowledgeFolderLinkCardKind(link: KnowledgeFolderLinkItem): KnowledgeFolderLinkCardKind {
  if (isWritingManuscriptLink(link)) return 'writing';
  if (link.ref_type === 'storage_object') return 'upload';
  const t = link.task_type ?? '';
  if (t === 'music') return 'music';
  if (t === 'audio') return 'audio';
  if (t === 'video') return 'video';
  if (t === 'graph' || t === 'image') return 'graph';
  if (t === 'writing' || t === 'text') return 'writing';
  return 'writing';
}

function stripManuscriptFilename(name: string): string {
  return name
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function knowledgeFolderLinkToTaskItem(link: KnowledgeFolderLinkItem): WritingTaskItem {
  const meta = linkMeta(link);
  const fromLabel =
    (typeof meta.label === 'string' && meta.label.trim() ? meta.label.trim() : '') ||
    (typeof meta.taskLabel === 'string' && meta.taskLabel.trim() ? meta.taskLabel.trim() : '') ||
    '';
  const fromName = link.name?.trim() ? stripManuscriptFilename(link.name.trim()) : '';
  const label = fromLabel || fromName || '';
  const contentPreview =
    typeof meta.contentPreview === 'string' && meta.contentPreview.trim()
      ? meta.contentPreview.trim()
      : typeof meta.text === 'string' && meta.text.trim()
        ? meta.text.trim()
        : label
          ? `# ${label}`
          : undefined;
  return {
    id: link.task_id ?? link.object_id ?? link.id,
    type: 'writing',
    status: 'completed',
    metadata: {
      label: label || undefined,
      taskLabel:
        typeof meta.taskLabel === 'string' && meta.taskLabel.trim()
          ? meta.taskLabel.trim()
          : undefined,
      subtypeLabel:
        typeof meta.subtypeLabel === 'string' && meta.subtypeLabel.trim()
          ? meta.subtypeLabel.trim()
          : undefined,
      ...(typeof meta.taskV2 === 'object' && meta.taskV2 ? { taskV2: meta.taskV2 } : {}),
    },
    createdAt: link.created_at,
    requestParams: {
      params: {
        text: label,
        prompt: label,
      },
    },
    ...(contentPreview
      ? { result: { contentPreview, metadata: { text: contentPreview } } }
      : {}),
  };
}

export function storageObjectPublicUrl(objectId: string): string {
  return normalizeUploadedMediaUrl(`/api/v1/media/public/object/${encodeURIComponent(objectId)}`);
}

export function knowledgeFolderLinkTaskId(link: KnowledgeFolderLinkItem): string {
  return link.task_id ?? link.object_id ?? link.id;
}
