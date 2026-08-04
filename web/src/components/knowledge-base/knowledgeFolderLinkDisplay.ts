import type { KnowledgeFolderLinkItem } from '../../api/client';
import i18n from '../../i18n/config';
import { decodePossiblyMojibakeFilename } from '../../lib/filenameEncoding';
import { extractMarkdownHeadline } from '../task-list/taskPreviewText';
import {
  isWritingManuscriptLink,
  WRITING_MANUSCRIPT_ASSET_TYPE,
} from './knowledgeFolderLinkModel';

export function knowledgeFolderLinkTypeLabel(link: KnowledgeFolderLinkItem): string {
  if (isWritingManuscriptLink(link)) {
    return i18n.t('assets.knowledgeBase.linkDisplay.writing');
  }
  if (link.ref_type === 'storage_object') {
    const ct = (link.content_type ?? '').toLowerCase();
    if (ct.startsWith('audio/')) return i18n.t('assets.knowledgeBase.linkDisplay.uploadAudio');
    if (ct.startsWith('image/')) return i18n.t('assets.knowledgeBase.linkDisplay.uploadImage');
    if (ct.startsWith('video/')) return i18n.t('assets.knowledgeBase.linkDisplay.uploadVideo');
    return i18n.t('assets.knowledgeBase.linkDisplay.uploadFile');
  }
  const map: Record<string, string> = {
    audio: 'audio',
    music: 'music',
    video: 'video',
    graph: 'graph',
    image: 'image',
    writing: 'writing',
    text: 'text',
  };
  const key = map[link.task_type ?? ''];
  return key ? i18n.t(`assets.knowledgeBase.linkDisplay.${key}`) : i18n.t('assets.knowledgeBase.linkDisplay.task');
}

export function formatKnowledgeFolderLinkId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

/** 短码用于卡片后缀，避免暴露完整 UUID */
function shortId(id: string): string {
  return id.length >= 8 ? id.slice(0, 8) : id;
}

function stripManuscriptFilename(name: string): string {
  return decodePossiblyMojibakeFilename(name)
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 业务大类名 alone 不能当任务标题（与列表刊头不对齐） */
function isGenericScopeTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return (
    t === '写作' ||
    t === 'writing' ||
    t === '文本' ||
    t === 'text' ||
    t === '任务' ||
    t === 'task'
  );
}

/** 「写作 #abc」这类兜底名 */
function isFallbackScopeShortIdTitle(title: string): boolean {
  return /^(写作|writing|文本|text|任务|task)\s*#[0-9a-f]{4,}\s*$/i.test(title.trim());
}

/**
 * 卡片标题派生（与「我的创作」列表对齐；不展示 prompt）：
 * 1. 音色资产：metadata.label → voice_id
 * 2. 文集单篇（storage writing_manuscript）：label / 去后缀文件名 —— 单独引入路径，保持人话篇名
 * 3. 写作任务：label → contentPreview 刊头 → link.name（后端已对齐）→ subtypeLabel
 * 4. 其它 task：label → subtype → 业务名+#短码
 */
export function resolveLinkDisplayTitle(link: KnowledgeFolderLinkItem): string {
  const id = link.task_id ?? link.object_id ?? link.id;
  const taskShort = `#${shortId(id)}`;

  if (link.broken) {
    return `${i18n.t('assets.knowledgeBase.linkDisplay.task')} ${taskShort}`;
  }

  const meta = (link.metadata ?? {}) as Record<string, unknown>;

  // 文集单篇等 Markdown 上传：用人话标题，不要「上传档案 ·」
  if (link.ref_type === 'storage_object' && isWritingManuscriptLink(link)) {
    const metaLabel =
      typeof meta.label === 'string' && meta.label.trim() ? meta.label.trim() : '';
    if (metaLabel) return metaLabel;
    if (link.name?.trim()) {
      const cleaned = stripManuscriptFilename(link.name.trim());
      if (cleaned) return cleaned;
    }
    const subtypeLabel =
      typeof meta.subtypeLabel === 'string' && meta.subtypeLabel.trim()
        ? meta.subtypeLabel.trim()
        : '';
    if (subtypeLabel) return subtypeLabel;
    return `${knowledgeFolderLinkTypeLabel(link)} ${taskShort}`;
  }

  if (link.ref_type === 'storage_object') {
    if (meta.asset_type === 'minimax_voice') {
      const label =
        typeof meta.label === 'string' && meta.label.trim()
          ? meta.label.trim()
          : typeof meta.voice_id === 'string' && meta.voice_id.trim()
            ? meta.voice_id.trim()
            : '';
      const kind = i18n.t('assets.knowledgeBase.linkDisplay.uploadAudio');
      return label ? `${kind} · ${label}` : `${kind} ${taskShort}`;
    }
    return link.name?.trim()
      ? `${knowledgeFolderLinkTypeLabel(link)} · ${decodePossiblyMojibakeFilename(link.name.trim())}`
      : `${knowledgeFolderLinkTypeLabel(link)} ${taskShort}`;
  }

  const metaLabel =
    typeof meta.label === 'string' && meta.label.trim() ? meta.label.trim() : '';
  const taskLabel =
    typeof meta.taskLabel === 'string' && meta.taskLabel.trim() ? meta.taskLabel.trim() : '';
  const subtypeLabel =
    typeof meta.subtypeLabel === 'string' && meta.subtypeLabel.trim()
      ? meta.subtypeLabel.trim()
      : '';
  const contentPreview =
    typeof meta.contentPreview === 'string' && meta.contentPreview.trim()
      ? meta.contentPreview.trim()
      : '';
  const contentHeadline = contentPreview ? extractMarkdownHeadline(contentPreview, 56) : '';
  const linkName = link.name?.trim() || '';
  const isWritingTask = link.task_type === 'writing' || link.task_type === 'text';

  // 与写作列表：label → 正文刊头 → 后端派生 name → 子类名
  if (metaLabel) return metaLabel;
  if (isWritingTask && contentHeadline) return contentHeadline;
  if (
    linkName &&
    !isGenericScopeTitle(linkName) &&
    !isFallbackScopeShortIdTitle(linkName)
  ) {
    return linkName;
  }
  if (subtypeLabel) return subtypeLabel;
  if (taskLabel && subtypeLabel) return `${taskLabel} · ${subtypeLabel}`;
  // 单独「写作」不够当标题
  if (taskLabel && !isGenericScopeTitle(taskLabel)) return taskLabel;
  if (contentHeadline) return contentHeadline;
  const kindLabel = knowledgeFolderLinkTypeLabel(link);
  return `${kindLabel} ${taskShort}`;
}

export { WRITING_MANUSCRIPT_ASSET_TYPE };
