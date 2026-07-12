import type { VirtualFolderLinkItem } from '../../api/client';
import i18n from '../../i18n/config';

export function virtualFolderLinkTypeLabel(link: VirtualFolderLinkItem): string {
  if (link.ref_type === 'storage_object') {
    const ct = (link.content_type ?? '').toLowerCase();
    if (ct.startsWith('audio/')) return i18n.t('assets.virtualFolder.linkDisplay.uploadAudio');
    if (ct.startsWith('image/')) return i18n.t('assets.virtualFolder.linkDisplay.uploadImage');
    if (ct.startsWith('video/')) return i18n.t('assets.virtualFolder.linkDisplay.uploadVideo');
    return i18n.t('assets.virtualFolder.linkDisplay.uploadFile');
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
  return key ? i18n.t(`assets.virtualFolder.linkDisplay.${key}`) : i18n.t('assets.virtualFolder.linkDisplay.task');
}

export function formatVirtualFolderLinkId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

/** 短码用于卡片后缀，避免暴露完整 UUID */
function shortId(id: string): string {
  return id.length >= 8 ? id.slice(0, 8) : id;
}

/**
 * 卡片标题派生（不展示 prompt / 原始 name 等可能含角色指令的内容）：
 * 1. 音色资产：metadata.label → voice_id → 业务名 + 短码
 * 2. storage_object：业务名（音频/图片/视频/文件）+ 原文件名（如有）
 * 3. task：业务名 + 短码；写作/音频的 metadata.label 优先
 */
export function resolveLinkDisplayTitle(link: VirtualFolderLinkItem): string {
  const id = link.task_id ?? link.object_id ?? link.id;
  const taskShort = `#${shortId(id)}`;

  if (link.broken) {
    return `${i18n.t('assets.virtualFolder.linkDisplay.task')} ${taskShort}`;
  }

  if (link.ref_type === 'storage_object') {
    const meta = (link.metadata ?? {}) as Record<string, unknown>;
    if (meta.asset_type === 'minimax_voice') {
      const label =
        typeof meta.label === 'string' && meta.label.trim()
          ? meta.label.trim()
          : typeof meta.voice_id === 'string' && meta.voice_id.trim()
            ? meta.voice_id.trim()
            : '';
      const kind = i18n.t('assets.virtualFolder.linkDisplay.uploadAudio');
      return label ? `${kind} · ${label}` : `${kind} ${taskShort}`;
    }
    return link.name?.trim() ? `${virtualFolderLinkTypeLabel(link)} · ${link.name.trim()}` : `${virtualFolderLinkTypeLabel(link)} ${taskShort}`;
  }

  const meta = (link.metadata ?? {}) as Record<string, unknown>;
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
  if (metaLabel) return metaLabel;
  if (subtypeLabel) return subtypeLabel;
  if (taskLabel && subtypeLabel) return `${taskLabel} · ${subtypeLabel}`;
  if (taskLabel) return taskLabel;
  const kindLabel = virtualFolderLinkTypeLabel(link);
  return `${kindLabel} ${taskShort}`;
}
