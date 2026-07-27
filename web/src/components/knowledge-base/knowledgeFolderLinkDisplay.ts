import type { KnowledgeFolderLinkItem } from '../../api/client';
import i18n from '../../i18n/config';
import { decodePossiblyMojibakeFilename } from '../../lib/filenameEncoding';
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

/**
 * 卡片标题派生（不展示 prompt / 原始 name 等可能含角色指令的内容）：
 * 1. 音色资产：metadata.label → voice_id → 业务名 + 短码
 * 2. 写作文稿（任务或文集单篇上传）：label / 去后缀文件名
 * 3. storage_object：业务名（音频/图片/视频/文件）+ 原文件名（如有）
 * 4. task：业务名 + 短码；写作/音频的 metadata.label 优先
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

  // 显示策略（与「我的创作」列表保持一致字段）：
  // 1. 用户填的标题（meta.label）
  // 2. 业务子类标签（subtypeLabel）：能精确匹配列表卡片上的「类型 · 子类型」
  // 3. 业务大类 + 子类（taskLabel · subtypeLabel）
  // 4. 兜底：业务大类 + 短码
  // 注意：写作任务的 name 常为 prompt，禁止当标题
  if (metaLabel) return metaLabel;
  if (subtypeLabel) return subtypeLabel;
  if (taskLabel && subtypeLabel) return `${taskLabel} · ${subtypeLabel}`;
  if (taskLabel) return taskLabel;
  const kindLabel = knowledgeFolderLinkTypeLabel(link);
  return `${kindLabel} ${taskShort}`;
}

export { WRITING_MANUSCRIPT_ASSET_TYPE };
