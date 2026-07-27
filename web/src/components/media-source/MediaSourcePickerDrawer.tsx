import { useEffect, useMemo, useState } from 'react';
import { App, Button, Drawer, Input, Radio, Space, TreeSelect, Typography } from 'antd';
import { Clock, FolderTree, Globe, Image as ImageIcon, Images, Upload as UploadIcon } from 'lucide-react';
import BrandLoading from '../BrandLoading';
import { PageHint } from '../PageHint';
import { ReferenceImageStockPicker } from '../schema-form/ReferenceImageStockPicker';
import { KnowledgeFolderTreeSidebar } from '../asset-center';
import { KnowledgeFolderContentList } from '../knowledge-base/KnowledgeFolderContentList';
import {
  buildKnowledgeFolderBreadcrumb,
  loadKnowledgeFolderBrowse,
  loadKnowledgeFolderTree,
  peekKnowledgeFolderBrowse,
} from '../schema-fields/voiceoverAudioUtils';
import {
  isVisualKnowledgeFolderLink,
  resolveKnowledgeFolderVisualMedia,
} from '../video-timeline-review/referenceMediaKnowledgeFolderUtils';
import {
  deleteStorageObject,
  getFolders,
  listStorageObjects,
  normalizeUploadedMediaUrl,
  peekStorageObjectsList,
  prefetchStorageObjectPreviews,
  uploadReferenceImageToR2,
  type FolderItem,
  type StockImageItem,
  type StorageObjectListItem,
  type StorageObjectMode,
  type KnowledgeFolderLinkItem,
} from '../../api/client';
import { useAuthMediaPreview } from '../../hooks/useAuthMediaPreview';
import { resolveLinkDisplayTitle } from '../knowledge-base/knowledgeFolderLinkDisplay';
import type { MediaPickPayload, MediaSourcePickerTab } from './types';
import '../schema-form/reference-images.css';
import './unified-media-source.css';

const TEMP_TTL_HINT = '15 分钟';

function isAcceptedMediaFile(file: File, acceptVideos: boolean): boolean {
  if (file.type.startsWith('image/')) return true;
  return acceptVideos && file.type.startsWith('video/');
}

function RecentImageThumb({
  item,
  onSelect,
  onInvalid,
  timeLabel,
}: {
  item: StorageObjectListItem;
  onSelect: () => void;
  onInvalid: () => void;
  timeLabel: string;
}) {
  const { previewUrl, loading, failed } = useAuthMediaPreview(item.url, { objectId: item.id });
  return (
    <button type="button" className="ref-images__thumb" onClick={onSelect}>
      {loading ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandLoading size="small" />
        </div>
      ) : previewUrl && !failed ? (
        <img src={previewUrl} alt={item.originalName ?? ''} onError={() => onInvalid()} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>
          失效
        </div>
      )}
      <span className="ref-images__thumb-time">{timeLabel}</span>
    </button>
  );
}

export type MediaSourcePickerDrawerProps = {
  open: boolean;
  onClose: () => void;
  initialTab?: MediaSourcePickerTab;
  acceptVideos?: boolean;
  enableKnowledgeFolder?: boolean;
  formTaskId?: string;
  closeOnPick?: boolean;
  onPick: (item: MediaPickPayload) => void;
  onUploadStart?: (payload: { mediaKind: 'image' | 'video'; localPreview: string }) => void;
  onUploadEnd?: (payload: MediaPickPayload | null, error?: string) => void;
};

export function MediaSourcePickerDrawer({
  open,
  onClose,
  initialTab = 'upload',
  acceptVideos = false,
  enableKnowledgeFolder = false,
  formTaskId,
  closeOnPick = false,
  onPick,
  onUploadStart,
  onUploadEnd,
}: MediaSourcePickerDrawerProps) {
  const { message } = App.useApp();
  const [tab, setTab] = useState<MediaSourcePickerTab>(initialTab);
  const [stockOpen, setStockOpen] = useState(false);

  const [refStorageMode, setRefStorageMode] = useState<StorageObjectMode>('temp');
  const [refFolderId, setRefFolderId] = useState<string | undefined>();
  const [serverFolders, setServerFolders] = useState<FolderItem[]>([]);
  const [libraryBrowseMode, setLibraryBrowseMode] = useState<StorageObjectMode>('temp');
  const [recentImages, setRecentImages] = useState<StorageObjectListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentRefreshing, setRecentRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [vfFolders, setVfFolders] = useState<Awaited<ReturnType<typeof loadKnowledgeFolderTree>>>([]);
  const [vfSelectedFolderId, setVfSelectedFolderId] = useState<string | null>(null);
  const [vfItems, setVfItems] = useState<Awaited<ReturnType<typeof loadKnowledgeFolderBrowse>>['items']>([]);
  const [vfSearch, setVfSearch] = useState('');
  const [vfLoading, setVfLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (refStorageMode !== 'asset') return;
    let cancelled = false;
    void getFolders().then((list) => {
      if (!cancelled) setServerFolders(list);
    });
    return () => {
      cancelled = true;
    };
  }, [refStorageMode]);

  type FolderTreeNode = { value: string; title: string; children?: FolderTreeNode[] };
  const folderTreeData = useMemo((): FolderTreeNode[] => {
    const build = (parentId: string | null): FolderTreeNode[] =>
      serverFolders
        .filter((f) => (f.parent_id ?? null) === parentId)
        .map((f) => ({ value: f.id, title: f.name, children: build(f.id) }));
    return build(null);
  }, [serverFolders]);

  const loadRecent = (mode: StorageObjectMode) => {
    const opts = { storageMode: mode, uploadSource: 'self' as const, limit: acceptVideos ? 80 : 48 };
    const cached = peekStorageObjectsList(opts);
    const filterMedia = (items: StorageObjectListItem[]) =>
      items.filter(
        (it) =>
          it.contentType?.startsWith('image/') ||
          (acceptVideos && (it.contentType?.startsWith('video/') ?? false))
      );
    const cachedImages = filterMedia(cached?.items ?? []);
    if (cachedImages.length > 0) {
      setRecentImages(cachedImages);
      setRecentLoading(false);
      setRecentRefreshing(true);
    } else {
      setRecentLoading(true);
    }

    return listStorageObjects(opts)
      .then((res) => {
        const images = filterMedia(res.items);
        setRecentImages(images);
        prefetchStorageObjectPreviews(
          images.map((it) => ({ id: it.id, url: it.url, contentType: it.contentType })),
          { concurrency: 8 }
        );
      })
      .catch(() => {
        if (cachedImages.length === 0) setRecentImages([]);
      })
      .finally(() => {
        setRecentLoading(false);
        setRecentRefreshing(false);
      });
  };

  useEffect(() => {
    if (!open || tab !== 'library') return;
    void loadRecent(libraryBrowseMode);
  }, [open, tab, libraryBrowseMode, acceptVideos]);

  useEffect(() => {
    if (!open || tab !== 'knowledge' || !enableKnowledgeFolder) return;
    void loadKnowledgeFolderTree()
      .then((folders) => {
        setVfFolders(folders);
        if (!vfSelectedFolderId && folders[0]?.id) setVfSelectedFolderId(folders[0].id);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : '加载知识库失败'));
  }, [open, tab, enableKnowledgeFolder, message, vfSelectedFolderId]);

  useEffect(() => {
    if (!open || tab !== 'knowledge' || !enableKnowledgeFolder || !vfSelectedFolderId) return;
    const cached = peekKnowledgeFolderBrowse(vfSelectedFolderId);
    if (cached?.items) setVfItems(cached.items);
    setVfLoading(true);
    void loadKnowledgeFolderBrowse(vfSelectedFolderId)
      .then(({ items }) => setVfItems(items))
      .finally(() => setVfLoading(false));
  }, [open, tab, enableKnowledgeFolder, vfSelectedFolderId]);

  const vfBreadcrumb = buildKnowledgeFolderBreadcrumb(vfFolders, vfSelectedFolderId);
  const vfDisplayedItems = vfItems.filter((it) => {
    if (it.type === 'dir') return true;
    if (it.type !== 'link') return false;
    if (!isVisualKnowledgeFolderLink(it as KnowledgeFolderLinkItem)) return false;
    if (!vfSearch.trim()) return true;
    return (it as KnowledgeFolderLinkItem).name.toLowerCase().includes(vfSearch.trim().toLowerCase());
  });

  const finishPick = (item: MediaPickPayload) => {
    onPick(item);
    message.success('已加入素材列表');
    if (closeOnPick) onClose();
  };

  const formatRelativeTime = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  };

  const selectRecentImage = (item: StorageObjectListItem) => {
    const content = normalizeUploadedMediaUrl(item.url || '');
    if (!content.trim()) {
      message.error('该资产缺少可用地址');
      return;
    }
    const mediaKind: 'image' | 'video' = item.contentType?.startsWith('video/') ? 'video' : 'image';
    finishPick({
      content,
      mediaKind,
      source: 'asset',
      sourceLabel: item.originalName ?? '我的资产',
    });
  };

  const pickFromKnowledgeFolder = async (link: KnowledgeFolderLinkItem) => {
    try {
      const resolved = await resolveKnowledgeFolderVisualMedia(link);
      if (!resolved?.url) {
        message.error('无法解析该软链的媒体地址');
        return;
      }
      const displayTitle = resolveLinkDisplayTitle(link);
      finishPick({
        content: resolved.url,
        mediaKind: resolved.mediaKind,
        source: 'knowledge-folder',
        sourceLabel: displayTitle,
        purpose: displayTitle,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '选取失败');
    }
  };

  const selectStockImage = (item: StockImageItem) => {
    finishPick({
      content: item.imageUrl,
      mediaKind: 'image',
      source: 'stock',
      sourceLabel: item.title,
      purpose: item.title,
    });
    setStockOpen(false);
  };

  const uploadFile = async (file: File) => {
    const mediaKind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    const localPreview = URL.createObjectURL(file);
    onUploadStart?.({ mediaKind, localPreview });
    setUploading(true);
    try {
      const r2Result = await uploadReferenceImageToR2(file, {
        storageMode: refStorageMode,
        folderId: refStorageMode === 'asset' ? refFolderId : undefined,
        taskId: refStorageMode === 'temp' ? formTaskId : undefined,
        purpose: 'reference',
      });
      const payload: MediaPickPayload = {
        content: r2Result.url,
        mediaKind,
        source: 'upload',
        sourceLabel: file.name,
      };
      onUploadEnd?.(payload);
      finishPick(payload);
      if (tab === 'library' && refStorageMode === libraryBrowseMode) {
        void loadRecent(libraryBrowseMode);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      onUploadEnd?.(null, err);
      message.error(`上传失败：${err}`);
    } finally {
      URL.revokeObjectURL(localPreview);
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptVideos ? 'image/*,video/mp4,video/quicktime,video/webm' : 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && isAcceptedMediaFile(file, acceptVideos)) void uploadFile(file);
    };
    input.click();
  };

  return (
    <>
      <Drawer
        title={acceptVideos ? '添加参考素材' : '添加素材'}
        open={open}
        onClose={onClose}
        width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 32 : 720)}
        destroyOnClose
        className="unified-media-source-drawer"
      >
        <div className="ref-images__source-bar" style={{ marginBottom: 12 }}>
          <div className="ref-images__source-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'upload'}
              className={`ref-images__source-tab${tab === 'upload' ? ' ref-images__source-tab--active' : ''}`}
              onClick={() => setTab('upload')}
            >
              <UploadIcon size={15} />
              本地上传
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'library'}
              className={`ref-images__source-tab${tab === 'library' ? ' ref-images__source-tab--active' : ''}`}
              onClick={() => setTab('library')}
            >
              <Images size={15} />
              {acceptVideos ? '我的资产' : '我的图片'}
            </button>
            {enableKnowledgeFolder ? (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'knowledge'}
                className={`ref-images__source-tab${tab === 'knowledge' ? ' ref-images__source-tab--active' : ''}`}
                onClick={() => setTab('knowledge')}
              >
                <FolderTree size={15} />
                知识库
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stock'}
              className={`ref-images__source-tab${tab === 'stock' ? ' ref-images__source-tab--active' : ''}`}
              onClick={() => setTab('stock')}
            >
              <Globe size={15} />
              免费图库
            </button>
          </div>
        </div>

        {tab === 'upload' ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div className="ref-images__upload-settings">
              <div className="page-card-title-row" style={{ marginBottom: 6 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  存储方式
                </Typography.Text>
                {refStorageMode === 'temp' ? (
                  <PageHint
                    tone="warning"
                    title="临时存储"
                    description={`仅保留约 ${TEMP_TTL_HINT}，任务结束或到期后自动删除。`}
                  />
                ) : null}
              </div>
              <Radio.Group
                value={refStorageMode}
                onChange={(e) => {
                  setRefStorageMode(e.target.value);
                  if (e.target.value === 'temp') setRefFolderId(undefined);
                }}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="temp">仅本次临时</Radio.Button>
                <Radio.Button value="asset">存入资产</Radio.Button>
              </Radio.Group>
              {refStorageMode === 'asset' ? (
                <TreeSelect
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="选择资产文件夹（可选）"
                  allowClear
                  treeData={folderTreeData}
                  value={refFolderId}
                  onChange={(v) => setRefFolderId(v as string | undefined)}
                  treeDefaultExpandAll
                />
              ) : null}
            </div>

            <div
              className="ref-images__dropzone ref-images__dropzone--initial"
              onClick={uploading ? undefined : triggerFileInput}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploading) return;
                const file = e.dataTransfer.files?.[0];
                if (file && isAcceptedMediaFile(file, acceptVideos)) void uploadFile(file);
              }}
              style={{ cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1 }}
            >
              {uploading ? (
                <BrandLoading />
              ) : (
                <Space direction="vertical" size={6} align="center">
                  <ImageIcon size={22} />
                  <Typography.Text type="secondary">
                    {acceptVideos ? '拖拽图片/视频到此处，或点击选择文件' : '拖拽图片到此处，或点击选择文件'}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    上传后将加入上方素材列表
                  </Typography.Text>
                </Space>
              )}
            </div>
          </Space>
        ) : null}

        {tab === 'library' ? (
          <div className="ref-images__panel">
            <div className="ref-images__panel-head">
              <div className="ref-images__panel-title">
                <Clock size={16} />
                最近上传
                <span className="ref-images__panel-badge ref-images__panel-badge--muted">
                  {libraryBrowseMode === 'temp' ? '临时' : '资产'}
                </span>
              </div>
              <Button size="small" loading={recentRefreshing} onClick={() => void loadRecent(libraryBrowseMode)}>
                刷新
              </Button>
            </div>
            <div className="ref-images__browse-row">
              <Radio.Group
                size="small"
                value={libraryBrowseMode}
                onChange={(e) => setLibraryBrowseMode(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="temp">临时</Radio.Button>
                <Radio.Button value="asset">资产</Radio.Button>
              </Radio.Group>
            </div>
            {recentLoading && recentImages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <BrandLoading />
              </div>
            ) : recentImages.length === 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                暂无素材，请先在「本地上传」中添加
              </Typography.Text>
            ) : (
              <div className="ref-images__thumb-grid">
                {recentImages.map((item) =>
                  item.contentType?.startsWith('video/') ? (
                    <button key={item.id} type="button" className="ref-images__thumb" onClick={() => selectRecentImage(item)}>
                      <video src={item.url || ''} muted playsInline preload="metadata" />
                      <span className="ref-images__thumb-time">视频</span>
                    </button>
                  ) : (
                    <RecentImageThumb
                      key={item.id}
                      item={item}
                      timeLabel={formatRelativeTime(item.createdAt)}
                      onSelect={() => selectRecentImage(item)}
                      onInvalid={() => {
                        void (async () => {
                          try {
                            await deleteStorageObject(item.id);
                          } catch {
                            /* ignore */
                          }
                          setRecentImages((prev) => prev.filter((img) => img.id !== item.id));
                        })();
                      }}
                    />
                  )
                )}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'knowledge' && enableKnowledgeFolder ? (
          <div className="ref-images__panel ref-images__panel--virtual" style={{ display: 'flex', gap: 12, minHeight: 280 }}>
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
                  getItemCount={() => 0}
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
                  emptyDescription={vfSearch.trim() ? '无匹配素材' : '此文件夹暂无可选图片/视频'}
                  onOpenDir={setVfSelectedFolderId}
                  onPickLink={(link) => void pickFromKnowledgeFolder(link)}
                />
              ) : (
                <Typography.Text type="secondary">请从左侧选择知识库</Typography.Text>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'stock' ? (
          <div className="ref-images__panel">
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
              搜索 Pexels / Unsplash 等免费图库。视频请使用「免费视频库」标签或开启自动配视频。
            </Typography.Paragraph>
            <Button type="primary" onClick={() => setStockOpen(true)}>
              打开免费图库搜索
            </Button>
          </div>
        ) : null}
      </Drawer>

      <ReferenceImageStockPicker
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        onSelect={selectStockImage}
      />
    </>
  );
}
