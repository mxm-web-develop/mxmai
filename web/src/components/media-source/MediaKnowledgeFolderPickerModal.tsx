/**
 * 「我的资源」选素材弹窗（Modal，禁止 Drawer）。
 * Tab：知识库 | 已上传管理
 * - visual：图/视频软链 + 已上传图片
 * - audio：音频软链 + 已上传音频
 * - document：文本/文档软链 + 已上传文档（解析正文到 textContent）
 */
import { useEffect, useMemo, useState } from 'react';
import { App, Input, Modal, Tabs, Typography } from 'antd';
import { FileAudio, FileText } from 'lucide-react';
import { FolderTreeSidebar, KnowledgeFolderTreeSidebar } from '../asset-center';
import { KnowledgeFolderContentList } from '../knowledge-base/KnowledgeFolderContentList';
import BrandLoading from '../BrandLoading';
import { UploadPickerThumb } from '../knowledge-base/UploadPickerThumb';
import {
  buildKnowledgeFolderBreadcrumb,
  isAudioKnowledgeFolderLink,
  loadKnowledgeFolderBrowse,
  loadKnowledgeFolderTree,
  peekKnowledgeFolderBrowse,
  resolveKnowledgeFolderAudioUrl,
} from '../schema-fields/voiceoverAudioUtils';
import {
  isTextKnowledgeFolderLink,
  resolveKnowledgeFolderText,
} from '../schema-fields/textSourceKnowledgeFolderUtils';
import {
  isVisualKnowledgeFolderLink,
  resolveKnowledgeFolderVisualMedia,
} from '../video-timeline-review/referenceMediaKnowledgeFolderUtils';
import {
  fetchStorageObjectBlobUrl,
  getFolders,
  listStorageObjects,
  normalizeUploadedMediaUrl,
  peekStorageObjectsList,
  prefetchStorageObjectPreviews,
  type FolderItem,
  type StorageObjectListItem,
  type KnowledgeFolderLinkItem,
} from '../../api/client';
import { extractTextFromFile } from '../../lib/extractTextFromFile';
import { resolveLinkDisplayTitle } from '../knowledge-base/knowledgeFolderLinkDisplay';
import { storageObjectPublicUrl } from '../knowledge-base/knowledgeFolderLinkModel';
import type { MediaPickPayload } from './types';
import '../schema-form/reference-images.css';
import '../../styles/asset-center.css';

export type MediaKnowledgeFolderPickerAccept = 'visual' | 'audio' | 'document';

export type MediaKnowledgeFolderPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onPick: (item: MediaPickPayload) => void;
  /** 默认 visual */
  accept?: MediaKnowledgeFolderPickerAccept;
  /** 是否展示「已上传管理」页签（默认 true） */
  enableMyUploads?: boolean;
  /**
   * accept=document 时：text=解析正文（TextFileOrPaste）；url=仅返回文件 URL（MediaUploadField）
   * 默认 text
   */
  documentPickMode?: 'text' | 'url';
  pickSuccessMessage?: string;
  /** 弹窗标题，默认「我的资源」 */
  title?: string;
};

type SourceTab = 'knowledge' | 'uploads';

function isDocumentUpload(item: StorageObjectListItem): boolean {
  const ct = (item.contentType ?? '').toLowerCase();
  if (ct.startsWith('text/') || ct === 'application/pdf') return true;
  return /\.(pdf|md|markdown|txt|doc|docx|rtf|csv|json)$/i.test(item.originalName ?? '');
}

function filterUploadsByAccept(
  items: StorageObjectListItem[],
  accept: MediaKnowledgeFolderPickerAccept
): StorageObjectListItem[] {
  if (accept === 'audio') return items.filter((it) => it.contentType?.startsWith('audio/'));
  if (accept === 'document') return items.filter(isDocumentUpload);
  return items.filter((it) => it.contentType?.startsWith('image/'));
}

export function MediaKnowledgeFolderPickerModal({
  open,
  onClose,
  onPick,
  accept = 'visual',
  enableMyUploads = true,
  documentPickMode = 'text',
  pickSuccessMessage = '已选择',
  title = '我的资源',
}: MediaKnowledgeFolderPickerModalProps) {
  const { message } = App.useApp();
  const [sourceTab, setSourceTab] = useState<SourceTab>('knowledge');

  const [vfFolders, setVfFolders] = useState<Awaited<ReturnType<typeof loadKnowledgeFolderTree>>>([]);
  const [vfSelectedFolderId, setVfSelectedFolderId] = useState<string | null>(null);
  const [vfItems, setVfItems] = useState<Awaited<ReturnType<typeof loadKnowledgeFolderBrowse>>['items']>([]);
  const [vfMatchCounts, setVfMatchCounts] = useState<Record<string, number>>({});
  const [vfSearch, setVfSearch] = useState('');
  const [vfLoading, setVfLoading] = useState(false);
  const [vfResolvingId, setVfResolvingId] = useState<string | null>(null);

  const [uploadFolders, setUploadFolders] = useState<FolderItem[]>([]);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<StorageObjectListItem[]>([]);
  const [uploadCounts, setUploadCounts] = useState<Map<string | null, number>>(new Map());
  const [uploadSearch, setUploadSearch] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResolvingId, setUploadResolvingId] = useState<string | null>(null);

  const isLinkMatch = (link: KnowledgeFolderLinkItem) => {
    if (accept === 'audio') return isAudioKnowledgeFolderLink(link);
    if (accept === 'document') {
      if (documentPickMode === 'url') {
        // URL 模式仅 storage 文档，不含写作任务软链
        if (link.broken || link.ref_type !== 'storage_object') return false;
        const ct = (link.content_type ?? '').toLowerCase();
        if (ct.startsWith('text/') || ct === 'application/pdf') return true;
        return /\.(pdf|md|markdown|txt|doc|docx|rtf)$/i.test(link.name);
      }
      return isTextKnowledgeFolderLink(link);
    }
    return isVisualKnowledgeFolderLink(link);
  };

  useEffect(() => {
    if (!open) return;
    setVfSearch('');
    setUploadSearch('');
    setSourceTab('knowledge');
    void loadKnowledgeFolderTree()
      .then(async (folders) => {
        setVfFolders(folders);
        const counts: Record<string, number> = {};
        await Promise.all(
          folders.map(async (f) => {
            try {
              const { items } = await loadKnowledgeFolderBrowse(f.id);
              counts[f.id] = items.filter(
                (it) => it.type === 'link' && isLinkMatch(it as KnowledgeFolderLinkItem)
              ).length;
            } catch {
              counts[f.id] = 0;
            }
          })
        );
        setVfMatchCounts(counts);
        const preferred = folders.find((f) => (counts[f.id] ?? 0) > 0) ?? folders[0];
        setVfSelectedFolderId(preferred?.id ?? null);
        if (enableMyUploads) {
          const hasAny = folders.some((f) => (counts[f.id] ?? 0) > 0);
          if (!hasAny) setSourceTab('uploads');
        }
      })
      .catch((e) => message.error(e instanceof Error ? e.message : '加载知识库失败'));

    if (enableMyUploads) {
      void getFolders()
        .then((folders) => {
          setUploadFolders(folders);
          setUploadFolderId(null);
        })
        .catch(() => setUploadFolders([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isLinkMatch 随 accept 变，open 时重载即可
  }, [open, message, accept, enableMyUploads]);

  useEffect(() => {
    if (!open || !vfSelectedFolderId || sourceTab !== 'knowledge') return;
    const cached = peekKnowledgeFolderBrowse(vfSelectedFolderId);
    if (cached?.items) {
      setVfItems(cached.items);
      const match = cached.items.filter(
        (it) => it.type === 'link' && isLinkMatch(it as KnowledgeFolderLinkItem)
      ).length;
      setVfMatchCounts((prev) => ({ ...prev, [vfSelectedFolderId]: match }));
    }
    setVfLoading(true);
    void loadKnowledgeFolderBrowse(vfSelectedFolderId)
      .then(({ items }) => {
        setVfItems(items);
        const match = items.filter(
          (it) => it.type === 'link' && isLinkMatch(it as KnowledgeFolderLinkItem)
        ).length;
        setVfMatchCounts((prev) => ({ ...prev, [vfSelectedFolderId]: match }));
      })
      .finally(() => setVfLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vfSelectedFolderId, sourceTab, accept]);

  useEffect(() => {
    if (!open || !enableMyUploads || sourceTab !== 'uploads') return;
    const opts = { storageMode: 'asset' as const, uploadSource: 'self' as const, limit: 120 };
    const cached = peekStorageObjectsList(opts);
    const apply = (raw: StorageObjectListItem[]) => {
      const filtered = filterUploadsByAccept(raw, accept);
      setUploadItems(filtered);
      const m = new Map<string | null, number>();
      for (const it of filtered) {
        const fid = it.folderId ?? null;
        m.set(fid, (m.get(fid) ?? 0) + 1);
      }
      setUploadCounts(m);
      if (accept === 'visual') {
        prefetchStorageObjectPreviews(
          filtered.map((it) => ({ id: it.id, url: it.url, contentType: it.contentType })),
          { concurrency: 8 }
        );
      }
    };
    if (cached?.items?.length) {
      apply(cached.items);
      setUploadLoading(false);
    } else {
      setUploadLoading(true);
    }
    void listStorageObjects(opts)
      .then((res) => apply(res.items))
      .catch(() => {
        if (!cached?.items?.length) setUploadItems([]);
      })
      .finally(() => setUploadLoading(false));
  }, [open, enableMyUploads, accept, sourceTab]);

  const vfBreadcrumb = buildKnowledgeFolderBreadcrumb(vfFolders, vfSelectedFolderId);
  const vfDisplayedItems = useMemo(() => {
    const q = vfSearch.trim().toLowerCase();
    return vfItems.filter((it) => {
      if (it.type === 'dir') return !q || it.name.toLowerCase().includes(q);
      if (it.type !== 'link') return false;
      const link = it as KnowledgeFolderLinkItem;
      if (!isLinkMatch(link)) return false;
      if (!q) return true;
      return link.name.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfItems, vfSearch, accept]);

  const filteredUploads = useMemo(() => {
    const inFolder = uploadItems.filter((it) => (it.folderId ?? null) === uploadFolderId);
    const q = uploadSearch.trim().toLowerCase();
    if (!q) return inFolder;
    return inFolder.filter((it) => (it.originalName ?? '').toLowerCase().includes(q));
  }, [uploadItems, uploadFolderId, uploadSearch]);

  const finishPick = (item: MediaPickPayload) => {
    onPick(item);
    if (pickSuccessMessage) message.success(pickSuccessMessage);
    onClose();
  };

  const pickFromKnowledgeFolder = async (link: KnowledgeFolderLinkItem) => {
    try {
      setVfResolvingId(link.id);
      if (accept === 'document') {
        if (documentPickMode === 'url') {
          const objectId = link.object_id ?? link.id;
          if (!objectId) {
            message.error('缺少文件 id');
            return;
          }
          finishPick({
            content: storageObjectPublicUrl(objectId),
            mediaKind: 'document',
            source: 'knowledge-folder',
            sourceLabel: resolveLinkDisplayTitle(link),
          });
          return;
        }
        const text = await resolveKnowledgeFolderText(link);
        finishPick({
          content: text,
          mediaKind: 'document',
          source: 'knowledge-folder',
          sourceLabel: resolveLinkDisplayTitle(link),
          textContent: text,
          sourceTaskId: link.ref_type === 'task' ? (link.task_id ?? link.id) : undefined,
        });
        return;
      }
      if (accept === 'audio') {
        const r = await resolveKnowledgeFolderAudioUrl(link);
        if (!r.url) {
          message.error('无法解析该软链的音频地址');
          return;
        }
        finishPick({
          content: r.url,
          mediaKind: 'audio',
          source: 'knowledge-folder',
          sourceLabel: resolveLinkDisplayTitle(link),
          sourceTaskId: r.sourceTaskId,
        });
        return;
      }
      const resolved = await resolveKnowledgeFolderVisualMedia(link);
      if (!resolved?.url) {
        message.error('无法解析该软链的媒体地址');
        return;
      }
      finishPick({
        content: resolved.url,
        mediaKind: resolved.mediaKind,
        source: 'knowledge-folder',
        sourceLabel: resolveLinkDisplayTitle(link),
        purpose: resolveLinkDisplayTitle(link),
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '选取失败');
    } finally {
      setVfResolvingId(null);
    }
  };

  const pickUpload = async (item: StorageObjectListItem) => {
    const content = normalizeUploadedMediaUrl(item.url || '');
    if (!content.trim()) {
      message.error('该文件缺少可用地址');
      return;
    }
    if (accept === 'document') {
      if (documentPickMode === 'url') {
        finishPick({
          content,
          mediaKind: 'document',
          source: 'asset',
          sourceLabel: item.originalName ?? '已上传管理',
        });
        return;
      }
      setUploadResolvingId(item.id);
      try {
        const blobUrl = await fetchStorageObjectBlobUrl(content, item.id);
        try {
          const res = await fetch(blobUrl);
          if (!res.ok) throw new Error(`读取文件失败 (${res.status})`);
          const blob = await res.blob();
          const file = new File([blob], item.originalName ?? 'document', {
            type: blob.type || item.contentType || 'application/octet-stream',
          });
          const text = (await extractTextFromFile(file)).trim();
          if (!text) throw new Error('文件内容为空');
          finishPick({
            content: text,
            mediaKind: 'document',
            source: 'asset',
            sourceLabel: item.originalName ?? '已上传管理',
            textContent: text,
          });
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : '读取文档失败');
      } finally {
        setUploadResolvingId(null);
      }
      return;
    }
    finishPick({
      content,
      mediaKind: accept === 'audio' ? 'audio' : 'image',
      source: 'asset',
      sourceLabel: item.originalName ?? '已上传管理',
    });
  };

  const emptyVirtualHint =
    accept === 'audio'
      ? '此文件夹暂无可选音频。可切换「已上传管理」，或先把音频加入知识库。'
      : accept === 'document'
        ? '此文件夹暂无可选文档/写作任务。可切换「已上传管理」。'
        : '此文件夹暂无可选图片（音频软链不会出现在此处）。可切换「已上传管理」，或先把图片加入知识库。';

  const uploadSearchPlaceholder =
    accept === 'audio' ? '搜索音频文件名…' : accept === 'document' ? '搜索文档文件名…' : '搜索图片文件名…';

  const uploadEmptyHint =
    accept === 'audio'
      ? '该上传文件夹暂无音频，请先上传 mp3/m4a/wav 等'
      : accept === 'document'
        ? '该上传文件夹暂无文档，请先上传 txt/md/pdf 等'
        : '该上传文件夹暂无图片，请先在资产中心上传';

  const knowledgePanel = (
    <div className="ref-images__panel ref-images__panel--virtual" style={{ display: 'flex', gap: 12, minHeight: 320 }}>
      <aside style={{ width: 200, flexShrink: 0 }}>
        {vfFolders.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            暂无知识库
          </Typography.Text>
        ) : (
          <KnowledgeFolderTreeSidebar
            folders={vfFolders}
            selectedFolderId={vfSelectedFolderId}
            onSelect={setVfSelectedFolderId}
            onDeleteFolder={() => undefined}
            getItemCount={(id) => (id ? vfMatchCounts[id] ?? 0 : 0)}
          />
        )}
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ref-images__panel-head">
          <div className="ref-images__panel-title">
            {vfBreadcrumb.length > 0 ? vfBreadcrumb.map((f) => f.name).join(' / ') : '请选择文件夹'}
          </div>
        </div>
        <Input
          size="small"
          allowClear
          placeholder="搜索名称…"
          value={vfSearch}
          onChange={(e) => setVfSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        {vfSelectedFolderId ? (
          <KnowledgeFolderContentList
            items={vfDisplayedItems}
            loading={vfLoading}
            compact
            textOnly={accept === 'document'}
            emptyDescription={vfSearch.trim() ? '无匹配素材' : emptyVirtualHint}
            resolvingLinkId={vfResolvingId}
            onOpenDir={setVfSelectedFolderId}
            onPickLink={(link) => void pickFromKnowledgeFolder(link)}
          />
        ) : (
          <Typography.Text type="secondary">请从左侧选择知识库</Typography.Text>
        )}
      </div>
    </div>
  );

  const uploadsPanel = (
    <div className="vf-link-picker-upload-layout" style={{ minHeight: 320 }}>
      <aside className="vf-link-picker-upload-sidebar">
        <div className="vf-link-picker-upload-sidebar-title">上传文件夹</div>
        <FolderTreeSidebar
          folders={uploadFolders}
          selectedFolderId={uploadFolderId}
          onSelect={setUploadFolderId}
          onDeleteFolder={() => undefined}
          getItemCount={(id) => uploadCounts.get(id) ?? 0}
          rootLabel="全部（根目录）"
          readOnly
        />
      </aside>
      <div className="vf-link-picker-upload-main">
        <Input
          size="small"
          allowClear
          placeholder={uploadSearchPlaceholder}
          value={uploadSearch}
          onChange={(e) => setUploadSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        {uploadLoading && filteredUploads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <BrandLoading />
          </div>
        ) : filteredUploads.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {uploadSearch.trim() ? '无匹配文件' : uploadEmptyHint}
          </Typography.Text>
        ) : accept === 'visual' ? (
          <div className="ref-images__thumb-grid" style={{ maxHeight: 360 }}>
            {filteredUploads.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ref-images__thumb"
                title={item.originalName ?? undefined}
                onClick={() => void pickUpload(item)}
              >
                <UploadPickerThumb objectId={item.id} contentUrl={item.url} contentType={item.contentType} />
              </button>
            ))}
          </div>
        ) : (
          <ul className="vf-content-list vf-content-list--compact" style={{ maxHeight: 360, overflow: 'auto' }}>
            {filteredUploads.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="vf-content-row"
                  disabled={uploadResolvingId === item.id}
                  onClick={() => void pickUpload(item)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  {accept === 'audio' ? <FileAudio size={16} /> : <FileText size={16} />}
                  <span className="vf-content-row__name">{item.originalName ?? item.id}</span>
                  {uploadResolvingId === item.id ? <BrandLoading size="small" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={Math.min(820, typeof window !== 'undefined' ? window.innerWidth - 32 : 820)}
      destroyOnClose
      className="unified-media-source-virtual-modal"
    >
      {enableMyUploads ? (
        <Tabs
          activeKey={sourceTab}
          onChange={(k) => setSourceTab(k as SourceTab)}
          items={[
            { key: 'knowledge', label: '知识库', children: knowledgePanel },
            { key: 'uploads', label: '已上传管理', children: uploadsPanel },
          ]}
        />
      ) : (
        knowledgePanel
      )}
    </Modal>
  );
}
