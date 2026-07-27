import { useMemo } from 'react';
import type { FolderCardTag, FolderItem } from '../../api/client';

function cardTagLabel(tag?: FolderCardTag | null): string | null {
  switch (tag) {
    case 'style':
      return '视觉';
    case 'writing':
      return '语感';
    case 'character':
      return '角色';
    case 'knowledge':
      return '知识';
    default:
      return null;
  }
}

function cardStatusDot(status?: string | null): string {
  switch (status) {
    case 'ready':
      return 'asset-folder-dot--ready';
    case 'parsing':
      return 'asset-folder-dot--parsing';
    case 'stale':
      return 'asset-folder-dot--stale';
    case 'failed':
      return 'asset-folder-dot--failed';
    default:
      return '';
  }
}

type Props = {
  folders: FolderItem[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  getItemCount: (folderId: string | null) => number;
  rootLabel?: string;
};

/** 知识库平铺列表 */
export function KnowledgeFolderTreeSidebar({
  folders,
  selectedFolderId,
  onSelect,
  onDeleteFolder,
  getItemCount,
  rootLabel = '选择文件夹',
}: Props) {
  const flat = useMemo(() => {
    return [...folders].sort((a, b) => {
      const ta = a.card_tag || '';
      const tb = b.card_tag || '';
      if (ta !== tb) return ta.localeCompare(tb);
      return a.name.localeCompare(b.name, 'zh');
    });
  }, [folders]);

  return (
    <ul className="asset-folder-list asset-folder-flat">
      {flat.map((folder) => {
        const isActive = selectedFolderId === folder.id;
        const count = getItemCount(folder.id);
        const tagLabel = cardTagLabel(folder.card_tag);
        const dotClass = cardStatusDot(folder.card_status);
        return (
          <li key={folder.id}>
            <button
              type="button"
              className={`asset-folder-item asset-folder-item--flat ${isActive ? 'active' : ''}`.trim()}
              onClick={() => onSelect(folder.id)}
            >
              <span className={`asset-folder-dot ${dotClass}`.trim()} aria-hidden />
              <span className="asset-folder-name">{folder.name}</span>
              {tagLabel ? (
                <span className={`asset-folder-chip asset-folder-chip--${folder.card_tag}`}>{tagLabel}</span>
              ) : (
                <span className="asset-folder-chip asset-folder-chip--plain">普通</span>
              )}
              <span className="asset-folder-count">{count}</span>
              <span
                role="button"
                tabIndex={0}
                className="asset-folder-delete"
                title="删除文件夹"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onDeleteFolder(folder.id);
                  }
                }}
              >
                ×
              </span>
            </button>
          </li>
        );
      })}
      {flat.length === 0 ? (
        <li className="asset-folder-empty">暂无文件夹，点击「+ 新建」</li>
      ) : null}
      {!selectedFolderId && folders.length > 0 ? (
        <li className="asset-folder-empty muted">{rootLabel}</li>
      ) : null}
    </ul>
  );
}
