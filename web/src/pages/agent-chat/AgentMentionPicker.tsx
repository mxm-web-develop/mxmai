/**
 * Agent @ 引用选择器：知识库文件夹树 + 文件列表（对齐动态表单知识库选择）
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Tabs, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Briefcase, Folder } from 'lucide-react';
import { KnowledgeFolderTreeSidebar } from '../../components/asset-center';
import { KnowledgeFolderContentList } from '../../components/knowledge-base/KnowledgeFolderContentList';
import {
  buildKnowledgeFolderBreadcrumb,
  filterBrowsableKnowledgeFolderItems,
  loadKnowledgeFolderBrowse,
  loadKnowledgeFolderTree,
  peekKnowledgeFolderBrowse,
} from '../../components/schema-fields/textSourceKnowledgeFolderUtils';
import {
  getTaskFormConfigList,
  type AgentReference,
  type FolderItem,
  type KnowledgeFolderLinkItem,
} from '../../api/client';
import { formatHumanBusinessLabel } from '../../task-v2/taskSelectionLabels';

/** folder = 知识库树；旧独立 knowledge bases 产品入口已移除 */
type MentionTab = 'folder' | 'business';

type Props = {
  activeTab: MentionTab;
  onTabChange: (tab: MentionTab) => void;
  onPick: (ref: AgentReference) => void;
  /** 限制业务目录 scope（模块 Agent）；默认全量 */
  businessScopes?: string[];
  /** 显示的 Tab；默认知识库 + 业务（不再列出旧 /knowledge/bases） */
  enabledTabs?: MentionTab[];
};

export function AgentMentionPicker({
  activeTab,
  onTabChange,
  onPick,
  businessScopes,
  enabledTabs = ['folder', 'business'],
}: Props) {
  const { t } = useTranslation();
  const [vfFolders, setVfFolders] = useState<FolderItem[]>([]);
  const [vfSelectedFolderId, setVfSelectedFolderId] = useState<string | null>(null);
  const [vfItems, setVfItems] = useState<Awaited<ReturnType<typeof loadKnowledgeFolderBrowse>>['items']>([]);
  const [vfSearch, setVfSearch] = useState('');
  const [vfLoading, setVfLoading] = useState(false);
  const [bizOptions, setBizOptions] = useState<
    Array<{ id: string; label: string; scope: string; taskKey: string; subtype?: string | null }>
  >([]);
  const [bizSearch, setBizSearch] = useState('');

  useEffect(() => {
    void loadKnowledgeFolderTree()
      .then((folders) => {
        setVfFolders(folders);
        setVfSelectedFolderId((prev) => prev ?? folders[0]?.id ?? null);
      })
      .catch(() => setVfFolders([]));

    void (async () => {
      const scopes = businessScopes?.length
        ? businessScopes
        : ['writing', 'graph', 'video', 'audio', 'music', 'text'];
      const biz: typeof bizOptions = [];
      for (const scope of scopes) {
        try {
          const listRes = await getTaskFormConfigList({ scope });
          const items = listRes.data?.data?.items || [];
          for (const it of items) {
            const label = formatHumanBusinessLabel(it);
            if (!label) continue;
            biz.push({
              id: `${scope}:${it.taskKey}:${it.subtype || ''}`,
              label,
              scope,
              taskKey: it.taskKey,
              subtype: it.subtype,
            });
          }
        } catch {
          /* skip */
        }
      }
      setBizOptions(biz.slice(0, 120));
    })();
  }, [businessScopes?.join(',')]);

  useEffect(() => {
    if (activeTab !== 'folder' || !vfSelectedFolderId) return;
    const cached = peekKnowledgeFolderBrowse(vfSelectedFolderId);
    if (cached?.items) setVfItems(cached.items);
    setVfLoading(true);
    void loadKnowledgeFolderBrowse(vfSelectedFolderId)
      .then(({ items }) => setVfItems(items))
      .finally(() => setVfLoading(false));
  }, [activeTab, vfSelectedFolderId]);

  const vfBreadcrumb = useMemo(
    () => buildKnowledgeFolderBreadcrumb(vfFolders, vfSelectedFolderId),
    [vfFolders, vfSelectedFolderId]
  );

  const vfDisplayedItems = useMemo(
    () => filterBrowsableKnowledgeFolderItems(vfItems, vfSearch, false),
    [vfItems, vfSearch]
  );

  const selectedFolder = vfFolders.find((f) => f.id === vfSelectedFolderId) || null;

  const pickFolder = () => {
    if (!selectedFolder) return;
    onPick({ type: 'folder', id: selectedFolder.id, label: selectedFolder.name });
  };

  const pickLink = (link: KnowledgeFolderLinkItem) => {
    if (link.broken) return;
    onPick({
      type: 'file',
      id: link.id,
      label: link.name,
      folderId: vfSelectedFolderId || undefined,
      refType: link.ref_type,
      contentType: link.content_type || undefined,
    });
  };

  const filteredBiz = bizOptions.filter((b) =>
    !bizSearch.trim() ? true : b.label.toLowerCase().includes(bizSearch.trim().toLowerCase())
  );

  const allItems = [
        {
          key: 'folder' as const,
          label: (
            <span className="agent-chat-mention-tab">
              <Folder size={14} /> {t('agent.mention.knowledgeBase')}
            </span>
          ),
          children: (
            <div className="agent-chat-mention-folder">
              <aside className="agent-chat-mention-folder__tree">
                {vfFolders.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('agent.mention.noKnowledgeFolders')}
                  </Typography.Text>
                ) : (
                  <KnowledgeFolderTreeSidebar
                    folders={vfFolders}
                    selectedFolderId={vfSelectedFolderId}
                    onSelect={setVfSelectedFolderId}
                    onDeleteFolder={() => undefined}
                    getItemCount={() => 0}
                  />
                )}
              </aside>
              <div className="agent-chat-mention-folder__main">
                <div className="agent-chat-mention-folder__head">
                  <div className="agent-chat-mention-folder__path">
                    {vfBreadcrumb.length > 0
                      ? vfBreadcrumb.map((f) => f.name).join(' / ')
                      : t('agent.mention.selectFolder')}
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!selectedFolder}
                    onClick={pickFolder}
                  >
                    {t('agent.mention.referenceFolder')}
                  </Button>
                </div>
                <Input
                  size="small"
                  allowClear
                  placeholder={t('agent.mention.searchFiles')}
                  value={vfSearch}
                  onChange={(e) => setVfSearch(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                {vfSelectedFolderId ? (
                  <KnowledgeFolderContentList
                    items={vfDisplayedItems}
                    loading={vfLoading}
                    compact
                    emptyDescription={
                      vfSearch.trim()
                        ? t('agent.mention.noMatchFiles')
                        : t('agent.mention.emptyFolder')
                    }
                    onOpenDir={setVfSelectedFolderId}
                    onPickLink={pickLink}
                  />
                ) : (
                  <Typography.Text type="secondary">{t('agent.mention.selectFromLeft')}</Typography.Text>
                )}
              </div>
            </div>
          ),
        },
        {
          key: 'business' as const,
          label: (
            <span className="agent-chat-mention-tab">
              <Briefcase size={14} /> {t('agent.mention.business')}
            </span>
          ),
          children: (
            <div className="agent-chat-mention-list">
              <Input
                size="small"
                allowClear
                placeholder={t('agent.mention.searchBusiness')}
                value={bizSearch}
                onChange={(e) => setBizSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              {filteredBiz.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="agent-chat-mention-item"
                  onClick={() =>
                    onPick({
                      type: 'business',
                      id: b.id,
                      label: b.label,
                      scope: b.scope,
                      taskKey: b.taskKey,
                      subtype: b.subtype,
                    })
                  }
                >
                  <Briefcase size={14} />
                  <span className="agent-chat-mention-item__name">{b.label}</span>
                </button>
              ))}
              {filteredBiz.length === 0 && <div className="agent-chat-empty">{t('agent.mention.noBusiness')}</div>}
            </div>
          ),
        },
  ];

  const safeTab: MentionTab =
    enabledTabs.includes(activeTab) ? activeTab : (enabledTabs[0] ?? 'folder');

  return (
    <Tabs
      size="small"
      activeKey={safeTab}
      onChange={(k) => onTabChange(k as MentionTab)}
      items={allItems.filter((it) => enabledTabs.includes(it.key))}
    />
  );
}
