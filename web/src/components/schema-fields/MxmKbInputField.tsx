/**
 * mxmKbInput：可 @ 知识库 / 文件 / 知识卡 的 textarea
 * 值：{ text, mentions[] } — 供 Task V2 context-field-resolver 注入
 */
import { useMemo, useState } from 'react';
import { Button, Input, Modal, Tabs, Tag, Typography } from 'antd';
import { Folder, Library, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { KnowledgeFolderTreeSidebar } from '../asset-center';
import { KnowledgeFolderContentList } from '../knowledge-base/KnowledgeFolderContentList';
import {
  buildKnowledgeFolderBreadcrumb,
  filterBrowsableKnowledgeFolderItems,
  loadKnowledgeFolderBrowse,
  loadKnowledgeFolderTree,
  peekKnowledgeFolderBrowse,
} from './textSourceKnowledgeFolderUtils';
import { getKnowledgeFolders, type FolderItem, type KnowledgeFolderLinkItem } from '../../api/client';
import './mxm-kb-input-field.css';

export type MxmKbMentionType = 'folder' | 'file' | 'knowledge_card';

export type MxmKbMention = {
  type: MxmKbMentionType;
  id: string;
  label?: string;
  folderId?: string;
  query?: string;
};

export type MxmKbInputValue = {
  text: string;
  mentions: MxmKbMention[];
};

type Props = {
  value: unknown;
  rows?: number;
  onChange: (next: MxmKbInputValue) => void;
};

function normalizeValue(raw: unknown): MxmKbInputValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { text: typeof raw === 'string' ? raw : '', mentions: [] };
  }
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text : '';
  const mentions = Array.isArray(o.mentions)
    ? (o.mentions as MxmKbMention[]).filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          typeof m.id === 'string' &&
          (m.type === 'folder' || m.type === 'file' || m.type === 'knowledge_card')
      )
    : [];
  return { text, mentions };
}

function mentionKey(m: MxmKbMention): string {
  return `${m.type}:${m.id}`;
}

export function MxmKbInputField({ value, rows = 5, onChange }: Props) {
  const { t } = useTranslation();
  const normalized = useMemo(() => normalizeValue(value), [value]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'folder' | 'knowledge_card'>('folder');

  const [vfFolders, setVfFolders] = useState<FolderItem[]>([]);
  const [vfSelectedFolderId, setVfSelectedFolderId] = useState<string | null>(null);
  const [vfItems, setVfItems] = useState<
    Awaited<ReturnType<typeof loadKnowledgeFolderBrowse>>['items']
  >([]);
  const [vfSearch, setVfSearch] = useState('');
  const [vfLoading, setVfLoading] = useState(false);
  const [knowledgeCards, setKnowledgeCards] = useState<FolderItem[]>([]);
  const [kbSearch, setKbSearch] = useState('');

  const openPicker = () => {
    setPickerOpen(true);
    void loadKnowledgeFolderTree()
      .then((folders) => {
        setVfFolders(folders);
        setVfSelectedFolderId((prev) => prev ?? folders[0]?.id ?? null);
      })
      .catch(() => setVfFolders([]));
    void getKnowledgeFolders({ force: true })
      .then((list) => {
        setKnowledgeCards(
          (list || []).filter(
            (f) => f.card_tag === 'knowledge' || f.index_status === 'indexed'
          )
        );
      })
      .catch(() => setKnowledgeCards([]));
  };

  const loadBrowse = (folderId: string) => {
    const cached = peekKnowledgeFolderBrowse(folderId);
    if (cached?.items) setVfItems(cached.items);
    setVfLoading(true);
    void loadKnowledgeFolderBrowse(folderId)
      .then(({ items }) => setVfItems(items))
      .finally(() => setVfLoading(false));
  };

  const onSelectFolder = (id: string | null) => {
    setVfSelectedFolderId(id);
    if (id) loadBrowse(id);
  };

  const emit = (patch: Partial<MxmKbInputValue>) => {
    onChange({
      text: patch.text ?? normalized.text,
      mentions: patch.mentions ?? normalized.mentions,
    });
  };

  const addMention = (m: MxmKbMention) => {
    const key = mentionKey(m);
    if (normalized.mentions.some((x) => mentionKey(x) === key)) {
      setPickerOpen(false);
      return;
    }
    const tag = `@${m.label || m.id}`;
    const nextText = normalized.text.trimEnd()
      ? `${normalized.text.trimEnd()} ${tag}`
      : tag;
    emit({
      text: nextText,
      mentions: [...normalized.mentions, m],
    });
    setPickerOpen(false);
  };

  const removeMention = (m: MxmKbMention) => {
    emit({ mentions: normalized.mentions.filter((x) => mentionKey(x) !== mentionKey(m)) });
  };

  const onTextChange = (text: string) => {
    if (text.endsWith('@')) {
      openPicker();
      emit({ text: text.replace(/@\s*$/, '').trimEnd() });
      return;
    }
    emit({ text });
  };

  const vfBreadcrumb = useMemo(
    () => buildKnowledgeFolderBreadcrumb(vfFolders, vfSelectedFolderId),
    [vfFolders, vfSelectedFolderId]
  );
  const vfDisplayed = useMemo(
    () => filterBrowsableKnowledgeFolderItems(vfItems, vfSearch, false),
    [vfItems, vfSearch]
  );
  const selectedFolder = vfFolders.find((f) => f.id === vfSelectedFolderId) || null;

  const filteredCards = knowledgeCards.filter((f) => {
    if (f.card_tag !== 'knowledge' && f.index_status !== 'indexed') return false;
    if (!kbSearch.trim()) return f.card_tag === 'knowledge' || true;
    return f.name.toLowerCase().includes(kbSearch.trim().toLowerCase());
  });

  const knowledgeOnly = filteredCards.filter((f) => f.card_tag === 'knowledge');
  const cardList = knowledgeOnly.length > 0 ? knowledgeOnly : filteredCards;

  return (
    <div className="mxm-kb-input">
      {normalized.mentions.length > 0 ? (
        <div className="mxm-kb-input__chips">
          {normalized.mentions.map((m) => (
            <Tag
              key={mentionKey(m)}
              className={`mxm-kb-input__chip mxm-kb-input__chip--${m.type}`}
              closable
              closeIcon={<X size={10} />}
              onClose={() => removeMention(m)}
            >
              {m.type === 'file' ? (
                <Folder size={11} />
              ) : m.type === 'knowledge_card' ? (
                <Library size={11} />
              ) : (
                <Folder size={11} />
              )}{' '}
              {m.label || m.id}
            </Tag>
          ))}
        </div>
      ) : null}
      <Input.TextArea
        className="mxm-kb-input__textarea"
        rows={rows}
        value={normalized.text}
        placeholder={t('form.mxmKbInput.placeholder')}
        onChange={(e) => onTextChange(e.target.value)}
      />
      <div className="mxm-kb-input__actions">
        <Button size="small" type="link" onClick={openPicker}>
          @ {t('form.mxmKbInput.mention')}
        </Button>
      </div>

      <Modal
        title={t('form.mxmKbInput.pickerTitle')}
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
        className="mxm-kb-input-modal"
      >
        <Tabs
          activeKey={pickerTab}
          onChange={(k) => {
            setPickerTab(k as typeof pickerTab);
            if (k === 'folder' && vfSelectedFolderId) loadBrowse(vfSelectedFolderId);
          }}
          items={[
            {
              key: 'folder',
              label: (
                <span className="mxm-kb-input-tab">
                  <Folder size={14} />{' '}
                  {t('form.mxmKbInput.tabFolder')}
                </span>
              ),
              children: (
                <div className="mxm-kb-input-picker">
                  <aside className="mxm-kb-input-picker__tree">
                    {vfFolders.length === 0 ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t('agent.mention.noKnowledgeFolders')}
                      </Typography.Text>
                    ) : (
                      <KnowledgeFolderTreeSidebar
                        folders={vfFolders}
                        selectedFolderId={vfSelectedFolderId}
                        onSelect={onSelectFolder}
                        onDeleteFolder={() => undefined}
                        getItemCount={() => 0}
                      />
                    )}
                  </aside>
                  <div className="mxm-kb-input-picker__main">
                    <div className="mxm-kb-input-picker__head">
                      <span>
                        {vfBreadcrumb.length > 0
                          ? vfBreadcrumb.map((f) => f.name).join(' / ')
                          : t('agent.mention.selectFolder')}
                      </span>
                      <Button
                        size="small"
                        type="primary"
                        disabled={!selectedFolder}
                        onClick={() => {
                          if (!selectedFolder) return;
                          addMention({
                            type: 'folder',
                            id: selectedFolder.id,
                            label: selectedFolder.name,
                          });
                        }}
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
                        items={vfDisplayed}
                        loading={vfLoading}
                        compact
                        emptyDescription={
                          vfSearch.trim()
                            ? t('agent.mention.noMatchFiles')
                            : t('agent.mention.emptyFolder')
                        }
                        onOpenDir={onSelectFolder}
                        onPickLink={(link: KnowledgeFolderLinkItem) => {
                          if (link.broken) return;
                          addMention({
                            type: 'file',
                            id: link.id,
                            label: link.name,
                            folderId: vfSelectedFolderId || undefined,
                          });
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ),
            },
            {
              key: 'knowledge_card',
              label: (
                <span className="mxm-kb-input-tab">
                  <Library size={14} />{' '}
                  {t('form.mxmKbInput.tabKnowledge')}
                </span>
              ),
              children: (
                <div className="mxm-kb-input-list">
                  <Input
                    size="small"
                    allowClear
                    placeholder={t('form.mxmKbInput.searchKnowledge')}
                    value={kbSearch}
                    onChange={(e) => setKbSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  {cardList.length === 0 ? (
                    <Typography.Text type="secondary">
                      {t('form.mxmKbInput.noKnowledge')}
                    </Typography.Text>
                  ) : (
                    <ul className="mxm-kb-input-list__ul">
                      {cardList.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            className="mxm-kb-input-list__item"
                            onClick={() =>
                              addMention({
                                type: 'knowledge_card',
                                id: f.id,
                                label: f.name,
                              })
                            }
                          >
                            <Library size={14} />
                            <span>{f.name}</span>
                            {f.card_tag ? (
                              <Tag style={{ marginInlineStart: 'auto' }}>{f.card_tag}</Tag>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
