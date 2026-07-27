/**
 * 大纲查看弹窗 - 展示 task.result.metadata.outline 和 characters，支持切换查看 Raw JSON
 */

import { useTranslation } from 'react-i18next';
import { MediaLoadingState } from './MediaLoadingState';
import { MediaViewerHeader } from './MediaViewerHeader';
import { useAdminGatedViewerMode } from './viewer/useAdminGatedViewerMode';
import './OutlineViewerModal.css';

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
  const { t } = useTranslation();
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
        <div className="outline-viewer-node-meta">{t('common.viewer.outline.motivation', { text: node.motivation })}</div>
      )}
      {node.length && (
        <div className="outline-viewer-node-meta">{t('common.viewer.outline.length', { text: node.length })}</div>
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
  title,
  outline,
  characters = [],
  loading = false,
  error = null,
}: OutlineViewerModalProps) {
  const { t } = useTranslation();
  const { viewMode, setViewMode } = useAdminGatedViewerMode<'tree' | 'raw'>('tree');

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
    <div className="ov-root" role="dialog" aria-modal="true">
      <div className="ov-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="ov-shell">
        <MediaViewerHeader
          title={title || t('common.viewer.outline.previewTitle')}
          tabs={
            hasOutline
              ? [
                  { value: 'tree', label: t('common.viewer.tabs.tree') },
                  { value: 'raw', label: t('common.viewer.tabs.data') },
                ]
              : undefined
          }
          activeTab={viewMode}
          onTabChange={(tab) => setViewMode(tab as 'tree' | 'raw')}
          onClose={onClose}
          tabsAriaLabel={t("common.viewer.outline.tabsAria")}
        />

        <main className="ov-body">
          {loading && (
            <div className="media-viewer-loading-wrap outline-viewer-loading-wrap">
              <MediaLoadingState variant="inline" kind="outline" />
            </div>
          )}
          {error && <p className="outline-viewer-error">{error}</p>}
          {!loading && !error && !hasOutline && (
            <p className="outline-viewer-empty">{t('common.viewer.outline.empty')}</p>
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
                  <h4>{t('common.viewer.outline.characters')}</h4>
                  <ul>
                    {characters.map((c, i) => (
                      <li key={(c as CharacterProfile).id || `char-${i}`} className="outline-viewer-char">
                        <strong>{(c as CharacterProfile).name}</strong>
                        {(c as CharacterProfile).nickname && ` (${(c as CharacterProfile).nickname})`}
                        {(c as CharacterProfile).age && ` · ${(c as CharacterProfile).age}`}
                        {(c as CharacterProfile).appearance && (
                          <div className="outline-viewer-char-detail">{t('common.viewer.outline.appearance', { text: (c as CharacterProfile).appearance })}</div>
                        )}
                        {(c as CharacterProfile).voice_description && (
                          <div className="outline-viewer-char-detail">{t('common.viewer.outline.voice', { text: (c as CharacterProfile).voice_description })}</div>
                        )}
                        {(c as CharacterProfile).personality && (
                          <div className="outline-viewer-char-detail">{t('common.viewer.outline.personality', { text: (c as CharacterProfile).personality })}</div>
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
        </main>
      </div>
    </div>
  );
}
