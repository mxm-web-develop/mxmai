import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Empty, Input, Modal, Tag } from 'antd';
import BrandLoading from './BrandLoading';
import { AssetGridLoading } from './asset-loading';
import { PartnerAppUploadsPanel } from './PartnerAppUploadsPanel';
import { UploadSourceTabs, type UploadSourceTab } from './UploadSourceTabs';
import {
  createFolder,
  deleteFolder,
  deleteStorageObject,
  getFolders,
  listStorageObjects,
  moveStorageObjectsToFolder,
  peekStorageObjectsList,
  prefetchStorageObjectPreviews,
  uploadAssets,
  type FolderItem,
  type StorageObjectListItem,
  type StorageObjectMode,
} from '../api/client';
import { buildFolderTree, type FolderTreeNode } from '../lib/folderTree';
import { normalizeUploadedMediaUrl } from '../api/client';
import { useAuthMediaPreview } from '../hooks/useAuthMediaPreview';
import {
  AssetCenterPageHeader,
  AssetCenterSidebar,
  AssetStorageModeTabs,
  FolderTreeSidebar,
  StorageMediaCard,
} from './asset-center';
import { PageHint } from './PageHint';

function flattenFolderOptions(folders: FolderItem[], rootLabel: string): { id: string | null; label: string }[] {
  const options: { id: string | null; label: string }[] = [{ id: null, label: rootLabel }];
  const walk = (nodes: FolderTreeNode[], prefix: string) => {
    for (const node of nodes) {
      const label = prefix ? `${prefix} / ${node.folder.name}` : node.folder.name;
      options.push({ id: node.folder.id, label });
      walk(node.children, label);
    }
  };
  walk(buildFolderTree(folders), '');
  return options;
}

function buildFolderCountMap(items: StorageObjectListItem[]): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const item of items) {
    const fid = item.folderId ?? null;
    m.set(fid, (m.get(fid) ?? 0) + 1);
  }
  return m;
}

type UploadView = UploadSourceTab;

const DEFAULT_LIST_OPTIONS = {
  storageMode: 'asset' as StorageObjectMode,
  uploadSource: 'self' as const,
  folderId: null as string | null,
  limit: 100,
};

export function MyUploadsPanel() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadSeqRef = useRef(0);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageObjectMode>('asset');
  const [items, setItems] = useState<StorageObjectListItem[]>(() => {
    const cached = peekStorageObjectsList({
      ...DEFAULT_LIST_OPTIONS,
      folderId: null,
    });
    return cached?.items ?? [];
  });
  const [allAssetItems, setAllAssetItems] = useState<StorageObjectListItem[]>(() => {
    return peekStorageObjectsList({ storageMode: 'asset', uploadSource: 'self', limit: 500 })?.items ?? [];
  });
  const [tempTotal, setTempTotal] = useState(() => {
    return peekStorageObjectsList({ storageMode: 'temp', uploadSource: 'self', limit: 200 })?.total ?? 0;
  });
  const [loading, setLoading] = useState(() => !peekStorageObjectsList(DEFAULT_LIST_OPTIONS));
  const [uploading, setUploading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewItem, setPreviewItem] = useState<StorageObjectListItem | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveObjectIds, setMoveObjectIds] = useState<string[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [uploadView, setUploadView] = useState<UploadView>('self');

  const folderCounts = useMemo(() => buildFolderCountMap(allAssetItems), [allAssetItems]);

  const getItemCount = useCallback(
    (folderId: string | null) => folderCounts.get(folderId) ?? 0,
    [folderCounts]
  );

  const loadFolders = useCallback(async () => {
    setFolders(await getFolders());
  }, []);

  const refreshCounts = useCallback(async (force?: boolean) => {
    const cacheOpts = force ? { force: true } as const : undefined;
    const assetCached = !force
      ? peekStorageObjectsList({ storageMode: 'asset', uploadSource: 'self', limit: 500 })
      : undefined;
    const tempCached = !force
      ? peekStorageObjectsList({ storageMode: 'temp', uploadSource: 'self', limit: 200 })
      : undefined;

    if (assetCached && tempCached) {
      setAllAssetItems(assetCached.items);
      setTempTotal(tempCached.total);
      prefetchStorageObjectPreviews(assetCached.items);
      return;
    }

    const [assetRes, tempRes] = await Promise.all([
      listStorageObjects({ storageMode: 'asset', uploadSource: 'self', limit: 500 }, cacheOpts),
      listStorageObjects({ storageMode: 'temp', uploadSource: 'self', limit: 200 }, cacheOpts),
    ]);
    setAllAssetItems(assetRes.items);
    setTempTotal(tempRes.total);
    prefetchStorageObjectPreviews(assetRes.items);
  }, []);

  const loadList = useCallback(async (force?: boolean) => {
    const listOptions = {
      storageMode,
      uploadSource: 'self' as const,
      folderId: storageMode === 'asset' ? selectedFolderId : undefined,
      limit: 100,
    };
    const cached = !force ? peekStorageObjectsList(listOptions) : undefined;
    if (cached) {
      setItems(cached.items);
      prefetchStorageObjectPreviews(cached.items);
      return;
    }

    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const res = await listStorageObjects(listOptions, force ? { force: true } : undefined);
      if (seq !== loadSeqRef.current) return;
      setItems(res.items);
      prefetchStorageObjectPreviews(res.items);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [storageMode, selectedFolderId]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    if (storageMode === 'asset') void loadFolders();
  }, [storageMode, loadFolders]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const displayedItems = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.originalName || '').toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
    );
  }, [items, searchKeyword]);

  const handleStorageModeChange = (mode: StorageObjectMode) => {
    setItems([]);
    setSelectedIds(new Set());
    setSearchKeyword('');
    setStorageMode(mode);
    if (mode === 'temp') setSelectedFolderId(null);
  };

  const refreshAll = async () => {
    await refreshCounts(true);
    await loadList(true);
  };

  const openFilePicker = (multiple: boolean) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.multiple = multiple;
    input.value = '';
    input.click();
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          const res = await uploadAssets(file, {
            storageMode,
            folderId: storageMode === 'asset' && selectedFolderId ? selectedFolderId : undefined,
            purpose: 'reference',
          });
          if (res.error) throw new Error(res.error);
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      if (ok > 0) message.success(fail > 0 ? t('assets.upload.uploadPartial', { ok, fail }) : t('assets.upload.uploadedCount', { count: ok }));
      await refreshAll();
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      message.warning(t('assets.upload.folderNameRequired'));
      return;
    }
    const res = await createFolder(name, selectedFolderId ?? undefined);
    if (res.error) {
      message.error(res.error);
      return;
    }
    message.success(t('assets.upload.folderCreated'));
    setCreateFolderOpen(false);
    setNewFolderName('');
    await loadFolders();
    await refreshCounts();
  };

  const folderOptions = useMemo(() => flattenFolderOptions(folders, t('assets.knowledgeBase.root')), [folders, t]);

  const openMoveModal = (objectIds: string[]) => {
    if (objectIds.length === 0) return;
    if (storageMode !== 'asset') {
      message.info(t('assets.upload.tempNoMove'));
      return;
    }
    if (folders.length === 0) {
      message.warning(t('assets.upload.createFolderFirst'));
      setCreateFolderOpen(true);
      return;
    }
    setMoveObjectIds(objectIds);
    setMoveTargetFolderId(selectedFolderId);
    setMoveModalOpen(true);
  };

  const handleConfirmMove = async () => {
    if (moveObjectIds.length === 0) return;
    setMoving(true);
    try {
      const res = await moveStorageObjectsToFolder(moveObjectIds, moveTargetFolderId);
      if (res.error) {
        message.error(res.error);
        return;
      }
      message.success(t('assets.upload.movedCount', { count: res.moved ?? moveObjectIds.length }));
      setMoveModalOpen(false);
      setMoveObjectIds([]);
      setSelectedIds(new Set());
      setSelectionMode(false);
      await refreshAll();
    } finally {
      setMoving(false);
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    modal.confirm({
      title: t('assets.upload.deleteFolderTitle'),
      content: t('assets.upload.deleteFolderContent', { name: folder?.name ?? folderId }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        const res = await deleteFolder(folderId);
        if (res.error) {
          message.error(res.error);
          return;
        }
        if (selectedFolderId === folderId) setSelectedFolderId(null);
        message.success(t('assets.upload.folderDeleted'));
        await loadFolders();
        await refreshAll();
      },
    });
  };

  const handleDeleteObject = (item: StorageObjectListItem) => {
    modal.confirm({
      title: t('assets.upload.deleteFileTitle'),
      content: t('assets.upload.deleteFileContent', { name: item.originalName || item.id }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        const res = await deleteStorageObject(item.id);
        if (res.error) {
          message.error(res.error);
          return;
        }
        message.success(t('assets.upload.fileDeleted'));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        await refreshAll();
      },
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    modal.confirm({
      title: t('assets.upload.bulkDeleteTitle'),
      content: t('assets.upload.bulkDeleteContent', { count: selectedIds.size }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        let ok = 0;
        for (const id of selectedIds) {
          const res = await deleteStorageObject(id);
          if (!res.error) ok += 1;
        }
        message.success(t('assets.upload.bulkDeleted', { count: ok }));
        setSelectedIds(new Set());
        setSelectionMode(false);
        await refreshAll();
      },
    });
  };

  const selectedFolder = selectedFolderId
    ? folders.find((f) => f.id === selectedFolderId)
    : null;

  return (
    <section className="page-card asset-center upload-manager-page">
      <div className="upload-manager-source-bar">
        <UploadSourceTabs value={uploadView} onChange={setUploadView} />
        {uploadView === 'self' ? (
          <span className="upload-manager-source-hint muted">
            {t('assets.upload.hintPersonal')}
          </span>
        ) : (
          <span className="upload-manager-source-hint muted">
            {t('assets.upload.hintPartner')}
          </span>
        )}
      </div>

      {uploadView === 'partner' ? (
        <PartnerAppUploadsPanel embedded />
      ) : (
        <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void handleFilesSelected(e.target.files)}
      />

      <AssetCenterPageHeader
        title={t('assets.upload.title')}
        hint={{
          title: t('assets.upload.hintTitle'),
          description: (
            <>
              <p>{t('assets.upload.hintAsset1')}</p>
              <p style={{ marginTop: 8 }}>{t('assets.upload.hintAsset2')}</p>
              <p style={{ marginTop: 8 }}>{t('assets.upload.hintTemp')}</p>
            </>
          ),
        }}
        stats={
          <>
            <Tag color="blue">{t('assets.upload.assetTag', { count: allAssetItems.length })}</Tag>
            <Tag color="orange">{t('assets.upload.tempTag', { count: tempTotal })}</Tag>
          </>
        }
        actions={
          <>
            <Button
              className="asset-center-btn-refresh"
              onClick={() => void refreshAll()}
              disabled={loading}
              loading={loading}
            >
              {t('common.refresh')}
            </Button>
            <Button
              type={selectionMode ? 'primary' : 'default'}
              onClick={() => {
                setSelectionMode((m) => !m);
                if (selectionMode) setSelectedIds(new Set());
              }}
            >
              <span className="ui-label--full">{selectionMode ? t('assets.upload.cancelMultiSelect') : t('assets.upload.multiSelect')}</span>
              <span className="ui-label--short">{selectionMode ? t('assets.upload.cancelShort') : t('assets.upload.multiSelect')}</span>
            </Button>
            {selectionMode && selectedIds.size > 0 ? (
              <>
                {storageMode === 'asset' ? (
                  <Button onClick={() => openMoveModal([...selectedIds])}>
                    {t('assets.upload.moveToFolder', { count: selectedIds.size })}
                  </Button>
                ) : null}
                <Button danger onClick={handleBatchDelete}>
                  {t('assets.upload.deleteSelected', { count: selectedIds.size })}
                </Button>
              </>
            ) : null}
            <Button onClick={() => openFilePicker(false)} disabled={uploading}>
              <span className="ui-label--full">{t('assets.upload.uploadFile')}</span>
              <span className="ui-label--short">{t('assets.upload.uploadFile')}</span>
            </Button>
            <Button onClick={() => openFilePicker(true)} disabled={uploading} loading={uploading}>
              <span className="ui-label--full">{t('assets.upload.batchUpload')}</span>
              <span className="ui-label--short">{t('assets.upload.batchUploadShort')}</span>
            </Button>
          </>
        }
      />

      <div className="asset-center-layout">
        <AssetCenterSidebar
          title={storageMode === 'asset' ? t('assets.upload.assetFolders') : t('assets.upload.tempFiles')}
          modeSlot={
            <AssetStorageModeTabs
              value={storageMode}
              onChange={handleStorageModeChange}
              className="asset-storage-mode-tabs"
            />
          }
          onNewFolder={storageMode === 'asset' ? () => setCreateFolderOpen(true) : undefined}
        >
          {storageMode === 'asset' ? (
            <FolderTreeSidebar
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              onDeleteFolder={handleDeleteFolder}
              getItemCount={getItemCount}
              rootLabel={t('assets.knowledgeBase.root')}
            />
          ) : (
            <p className="asset-sidebar-note">{t('assets.upload.tempHint')}</p>
          )}
        </AssetCenterSidebar>

        <div className="asset-center-main">
          <div className="asset-filters">
            <Input
              placeholder={t('assets.upload.searchPlaceholder')}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 240, maxWidth: '100%' }}
              allowClear
            />
          </div>

          {storageMode === 'asset' && selectedFolder ? (
            <div className="asset-folder-info-bar">
              <span>
                📂 <strong>{selectedFolder.name}</strong>
              </span>
              <span className="muted"> · {t('assets.knowledgeBase.filesCount', { count: getItemCount(selectedFolderId) })}</span>
            </div>
          ) : null}

          {loading ? (
            <AssetGridLoading count={8} />
          ) : displayedItems.length === 0 ? (
            <div className="asset-center-empty">
              <Empty description={searchKeyword ? t('assets.upload.noMatch') : t('assets.upload.empty')}>
                <Button onClick={() => openFilePicker(true)}>{t('assets.upload.uploadFile')}</Button>
              </Empty>
            </div>
          ) : (
            <div className="asset-grid">
              {displayedItems.map((item) => (
                <StorageMediaCard
                  key={item.id}
                  item={item}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={(id) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onPreview={setPreviewItem}
                  onDelete={handleDeleteObject}
                  onMove={
                    storageMode === 'asset'
                      ? (it) => openMoveModal([it.id])
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        title={
          <span className="page-card-title-row">
            {moveObjectIds.length > 1
              ? t('assets.upload.moveTitleMulti', { count: moveObjectIds.length })
              : t('assets.upload.moveTitle')}
            <PageHint title={t('assets.upload.moveHintTitle')} description={t('assets.upload.moveHintDesc')} />
          </span>
        }
        open={moveModalOpen}
        onOk={() => void handleConfirmMove()}
        onCancel={() => {
          setMoveModalOpen(false);
          setMoveObjectIds([]);
        }}
        okText={t('assets.upload.move')}
        cancelText={t('common.cancel')}
        confirmLoading={moving}
      >
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>{t('assets.upload.targetFolder')}</label>
        <select
          className="asset-move-folder-select"
          value={moveTargetFolderId ?? ''}
          onChange={(e) => setMoveTargetFolderId(e.target.value ? e.target.value : null)}
        >
          {folderOptions.map((opt) => (
            <option key={opt.id ?? 'root'} value={opt.id ?? ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </Modal>

      <Modal
        title={t('assets.upload.createFolderTitle')}
        open={createFolderOpen}
        onOk={() => void handleCreateFolder()}
        onCancel={() => {
          setCreateFolderOpen(false);
          setNewFolderName('');
        }}
        okText={t('assets.knowledgeBase.create')}
        cancelText={t('common.cancel')}
      >
        {selectedFolderId ? (
          <p className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
            {t('assets.upload.createAsChild', { name: selectedFolder?.name ?? '' })}
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
            {t('assets.upload.createAtRoot')}
          </p>
        )}
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder={t('assets.knowledgeBase.folderNamePlaceholder')}
          maxLength={50}
          onPressEnter={() => void handleCreateFolder()}
        />
      </Modal>

      <Modal
        title={previewItem?.originalName || t('assets.upload.preview')}
        open={!!previewItem}
        onCancel={() => setPreviewItem(null)}
        footer={null}
        width={720}
        className="asset-preview-modal"
      >
        {previewItem ? <UploadPreviewContent item={previewItem} /> : null}
      </Modal>
        </>
      )}
    </section>
  );
}

function UploadPreviewContent({ item }: { item: StorageObjectListItem }) {
  const { t } = useTranslation();
  const mediaUrl = item.url.startsWith('http') ? item.url : normalizeUploadedMediaUrl(item.url);
  const { previewUrl, loading, failed } = useAuthMediaPreview(mediaUrl, { objectId: item.id });
  if (loading) return <BrandLoading />;
  if (failed || !previewUrl) return <p className="muted">{t('assets.upload.previewFailed')}</p>;
  if (item.contentType?.startsWith('video/')) {
    return <video src={previewUrl} controls className="asset-preview-video" />;
  }
  return <img src={previewUrl} alt="" className="asset-preview-image" />;
}
