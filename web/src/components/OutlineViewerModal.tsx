/**
 * 大纲查看弹窗 - 展示 task.result.metadata.outline 和 characters，支持切换查看 Raw JSON
 */

import { useState } from 'react';

export interface OutlineNode {
  uid: string;
  content: string;
  motivation?: string;
  stance?: string;
  tone?: string;
  cast?: string[];
  length?: string;
  key_elements?: string[];
  children?: OutlineNode[];
}

export interface CharacterProfile {
  id?: string;
  name: string;
  nickname?: string;
  age?: string;
  appearance?: string;
  voice_description?: string;
  personality?: string;
  [key: string]: unknown;
}

interface OutlineViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  outline: OutlineNode | OutlineNode[] | null;
  characters?: CharacterProfile[];
  loading?: boolean;
  error?: string | null;
}

function OutlineTreeNode({ node, level = 0 }: { node: OutlineNode; level?: number }) {
  const paddingLeft = level * 20 + 8;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="outline-viewer-node" style={{ paddingLeft }}>
      <div className="outline-viewer-node-content">
        <span className="outline-viewer-node-text">{node.content}</span>
        {node.cast && node.cast.length > 0 && (
          <span className="outline-viewer-node-cast"> [{node.cast.join(', ')}]</span>
        )}
      </div>
      {node.motivation && (
        <div className="outline-viewer-node-meta">动机: {node.motivation}</div>
      )}
      {node.length && (
        <div className="outline-viewer-node-meta">长度: {node.length}</div>
      )}
      {hasChildren && (
        <div className="outline-viewer-node-children">
          {node.children!.map((child) => (
            <OutlineTreeNode key={child.uid} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OutlineViewerModal({
  visible,
  onClose,
  title = '大纲内容',
  outline,
  characters = [],
  loading = false,
  error = null,
}: OutlineViewerModalProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');

  if (!visible) return null;

  const nodes: OutlineNode[] = Array.isArray(outline)
    ? outline as OutlineNode[]
    : outline && typeof outline === 'object' && 'content' in outline
      ? [outline as OutlineNode]
      : [];

  const hasOutline = nodes.length > 0;
  const rawJson =
    outline != null
      ? JSON.stringify(outline, null, 2)
      : '';

  return (
    <>
      <div className="outline-viewer-overlay" onClick={onClose} aria-hidden="true" />
      <div className="outline-viewer-modal">
        <div className="outline-viewer-header">
          <h3 className="outline-viewer-title">{title}</h3>
          <div className="outline-viewer-header-actions">
            {hasOutline && (
              <div className="outline-viewer-tabs">
                <button
                  type="button"
                  className={viewMode === 'tree' ? 'outline-viewer-tab active' : 'outline-viewer-tab'}
                  onClick={() => setViewMode('tree')}
                >
                  树形
                </button>
                <button
                  type="button"
                  className={viewMode === 'raw' ? 'outline-viewer-tab active' : 'outline-viewer-tab'}
                  onClick={() => setViewMode('raw')}
                >
                  Raw JSON
                </button>
              </div>
            )}
            <button type="button" className="outline-viewer-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="outline-viewer-body">
          {loading && <p className="outline-viewer-loading">加载中...</p>}
          {error && <p className="outline-viewer-error">{error}</p>}
          {!loading && !error && !hasOutline && (
            <p className="outline-viewer-empty">暂无大纲内容（任务可能未完成）</p>
          )}
          {!loading && !error && hasOutline && viewMode === 'tree' && (
            <>
              <div className="outline-viewer-outline">
                {nodes.map((node) => (
                  <OutlineTreeNode key={node.uid} node={node} />
                ))}
              </div>
              {Array.isArray(characters) && characters.length > 0 && (
                <div className="outline-viewer-characters">
                  <h4>角色画像</h4>
                  <ul>
                    {characters.map((c, i) => (
                      <li key={(c as CharacterProfile).id || `char-${i}`} className="outline-viewer-char">
                        <strong>{(c as CharacterProfile).name}</strong>
                        {(c as CharacterProfile).nickname && ` (${(c as CharacterProfile).nickname})`}
                        {(c as CharacterProfile).age && ` · ${(c as CharacterProfile).age}`}
                        {(c as CharacterProfile).appearance && (
                          <div className="outline-viewer-char-detail">外貌: {(c as CharacterProfile).appearance}</div>
                        )}
                        {(c as CharacterProfile).voice_description && (
                          <div className="outline-viewer-char-detail">声音: {(c as CharacterProfile).voice_description}</div>
                        )}
                        {(c as CharacterProfile).personality && (
                          <div className="outline-viewer-char-detail">性格: {(c as CharacterProfile).personality}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {!loading && !error && hasOutline && viewMode === 'raw' && (
            <pre className="outline-viewer-raw-json">{rawJson}</pre>
          )}
        </div>
        <style>{`
          .outline-viewer-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            z-index: 999;
          }
          .outline-viewer-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: min(90vw, 640px);
            max-height: 85vh;
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 8px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .outline-viewer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #333;
          }
          .outline-viewer-title {
            margin: 0;
            font-size: 1.1rem;
            color: #e0e0e0;
          }
          .outline-viewer-close {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0 0.5rem;
            line-height: 1;
          }
          .outline-viewer-close:hover {
            color: #e0e0e0;
          }
          .outline-viewer-header-actions {
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          .outline-viewer-tabs {
            display: flex;
            gap: 0.25rem;
          }
          .outline-viewer-tab {
            padding: 0.35rem 0.75rem;
            font-size: 0.85rem;
            border: 1px solid #444;
            background: #2a2a2a;
            color: #aaa;
            border-radius: 4px;
            cursor: pointer;
          }
          .outline-viewer-tab:hover {
            color: #e0e0e0;
            border-color: #555;
          }
          .outline-viewer-tab.active {
            background: #334155;
            color: #93c5fd;
            border-color: #475569;
          }
          .outline-viewer-raw-json {
            margin: 0;
            padding: 1rem;
            font-size: 0.8rem;
            line-height: 1.5;
            color: #94a3b8;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 6px;
            overflow: auto;
            max-height: 60vh;
            white-space: pre-wrap;
            word-break: break-all;
          }
          .outline-viewer-body {
            flex: 1;
            overflow-y: auto;
            padding: 1rem 1.25rem;
          }
          .outline-viewer-loading,
          .outline-viewer-error,
          .outline-viewer-empty {
            margin: 0;
            color: #888;
          }
          .outline-viewer-error { color: #fca5a5; }
          .outline-viewer-outline {
            margin-bottom: 1.5rem;
          }
          .outline-viewer-node {
            margin-bottom: 0.5rem;
          }
          .outline-viewer-node-content {
            color: #e0e0e0;
            line-height: 1.5;
          }
          .outline-viewer-node-text {
            font-weight: 500;
          }
          .outline-viewer-node-cast {
            font-size: 0.85em;
            color: #93c5fd;
          }
          .outline-viewer-node-meta {
            font-size: 0.8rem;
            color: #888;
            margin-top: 0.25rem;
          }
          .outline-viewer-node-children {
            margin-top: 0.35rem;
          }
          .outline-viewer-characters h4 {
            margin: 1rem 0 0.5rem;
            font-size: 0.95rem;
            color: #c0c0c0;
          }
          .outline-viewer-characters ul {
            margin: 0;
            padding-left: 1.25rem;
            color: #aaa;
          }
          .outline-viewer-char {
            margin-bottom: 0.75rem;
          }
          .outline-viewer-char strong {
            color: #e0e0e0;
          }
          .outline-viewer-char-detail {
            font-size: 0.85rem;
            margin-top: 0.25rem;
          }
        `}</style>
      </div>
    </>
  );
}
