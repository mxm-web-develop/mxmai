import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Empty, Input, Modal, Select, Tag } from 'antd';
import { AssetGridLoading } from './asset-loading';
import {
  deleteStorageObject,
  listPartnerAppEndUsers,
  listPartnerApps,
  listStorageObjects,
  type PartnerAppItem,
  type PartnerEndUserItem,
  type StorageObjectListItem,
} from '../api/client';
import { normalizeUploadedMediaUrl } from '../api/client';
import { useAuthMediaPreview } from '../hooks/useAuthMediaPreview';
import { AssetCenterPageHeader, StorageMediaCard } from './asset-center';
import { PageHint } from './PageHint';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

type Props = {
  /** 固定应用 ID（Integration 抽屉内使用） */
  fixedPartnerAppId?: string | null;
  embedded?: boolean;
};

export function PartnerAppUploadsPanel({ fixedPartnerAppId, embedded }: Props) {
  const { message, modal } = App.useApp();
  const loadSeqRef = useRef(0);

  const [apps, setApps] = useState<PartnerAppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(fixedPartnerAppId ?? null);
  const [endUsers, setEndUsers] = useState<PartnerEndUserItem[]>([]);
  const [selectedEndUserId, setSelectedEndUserId] = useState<string | null>(null);
  const [items, setItems] = useState<StorageObjectListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<StorageObjectListItem | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');

  const effectiveAppId = fixedPartnerAppId ?? selectedAppId;

  useEffect(() => {
    if (fixedPartnerAppId) return;
    void listPartnerApps().then((res) => {
      const list = (res.data as { data?: PartnerAppItem[] } | undefined)?.data ?? [];
      setApps(list);
      if (!selectedAppId && list.length > 0) {
        setSelectedAppId(list[0].id);
      }
    });
  }, [fixedPartnerAppId, selectedAppId]);

  useEffect(() => {
    if (!effectiveAppId) {
      setEndUsers([]);
      return;
    }
    void listPartnerAppEndUsers(effectiveAppId, 30, 200).then((res) => {
      const body = res.data as { data?: PartnerEndUserItem[] } | undefined;
      setEndUsers(body?.data ?? []);
    });
  }, [effectiveAppId]);

  const loadList = useCallback(async () => {
    if (!effectiveAppId) {
      setItems([]);
      setTotal(0);
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const res = await listStorageObjects({
        uploadSource: 'partner',
        partnerAppId: effectiveAppId,
        partnerEndUserId: selectedEndUserId ?? undefined,
        storageMode: 'temp',
        limit: 100,
      });
      if (seq !== loadSeqRef.current) return;
      setItems(res.items);
      setTotal(res.total);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [effectiveAppId, selectedEndUserId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const displayedItems = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.originalName || '').toLowerCase().includes(q) ||
        (it.endUserLabel || '').toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
    );
  }, [items, searchKeyword]);

  const handleDeleteObject = (item: StorageObjectListItem) => {
    modal.confirm({
      title: '删除应用用户上传',
      content: `确定删除「${item.originalName || item.id}」？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await deleteStorageObject(item.id);
        if (res.error) {
          message.error(toUserFacingErrorMessage(res.error));
          return;
        }
        message.success('已删除');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        await loadList();
      },
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    modal.confirm({
      title: '批量删除',
      content: `确定删除已选的 ${selectedIds.size} 个应用用户上传？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        let ok = 0;
        for (const id of selectedIds) {
          const res = await deleteStorageObject(id);
          if (!res.error) ok += 1;
        }
        message.success(`已删除 ${ok} 项`);
        setSelectedIds(new Set());
        setSelectionMode(false);
        await loadList();
      },
    });
  };

  const header = embedded ? null : (
    <AssetCenterPageHeader
      title="应用用户上传"
      hint={{
        title: '说明',
        description: (
          <>
            <p>此处为第三方应用终端用户通过 Partner Session 上传的临时文件，与你的个人资产/临时文件分开管理。</p>
            <p style={{ marginTop: 8 }}>不可移动到资产文件夹；清理策略与个人临时文件一致（TTL / 任务完成）。</p>
          </>
        ),
      }}
      stats={<Tag color="purple">共 {total} 项</Tag>}
      actions={
        <>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => void loadList()}
            disabled={loading}
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
          <button
            type="button"
            className={`btn-secondary btn-small ${selectionMode ? 'btn-active' : ''}`}
            onClick={() => {
              setSelectionMode((m) => !m);
              if (selectionMode) setSelectedIds(new Set());
            }}
          >
            {selectionMode ? '取消多选' : '多选'}
          </button>
          {selectionMode && selectedIds.size > 0 ? (
            <button type="button" className="btn-danger btn-small" onClick={handleBatchDelete}>
              删除已选 ({selectedIds.size})
            </button>
          ) : null}
        </>
      }
    />
  );

  return (
    <div className={embedded ? '' : 'page-card asset-center upload-manager-page'}>
      {header}

      <div className="asset-filters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        {!fixedPartnerAppId ? (
          <Select
            placeholder="选择应用"
            style={{ minWidth: 220 }}
            value={selectedAppId ?? undefined}
            onChange={(v) => {
              setSelectedAppId(v);
              setSelectedEndUserId(null);
            }}
            options={apps.map((a) => ({ value: a.id, label: a.name }))}
          />
        ) : null}
        <Select
          allowClear
          placeholder="全部终端用户"
          style={{ minWidth: 200 }}
          value={selectedEndUserId ?? undefined}
          onChange={(v) => setSelectedEndUserId(v ?? null)}
          options={endUsers.map((u) => ({
            value: u.id,
            label: u.phone_masked ?? u.display_name ?? u.id.slice(0, 8),
          }))}
        />
        <Input
          placeholder="搜索文件名、用户…"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
      </div>

      {!effectiveAppId ? (
        <Empty description="请先创建并绑定 integration Key 的 Partner 应用" />
      ) : loading ? (
        <AssetGridLoading count={8} />
      ) : displayedItems.length === 0 ? (
        <Empty description={searchKeyword ? '无匹配文件' : '暂无应用用户上传'} />
      ) : (
        <div className="asset-grid">
          {displayedItems.map((item) => (
            <div key={item.id} className="partner-upload-card-wrap">
              {item.endUserLabel ? (
                <Tag color="geekblue" style={{ marginBottom: 4 }}>
                  {item.endUserLabel}
                </Tag>
              ) : null}
              <StorageMediaCard
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
              />
            </div>
          ))}
        </div>
      )}

      <Modal
        title={previewItem?.originalName || '预览'}
        open={!!previewItem}
        onCancel={() => setPreviewItem(null)}
        footer={null}
        width={720}
        className="asset-preview-modal"
      >
        {previewItem ? <PartnerUploadPreviewContent item={previewItem} /> : null}
      </Modal>
    </div>
  );
}

function PartnerUploadPreviewContent({ item }: { item: StorageObjectListItem }) {
  const mediaUrl = item.url.startsWith('http') ? item.url : normalizeUploadedMediaUrl(item.url);
  const { previewUrl, loading, failed } = useAuthMediaPreview(mediaUrl, { objectId: item.id });
  if (loading) return <p className="muted">加载中…</p>;
  if (failed || !previewUrl) return <p className="muted">无法加载预览</p>;
  if (item.contentType?.startsWith('video/')) {
    return <video src={previewUrl} controls className="asset-preview-video" />;
  }
  return <img src={previewUrl} alt="" className="asset-preview-image" />;
}

export function PartnerUploadsEmbeddedHint() {
  return (
    <PageHint
      title="应用用户上传"
      description="Partner 终端用户上传的临时参考图/附件，与个人资产分开；不可移入资产中心。"
    />
  );
}
