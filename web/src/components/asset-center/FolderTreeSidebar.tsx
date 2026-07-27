import { useEffect, useMemo, useState } from 'react';
import type { FolderItem } from '../../api/client';
import { buildFolderTree, folderAncestorIds, type FolderTreeNode } from '../../lib/folderTree';

type Props = {
  folders: FolderItem[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  getItemCount: (folderId: string | null) => number;
  rootLabel?: string;
  /** 只读模式：隐藏删除按钮（如软链选择器） */
  readOnly?: boolean;
};

function TreeNode({
  node,
  depth,
  selectedFolderId,
  expanded,
  getItemCount,
  onToggleExpand,
  onSelect,
  onDeleteFolder,
  readOnly = false,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedFolderId: string | null;
  expanded: Set<string>;
  getItemCount: (folderId: string | null) => number;
  onToggleExpand: (id: string) => void;
  onSelect: (folderId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  readOnly?: boolean;
}) {
  const { folder, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = selectedFolderId === folder.id;
  const count = getItemCount(folder.id);

  return (
    <li className="asset-folder-tree-node">
      <div
        className={`asset-folder-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${0.6 + depth * 0.75}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="asset-folder-tree-toggle"
            aria-label={isOpen ? '收起' : '展开'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(folder.id);
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="asset-folder-tree-toggle asset-folder-tree-toggle--spacer" />
        )}
        <span className="asset-folder-icon" onClick={() => onSelect(folder.id)}>
          📂
        </span>
        <span className="asset-folder-name" onClick={() => onSelect(folder.id)} title={folder.name}>
          {folder.name}
        </span>
        <div className="asset-folder-actions">
          <span className="asset-folder-count">{count}</span>
          {!readOnly ? (
            <button
              type="button"
              className="asset-folder-delete"
              title="删除文件夹"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(folder.id);
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
      {hasChildren && isOpen ? (
        <ul className="asset-folder-list asset-folder-tree-children">
          {children.map((child) => (
            <TreeNode
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              expanded={expanded}
              getItemCount={getItemCount}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onDeleteFolder={onDeleteFolder}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** 服务端文件夹树（上传管理器） */
export function FolderTreeSidebar({
  folders,
  selectedFolderId,
  onSelect,
  onDeleteFolder,
  getItemCount,
  rootLabel = '全部资产',
  readOnly = false,
}: Props) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of folderAncestorIds(folders, selectedFolderId)) {
        next.add(id);
      }
      return next;
    });
  }, [folders, selectedFolderId]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className="asset-folder-list asset-folder-tree">
      <li
        className={`asset-folder-item ${selectedFolderId === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="asset-folder-tree-toggle asset-folder-tree-toggle--spacer" />
        <span className="asset-folder-icon">📁</span>
        <span className="asset-folder-name">{rootLabel}</span>
        <span className="asset-folder-count">{getItemCount(null)}</span>
      </li>
      {tree.map((node) => (
        <TreeNode
          key={node.folder.id}
          node={node}
          depth={0}
          selectedFolderId={selectedFolderId}
          expanded={expanded}
          getItemCount={getItemCount}
          onToggleExpand={toggleExpand}
          onSelect={onSelect}
          onDeleteFolder={onDeleteFolder}
          readOnly={readOnly}
        />
      ))}
      {tree.length === 0 ? (
        <li className="asset-folder-empty">{readOnly ? '暂无子文件夹' : '暂无子文件夹，点击「+ 新建」'}</li>
      ) : null}
    </ul>
  );
}
