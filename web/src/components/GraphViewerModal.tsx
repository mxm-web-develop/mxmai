/**
 * 图片任务查看弹窗
 *
 * - 全屏遮罩，居中展示当前图片
 * - 支持缩放（滚轮 / 按钮）与拖拽平移
 * - 若有多张图片，底部缩略图可切换
 * - 内容 / 查看数据 两个 Tab 与原来保持一致
 */

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderInput,
  ImageOff,
  LayoutGrid,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { WritingTaskItem } from '../api/client';
import { MediaLoadingState } from './MediaLoadingState';
import { TaskProgressStage } from './TaskProgressStage';
import {
  MediaViewerHeader,
  MediaViewerHeaderDivider,
  MediaViewerHeaderIconButton,
  MediaViewerHeaderLabel,
  MediaViewerHeaderToolGroup,
  MediaViewerToolbarScroll,
} from './MediaViewerHeader';
import { useAdminGatedViewerMode } from './viewer/useAdminGatedViewerMode';
import { MoveTasksToKnowledgeFolderModal } from './task-list/MoveTasksToKnowledgeFolderModal';

export type GraphViewerNavigation = {
  current: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

type AlbumGalleryItem = {
  id: string;
  title?: string;
  order?: number;
  status?: string;
  imageUrl?: string;
  error?: string;
  childTaskId?: string;
};

interface GraphViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  task: WritingTaskItem | null;
  mediaUrls: string[];
  loading?: boolean;
  error?: string | null;
  navigation?: GraphViewerNavigation;
  /** album：网格画廊为主；single：单图查看（默认） */
  variant?: 'single' | 'album';
  /** 图集失败项重试（同步等待） */
  onRetryAlbumItem?: (itemId: string) => Promise<void>;
  /** 图集单项删除 */
  onRemoveAlbumItem?: (itemId: string) => Promise<void>;
}

export function GraphViewerModal({
  visible,
  onClose,
  title,
  task,
  mediaUrls,
  loading,
  error,
  navigation,
  variant = 'single',
  onRetryAlbumItem,
  onRemoveAlbumItem,
}: GraphViewerModalProps) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const isAlbum = variant === 'album';
  const { viewMode, setViewMode } = useAdminGatedViewerMode<'content' | 'raw'>('content');
  /** 图集：grid 网格 / focus 单张放大 */
  const [albumPane, setAlbumPane] = useState<'grid' | 'focus'>('grid');
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);
  const [retryErrorByItem, setRetryErrorByItem] = useState<Record<string, string>>({});
  const [moveTaskIds, setMoveTaskIds] = useState<string[] | null>(null);
  const [removingItem, setRemovingItem] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  // blob URL 由 mediaBlobCache 统一管理，此处不得 revoke（否则切换任务/关闭弹窗会破坏会话缓存）

  // 仅在「换了一批图」或「内容/raw 切换」时重置视图；不得依赖 zoom/offset/activeIndex，
  // 否则用户一点击放大缩小就会立刻被 effect 打回 100%。
  useEffect(() => {
    setActiveIndex(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setAlbumPane(isAlbum ? 'grid' : 'focus');
  }, [mediaUrls.join('|'), viewMode, isAlbum]);

  useEffect(() => {
    setImageReady(false);
  }, [activeIndex, mediaUrls[activeIndex]]);

  const albumItems = (() => {
    const meta = (task?.metadata ?? {}) as Record<string, unknown>;
    const fromResult = (task?.result as { metadata?: Record<string, unknown> } | undefined)?.metadata
      ?.albumResult;
    const raw = meta.albumResult ?? fromResult;
    if (!raw || typeof raw !== 'object') return null;
    const items = (raw as { items?: unknown }).items;
    if (!Array.isArray(items) || !items.length) return null;
    return items
      .map((rawItem, idx) => {
        if (!rawItem || typeof rawItem !== 'object') return null;
        const it = rawItem as Record<string, unknown>;
        const id =
          typeof it.id === 'string' && it.id.trim()
            ? it.id.trim()
            : `album-item-${idx}`;
        return {
          id,
          title: typeof it.title === 'string' ? it.title : undefined,
          order: typeof it.order === 'number' ? it.order : idx + 1,
          status: typeof it.status === 'string' ? it.status : undefined,
          imageUrl: typeof it.imageUrl === 'string' ? it.imageUrl : undefined,
          error: typeof it.error === 'string' ? it.error : undefined,
          childTaskId: typeof it.childTaskId === 'string' ? it.childTaskId : undefined,
        } satisfies AlbumGalleryItem;
      })
      .filter((it): it is AlbumGalleryItem => !!it)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  })();

  /** 与 mediaUrls 对齐：只取已成功出图的条目（顺序 = storage index） */
  const readyAlbumItems =
    albumItems?.filter((it) => it.status === 'ready' || !!it.imageUrl) ?? null;

  const activeAlbumChildTaskId = useMemo(() => {
    if (!isAlbum || !readyAlbumItems?.length) return undefined;
    const row = readyAlbumItems[activeIndex];
    return row?.childTaskId;
  }, [activeIndex, isAlbum, readyAlbumItems]);

  const activeAlbumItem = useMemo(() => {
    if (!isAlbum || !readyAlbumItems?.length) return null;
    return readyAlbumItems[activeIndex] ?? null;
  }, [activeIndex, isAlbum, readyAlbumItems]);

  const openMoveAlbum = () => {
    if (!task?.id) return;
    setMoveTaskIds([task.id]);
  };

  const openMoveActiveImage = () => {
    if (activeAlbumChildTaskId) {
      setMoveTaskIds([activeAlbumChildTaskId]);
      return;
    }
    message.warning(t('common.viewer.graph.moveImageUnavailable'));
  };

  const handleRemoveActiveImage = () => {
    if (!onRemoveAlbumItem || !activeAlbumItem || removingItem) return;
    modal.confirm({
      title: t('common.viewer.graph.deleteImageConfirmTitle'),
      content: t('common.viewer.graph.deleteImageConfirmContent', {
        title: activeAlbumItem.title || activeAlbumItem.id,
      }),
      okText: t('common.viewer.graph.deleteImage'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        setRemovingItem(true);
        try {
          await onRemoveAlbumItem(activeAlbumItem.id);
          message.success(t('common.viewer.graph.deleteImageSuccess'));
        } catch (err) {
          message.error(
            err instanceof Error ? err.message : t('common.viewer.graph.deleteImageFailed')
          );
          throw err;
        } finally {
          setRemovingItem(false);
        }
      },
    });
  };

  const albumFailedCount = (() => {
    const meta = (task?.metadata ?? {}) as Record<string, unknown>;
    const fromResult = (task?.result as { metadata?: Record<string, unknown> } | undefined)?.metadata;
    const n = meta.albumFailedCount ?? fromResult?.albumFailedCount;
    return typeof n === 'number' && n > 0
      ? n
      : albumItems
        ? albumItems.filter((it) => it.status === 'failed' || (!it.imageUrl && it.status !== 'ready'))
            .length
        : 0;
  })();

  const albumTotalCount = albumItems?.length ?? mediaUrls.length;

  const activeAlbumCaption = (() => {
    const rows = readyAlbumItems?.length ? readyAlbumItems : albumItems;
    if (!rows?.length || mediaUrls.length <= 1) return null;
    const row = rows[activeIndex];
    const caption = row?.title?.trim();
    const n = typeof row?.order === 'number' ? row.order : activeIndex + 1;
    const total = albumTotalCount;
    return caption ? `${n}/${total} · ${caption}` : `${activeIndex + 1}/${mediaUrls.length}`;
  })();

  const handleRetryAlbumItem = async (itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!onRetryAlbumItem || retryingItemId) return;
    setRetryingItemId(itemId);
    setRetryErrorByItem((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    try {
      await onRetryAlbumItem(itemId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRetryErrorByItem((prev) => ({ ...prev, [itemId]: msg }));
    } finally {
      setRetryingItemId(null);
    }
  };

  const taskStatus = task?.status ?? '';
  const isTaskIncomplete =
    Boolean(task) &&
    taskStatus !== 'completed' &&
    taskStatus !== 'failed' &&
    taskStatus !== 'cancelled';
  const hasResultMedia = mediaUrls.length > 0;
  const isTaskFailed = (taskStatus === 'failed' || taskStatus === 'cancelled') && !hasResultMedia;
  const showPartialFailBanner =
    hasResultMedia && (albumFailedCount > 0 || taskStatus === 'failed' || taskStatus === 'cancelled');

  const clampZoom = (value: number) => {
    const MIN = 0.5;
    const MAX = 4;
    if (value < MIN) return MIN;
    if (value > MAX) return MAX;
    return Number(value.toFixed(2));
  };

  const showFocusStage = !isAlbum || albumPane === 'focus';

  // React 的 onWheel 默认 passive，无法 preventDefault；用原生监听 { passive: false } 避免整页跟滚 + 控制台告警
  useEffect(() => {
    if (!visible || viewMode !== 'content' || mediaUrls.length === 0 || !showFocusStage) return;
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom((z) => clampZoom(z + delta));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [visible, viewMode, mediaUrls.length, showFocusStage]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isAlbum && albumPane === 'focus') {
          setAlbumPane('grid');
          handleResetView();
          return;
        }
        onClose();
        return;
      }
      if (isAlbum && albumPane === 'focus' && mediaUrls.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setActiveIndex((i) => (i > 0 ? i - 1 : mediaUrls.length - 1));
          setZoom(1);
          setOffset({ x: 0, y: 0 });
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setActiveIndex((i) => (i < mediaUrls.length - 1 ? i + 1 : 0));
          setZoom(1);
          setOffset({ x: 0, y: 0 });
          return;
        }
      }
      const nav = navigationRef.current;
      if (!nav) return;
      if (e.key === 'ArrowLeft' && nav.canPrev) {
        e.preventDefault();
        nav.onPrev();
      } else if (e.key === 'ArrowRight' && nav.canNext) {
        e.preventDefault();
        nav.onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onClose, isAlbum, albumPane, mediaUrls.length]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'content') return;
    e.preventDefault();
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !lastPos) return;
    e.preventDefault();
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    setLastPos({ x: e.clientX, y: e.clientY });
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastPos(null);
  };

  const handleResetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleZoomIn = () => setZoom((z) => clampZoom(z + 0.25));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - 0.25));

  const handleDownloadCurrent = async () => {
    const url = mediaUrls[activeIndex];
    if (!url || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const mime = blob.type || '';
      const ext = mime.includes('png')
        ? 'png'
        : mime.includes('webp')
          ? 'webp'
          : mime.includes('jpeg') || mime.includes('jpg')
            ? 'jpg'
            : 'png';
      const base = task?.id ? `graph-${task.id}` : 'graph-result';
      const name = `${base}-${activeIndex + 1}.${ext}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.alert(t('common.viewer.downloadFailed'));
    } finally {
      setDownloadBusy(false);
    }
  };

  if (!visible) return null;

  const statusLabels: Record<string, string> = {
    pending: t('common.task.status.pending'),
    queued: t('common.task.status.queued'),
    processing: t('common.task.status.processing'),
    failed: t('common.task.status.failed'),
    cancelled: t('common.task.status.cancelled'),
  };

  return (
    <div
      className="graph-viewer-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="graph-viewer-modal">
        <MediaViewerHeader
          title={
            isAlbum && albumPane === 'grid'
              ? `${title || t('common.viewer.graph.albumTitle')} · ${t('common.viewer.graph.albumBadge', {
                  count: albumTotalCount || mediaUrls.length,
                })}`
              : activeAlbumCaption
                ? `${title || t('common.viewer.graph.title')} · ${activeAlbumCaption}`
                : title || t('common.viewer.graph.title')
          }
          tabs={[
            { value: 'content', label: t('common.viewer.tabs.content') },
            { value: 'raw', label: t('common.viewer.tabs.data') },
          ]}
          activeTab={viewMode}
          onTabChange={(tab) => setViewMode(tab as 'content' | 'raw')}
          onClose={onClose}
          closeTitle={t("common.viewer.closeEsc")}
        >
          {viewMode === 'content' ? (
            <MediaViewerToolbarScroll>
              {isAlbum && albumPane === 'focus' ? (
                <>
                  <MediaViewerHeaderDivider />
                  <MediaViewerHeaderIconButton
                    onClick={() => {
                      setAlbumPane('grid');
                      handleResetView();
                    }}
                    aria-label={t('common.viewer.graph.albumBackGrid')}
                    title={t('common.viewer.graph.albumBackGrid')}
                  >
                    <LayoutGrid size={14} strokeWidth={2} aria-hidden />
                  </MediaViewerHeaderIconButton>
                  {mediaUrls.length > 1 ? (
                    <MediaViewerHeaderToolGroup aria-label={t('common.viewer.graph.switchImages')}>
                      <MediaViewerHeaderIconButton
                        onClick={() => {
                          setActiveIndex((i) => (i > 0 ? i - 1 : mediaUrls.length - 1));
                          handleResetView();
                        }}
                        aria-label={t('common.viewer.graph.prevImage')}
                        title={t('common.viewer.graph.prevImageTitle')}
                      >
                        <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                      </MediaViewerHeaderIconButton>
                      <MediaViewerHeaderLabel>
                        {activeIndex + 1} / {mediaUrls.length}
                      </MediaViewerHeaderLabel>
                      <MediaViewerHeaderIconButton
                        onClick={() => {
                          setActiveIndex((i) => (i < mediaUrls.length - 1 ? i + 1 : 0));
                          handleResetView();
                        }}
                        aria-label={t('common.viewer.graph.nextImage')}
                        title={t('common.viewer.graph.nextImageTitle')}
                      >
                        <ChevronRight size={14} strokeWidth={2} aria-hidden />
                      </MediaViewerHeaderIconButton>
                    </MediaViewerHeaderToolGroup>
                  ) : null}
                </>
              ) : null}

              {!isAlbum && navigation && navigation.total > 1 ? (
                <>
                  <MediaViewerHeaderDivider />
                  <MediaViewerHeaderToolGroup aria-label={t("common.viewer.graph.switchImages")}>
                    <MediaViewerHeaderIconButton
                      disabled={!navigation.canPrev}
                      onClick={navigation.onPrev}
                      aria-label={t("common.viewer.graph.prevImage")}
                      title={t("common.viewer.graph.prevImageTitle")}
                    >
                      <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                    </MediaViewerHeaderIconButton>
                    <MediaViewerHeaderLabel>
                      {navigation.current} / {navigation.total}
                    </MediaViewerHeaderLabel>
                    <MediaViewerHeaderIconButton
                      disabled={!navigation.canNext}
                      onClick={navigation.onNext}
                      aria-label={t("common.viewer.graph.nextImage")}
                      title={t("common.viewer.graph.nextImageTitle")}
                    >
                      <ChevronRight size={14} strokeWidth={2} aria-hidden />
                    </MediaViewerHeaderIconButton>
                  </MediaViewerHeaderToolGroup>
                </>
              ) : null}

              {showFocusStage ? (
                <>
                  <MediaViewerHeaderDivider />
                  <MediaViewerHeaderToolGroup aria-label={t("common.viewer.graph.zoom")}>
                    <MediaViewerHeaderIconButton onClick={handleZoomOut} aria-label={t("common.viewer.graph.zoomOut")} title={t("common.viewer.graph.zoomOut")}>
                      <Minus size={14} strokeWidth={2} aria-hidden />
                    </MediaViewerHeaderIconButton>
                    <MediaViewerHeaderLabel>{Math.round(zoom * 100)}%</MediaViewerHeaderLabel>
                    <MediaViewerHeaderIconButton onClick={handleZoomIn} aria-label={t("common.viewer.graph.zoomIn")} title={t("common.viewer.graph.zoomIn")}>
                      <Plus size={14} strokeWidth={2} aria-hidden />
                    </MediaViewerHeaderIconButton>
                    <MediaViewerHeaderIconButton
                      onClick={handleResetView}
                      aria-label={t("common.viewer.graph.resetView")}
                      title={t("common.viewer.graph.resetView")}
                    >
                      <RotateCcw size={14} strokeWidth={2} aria-hidden />
                    </MediaViewerHeaderIconButton>
                  </MediaViewerHeaderToolGroup>

                  <MediaViewerHeaderDivider />
                  <MediaViewerHeaderIconButton
                    onClick={() => void handleDownloadCurrent()}
                    disabled={downloadBusy || !mediaUrls[activeIndex]}
                    aria-label={t("common.viewer.graph.downloadCurrent")}
                    title={downloadBusy ? t("common.viewer.downloading") : t("common.viewer.graph.downloadCurrent")}
                  >
                    <Download size={15} strokeWidth={2} aria-hidden />
                  </MediaViewerHeaderIconButton>
                  {isAlbum ? (
                    <>
                      <MediaViewerHeaderIconButton
                        onClick={openMoveActiveImage}
                        aria-label={t('common.viewer.graph.moveImage')}
                        title={t('common.viewer.graph.moveImage')}
                      >
                        <FolderInput size={15} strokeWidth={2} aria-hidden />
                      </MediaViewerHeaderIconButton>
                      {onRemoveAlbumItem ? (
                        <MediaViewerHeaderIconButton
                          onClick={handleRemoveActiveImage}
                          disabled={removingItem || !activeAlbumItem}
                          aria-label={t('common.viewer.graph.deleteImage')}
                          title={t('common.viewer.graph.deleteImage')}
                        >
                          <Trash2 size={15} strokeWidth={2} aria-hidden />
                        </MediaViewerHeaderIconButton>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <MediaViewerHeaderDivider />
                  <MediaViewerHeaderLabel>
                    {t('common.viewer.graph.albumGridHint')}
                  </MediaViewerHeaderLabel>
                  {isAlbum && task?.id ? (
                    <MediaViewerHeaderIconButton
                      onClick={openMoveAlbum}
                      aria-label={t('common.viewer.graph.moveAlbum')}
                      title={t('common.viewer.graph.moveAlbum')}
                    >
                      <FolderInput size={15} strokeWidth={2} aria-hidden />
                    </MediaViewerHeaderIconButton>
                  ) : null}
                </>
              )}
            </MediaViewerToolbarScroll>
          ) : null}
        </MediaViewerHeader>
        <div className="graph-viewer-body">
          {loading && (
            <div className="graph-viewer-main graph-viewer-main--centered">
              <MediaLoadingState variant="stage" kind="image" />
            </div>
          )}
          {!loading && viewMode === 'content' && isTaskIncomplete && task && (
            <div className="graph-viewer-main graph-viewer-main--centered">
              <TaskProgressStage
                progress={task.progress?.progress ?? null}
                status={task.status}
                statusLabel={statusLabels[task.status] ?? task.status}
                kind="image"
              />
            </div>
          )}
          {!loading && viewMode === 'content' && isTaskFailed && task && !error && (
            <div className="graph-viewer-main graph-viewer-main--centered">
              <TaskProgressStage
                progress={task.progress?.progress ?? null}
                status={task.status}
                statusLabel={statusLabels[task.status] ?? task.status}
                kind="image"
                error={task.progress?.error ?? t('common.viewer.graph.incomplete')}
              />
            </div>
          )}
          {error && viewMode === 'content' && !isTaskIncomplete && !isTaskFailed && (
            <p className="graph-viewer-error">{error}</p>
          )}
          {!loading &&
            !error &&
            !isTaskIncomplete &&
            !isTaskFailed &&
            viewMode === 'content' &&
            mediaUrls.length === 0 &&
            !(isAlbum && albumItems && albumItems.length > 0) && (
            <p className="graph-viewer-empty">{t('common.media.noResults')}</p>
          )}
          {!loading &&
            !error &&
            !isTaskIncomplete &&
            !isTaskFailed &&
            viewMode === 'content' &&
            (mediaUrls.length > 0 || (isAlbum && !!albumItems?.length)) && (
            <div className={`graph-viewer-main${isAlbum && albumPane === 'grid' ? ' graph-viewer-main--album-grid' : ''}`}>
              {showPartialFailBanner ? (
                <p className="graph-viewer-partial-banner" role="status">
                  {albumFailedCount > 0
                    ? t('common.viewer.graph.albumPartialFail', { count: albumFailedCount })
                    : t('common.viewer.graph.albumStatusWarn')}
                </p>
              ) : null}

              {isAlbum && albumPane === 'grid' ? (
                <div className="graph-album-gallery" role="list">
                  {(albumItems && albumItems.length > 0
                    ? albumItems.map((row) => {
                        const isFailed =
                          row.status === 'failed' ||
                          (!row.imageUrl && row.status !== 'ready');
                        const readyIdx = readyAlbumItems
                          ? readyAlbumItems.findIndex((r) => r.id === row.id)
                          : -1;
                        const url =
                          readyIdx >= 0 ? mediaUrls[readyIdx] : undefined;
                        const caption =
                          typeof row.title === 'string' && row.title.trim()
                            ? row.title.trim()
                            : t('common.viewer.graph.resultAlt', {
                                n: row.order ?? 1,
                              });
                        const retrying = retryingItemId === row.id;
                        const localErr = retryErrorByItem[row.id];

                        if (isFailed || !url) {
                          return (
                            <div
                              key={row.id}
                              role="listitem"
                              className="graph-album-gallery__tile graph-album-gallery__tile--failed"
                            >
                              <div className="graph-album-gallery__fail-body">
                                <ImageOff size={28} strokeWidth={1.75} aria-hidden />
                                <span className="graph-album-gallery__fail-label">
                                  {t('common.viewer.graph.albumItemFailed')}
                                </span>
                                {(localErr || row.error) && (
                                  <span
                                    className="graph-album-gallery__fail-error"
                                    title={localErr || row.error}
                                  >
                                    {localErr || row.error}
                                  </span>
                                )}
                                {onRetryAlbumItem ? (
                                  <button
                                    type="button"
                                    className="graph-album-gallery__retry"
                                    disabled={!!retryingItemId}
                                    onClick={(e) => void handleRetryAlbumItem(row.id, e)}
                                  >
                                    {retrying
                                      ? t('common.viewer.graph.albumItemRetrying')
                                      : t('common.viewer.graph.albumItemRetry')}
                                  </button>
                                ) : null}
                              </div>
                              <span className="graph-album-gallery__caption">{caption}</span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={row.id}
                            type="button"
                            role="listitem"
                            className="graph-album-gallery__tile"
                            onClick={() => {
                              setActiveIndex(readyIdx);
                              setAlbumPane('focus');
                              handleResetView();
                            }}
                          >
                            <img src={url} alt={caption} loading="lazy" decoding="async" />
                            <span className="graph-album-gallery__caption">{caption}</span>
                          </button>
                        );
                      })
                    : mediaUrls.map((url, idx) => {
                        const row = readyAlbumItems?.[idx];
                        const caption =
                          typeof row?.title === 'string' && row.title.trim()
                            ? row.title.trim()
                            : t('common.viewer.graph.resultAlt', { n: idx + 1 });
                        return (
                          <button
                            key={`${idx}-${url.slice(-24)}`}
                            type="button"
                            role="listitem"
                            className="graph-album-gallery__tile"
                            onClick={() => {
                              setActiveIndex(idx);
                              setAlbumPane('focus');
                              handleResetView();
                            }}
                          >
                            <img src={url} alt={caption} loading="lazy" decoding="async" />
                            <span className="graph-album-gallery__caption">{caption}</span>
                          </button>
                        );
                      }))}
                </div>
              ) : mediaUrls.length > 0 ? (
                <>
                  <div
                    ref={stageRef}
                    className="graph-viewer-stage"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    {!imageReady && (
                      <MediaLoadingState
                        variant="stage"
                        kind="image"
                        className="media-loading--overlay"
                        message={t("common.viewer.graph.rendering")}
                      />
                    )}
                    <img
                      src={mediaUrls[activeIndex]}
                      alt={t("common.viewer.graph.resultAlt", { n: activeIndex + 1 })}
                      className="graph-viewer-image"
                      style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                        opacity: imageReady ? 1 : 0,
                        cursor: isDragging
                          ? 'grabbing'
                          : zoom !== 1 || offset.x !== 0 || offset.y !== 0
                            ? 'grab'
                            : 'default',
                      }}
                      draggable={false}
                      onDoubleClick={handleResetView}
                      onLoad={() => setImageReady(true)}
                    />
                  </div>
                  {!isAlbum && mediaUrls.length > 1 && (
                    <div className="graph-viewer-thumbs">
                      {mediaUrls.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`graph-viewer-thumb-btn ${
                            idx === activeIndex ? 'active' : ''
                          }`}
                          onClick={() => {
                            setActiveIndex(idx);
                            handleResetView();
                          }}
                        >
                          <img src={url} alt={t("common.viewer.graph.thumbAlt", { n: idx + 1 })} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="graph-viewer-empty">{t('common.media.noResults')}</p>
              )}
            </div>
          )}
          {!loading && viewMode === 'raw' && task && (
            <div className="graph-viewer-raw-wrap">
              <pre className="graph-viewer-raw">{JSON.stringify(task, null, 2)}</pre>
            </div>
          )}
        </div>
        <style>{`
          .graph-viewer-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 0;
          }
          .graph-viewer-modal {
            background: var(--page-bg);
            border: 1px solid var(--card-border);
            border-radius: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .graph-viewer-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            min-height: 0;
          }
          .graph-viewer-main {
            display: flex;
            flex-direction: column;
            height: 100%;
            gap: 0.75rem;
            flex: 1;
            min-height: 0;
          }
          .graph-viewer-main--centered {
            align-items: center;
            justify-content: center;
          }
          .graph-viewer-empty,
          .graph-viewer-error {
            margin: auto;
            padding: 2rem;
            text-align: center;
          }
          .graph-viewer-partial-banner {
            margin: 0;
            padding: 0.5rem 0.75rem;
            border-radius: 8px;
            background: rgba(245, 158, 11, 0.12);
            color: #b45309;
            font-size: 0.85rem;
            line-height: 1.4;
            flex-shrink: 0;
          }
          .graph-viewer-main--album-grid {
            gap: 0.75rem;
            padding: 0.75rem 1rem 1rem;
            overflow: auto;
          }
          .graph-album-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
            gap: 0.75rem;
            width: 100%;
            align-content: start;
          }
          .graph-album-gallery__tile {
            appearance: none;
            border: 1px solid rgba(148, 163, 184, 0.35);
            background: rgba(15, 23, 42, 0.04);
            border-radius: 12px;
            padding: 0;
            overflow: hidden;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            text-align: left;
            transition:
              transform 160ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 160ms cubic-bezier(0.16, 1, 0.3, 1),
              border-color 160ms ease;
          }
          .graph-album-gallery__tile:hover {
            transform: translateY(-2px);
            border-color: rgba(14, 165, 233, 0.55);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
          }
          .graph-album-gallery__tile:focus-visible {
            outline: 2px solid rgb(14, 165, 233);
            outline-offset: 2px;
          }
          .graph-album-gallery__tile img {
            width: 100%;
            aspect-ratio: 1 / 1;
            object-fit: cover;
            display: block;
            background: rgba(15, 23, 42, 0.06);
          }
          .graph-album-gallery__tile--failed {
            cursor: default;
          }
          .graph-album-gallery__tile--failed:hover {
            transform: none;
            border-color: rgba(248, 113, 113, 0.45);
            box-shadow: none;
          }
          .graph-album-gallery__fail-body {
            aspect-ratio: 1 / 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            padding: 0.75rem;
            background:
              repeating-linear-gradient(
                -45deg,
                rgba(248, 113, 113, 0.08),
                rgba(248, 113, 113, 0.08) 6px,
                rgba(248, 113, 113, 0.02) 6px,
                rgba(248, 113, 113, 0.02) 12px
              );
            color: #b91c1c;
            text-align: center;
          }
          .graph-album-gallery__fail-label {
            font-size: 0.78rem;
            font-weight: 600;
          }
          .graph-album-gallery__fail-error {
            font-size: 0.65rem;
            line-height: 1.25;
            color: #9f1239;
            max-width: 100%;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            opacity: 0.85;
          }
          .graph-album-gallery__retry {
            appearance: none;
            margin-top: 0.25rem;
            border: 1px solid rgba(185, 28, 28, 0.35);
            background: rgba(255, 255, 255, 0.85);
            color: #991b1b;
            border-radius: 999px;
            padding: 0.28rem 0.7rem;
            font-size: 0.72rem;
            font-weight: 600;
            cursor: pointer;
          }
          .graph-album-gallery__retry:hover:not(:disabled) {
            background: #fff;
            border-color: rgba(185, 28, 28, 0.55);
          }
          .graph-album-gallery__retry:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
          .graph-album-gallery__caption {
            padding: 0.4rem 0.55rem 0.5rem;
            font-size: 0.72rem;
            line-height: 1.3;
            color: var(--text-main, #0f172a);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          html.dark .graph-album-gallery__tile {
            background: rgba(15, 23, 42, 0.35);
            border-color: rgba(148, 163, 184, 0.28);
          }
          html.dark .graph-album-gallery__caption {
            color: #e2e8f0;
          }
          html.dark .graph-album-gallery__fail-body {
            color: #fca5a5;
          }
          html.dark .graph-album-gallery__fail-error {
            color: #fecaca;
          }
          html.dark .graph-album-gallery__retry {
            background: rgba(15, 23, 42, 0.75);
            color: #fecaca;
            border-color: rgba(248, 113, 113, 0.4);
          }
          @media (prefers-reduced-motion: reduce) {
            .graph-album-gallery__tile,
            .graph-album-gallery__tile:hover {
              transition: none;
              transform: none;
            }
          }
          .graph-viewer-raw-wrap {
            flex: 1;
            min-height: 0;
            overflow: auto;
            padding: 1rem;
          }
          .graph-viewer-empty {
            color: hsl(var(--muted-foreground));
          }
          .graph-viewer-stage {
            flex: 1;
            background: radial-gradient(circle at top, #0f172a, #020617);
            border-radius: 12px;
            border: 1px solid hsl(var(--border));
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            cursor: grab;
          }
          .graph-viewer-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            user-select: none;
            will-change: transform, opacity;
            transition: transform 0.05s linear, opacity 0.25s ease;
          }
          .graph-viewer-thumbs {
            display: flex;
            gap: 0.5rem;
            overflow-x: auto;
            padding-bottom: 0.25rem;
          }
          .graph-viewer-thumb-btn {
            border: 1px solid hsl(var(--border));
            background: rgba(15,23,42,0.9);
            padding: 0;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            flex: 0 0 auto;
          }
          .graph-viewer-thumb-btn img {
            display: block;
            width: 80px;
            height: 60px;
            object-fit: cover;
          }
          .graph-viewer-thumb-btn.active {
            border-color: rgba(79,70,229,0.9);
            box-shadow: 0 0 0 1px rgba(79,70,229,0.5);
          }
          .graph-viewer-error { color: #fca5a5; }
          .graph-viewer-raw {
            margin: 0;
            padding: 1rem;
            background: #0f172a;
            border: 1px solid hsl(var(--border));
            border-radius: 8px;
            font-size: 0.8rem;
            color: #cbd5f5;
            overflow: auto;
            max-height: none;
            white-space: pre-wrap;
            word-break: break-all;
          }
          html:not(.dark) .graph-viewer-raw {
            background: #f8fafc;
            color: #334155;
            border-color: rgba(148, 163, 184, 0.35);
          }
        `}</style>
      </div>

      {moveTaskIds ? (
        <MoveTasksToKnowledgeFolderModal
          open
          taskIds={moveTaskIds}
          itemCount={moveTaskIds.length}
          onClose={() => setMoveTaskIds(null)}
        />
      ) : null}
    </div>
  );
}
