import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Modal } from 'antd';
import {
  fetchMediaBlobUrl,
  fetchStorageObjectText,
  fetchWritingMediaContent,
  getAuthenticatedMediaStreamUrl,
  getTask,
  type KnowledgeFolderLinkItem,
  type WritingTaskItem,
} from '../../api/client';
import { extractFullCgiTaskFromApiResponse } from '../../notifications/task-snapshot';
import { getCachedMediaBlobUrl, mediaBlobCacheKey } from '../../lib/mediaBlobCache';
import { openMediaGenerationTaskPreview } from '../../shared/openMediaGenerationTask';
import { AudioViewerModal } from '../AudioViewerModal';
import { GraphViewerModal } from '../GraphViewerModal';
import { VideoViewerModal } from '../VideoViewerModal';
import { WritingViewerModal } from '../WritingViewerModal';
import { StorageObjectPreviewContent } from './StorageObjectPreviewContent';
import {
  isWritingManuscriptLink,
  resolveKnowledgeFolderLinkCardKind,
  storageObjectPublicUrl,
  knowledgeFolderLinkToTaskItem,
} from './knowledgeFolderLinkModel';

export function useKnowledgeFolderLinkPreview() {
  const [audioVisible, setAudioVisible] = useState(false);
  const [audioTask, setAudioTask] = useState<WritingTaskItem | null>(null);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioKind, setAudioKind] = useState<'audio' | 'music'>('audio');

  const [graphVisible, setGraphVisible] = useState(false);
  const [graphTask, setGraphTask] = useState<WritingTaskItem | null>(null);
  const [graphUrls, setGraphUrls] = useState<string[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const [videoVisible, setVideoVisible] = useState(false);
  const [videoTask, setVideoTask] = useState<WritingTaskItem | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoBlobFallbackRef = useRef<string | null>(null);

  const [writingVisible, setWritingVisible] = useState(false);
  const [writingTask, setWritingTask] = useState<WritingTaskItem | null>(null);
  const [writingContent, setWritingContent] = useState('');
  const [writingPdfUrl, setWritingPdfUrl] = useState<string | null>(null);
  const [writingPdfHeaders, setWritingPdfHeaders] = useState<Record<string, string> | null>(null);
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingError, setWritingError] = useState<string | null>(null);

  const [storagePreview, setStoragePreview] = useState<{
    id: string;
    name: string;
    contentType?: string | null;
    url: string;
  } | null>(null);

  const noopSetTasks = useCallback<Dispatch<SetStateAction<WritingTaskItem[]>>>(() => {}, []);

  const clearWritingPdf = useCallback(() => {
    setWritingPdfUrl(null);
    setWritingPdfHeaders(null);
  }, []);

  const openGraphTask = useCallback(async (task: WritingTaskItem) => {
    setGraphVisible(true);
    setGraphTask(task);
    setGraphError(null);

    const cacheKey = mediaBlobCacheKey('graph', task.id, 'full');
    const cached = getCachedMediaBlobUrl(cacheKey);
    if (cached) {
      setGraphUrls([cached]);
      setGraphLoading(false);
      return;
    }

    setGraphUrls([]);
    setGraphLoading(true);
    try {
      const blobUrl = await fetchMediaBlobUrl(task.id, 'graph');
      setGraphUrls([blobUrl]);
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : String(e));
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const openVideoTask = useCallback(async (task: WritingTaskItem) => {
    setVideoVisible(true);
    setVideoTask(task);
    setVideoError(null);
    videoBlobFallbackRef.current = null;
    setVideoUrl(getAuthenticatedMediaStreamUrl(task.id, 'video'));
    setVideoLoading(false);

    try {
      const detailRes = await getTask(task.id);
      const full = extractFullCgiTaskFromApiResponse(detailRes.data);
      if (full) setVideoTask(full);
    } catch {
      // 流式 URL 已可用，详情拉取失败不阻塞播放
    }
  }, []);

  const openWritingTask = useCallback(
    async (task: WritingTaskItem) => {
      clearWritingPdf();
      setWritingVisible(true);
      setWritingTask(task);
      setWritingContent('');
      setWritingError(null);
      setWritingLoading(true);
      try {
        const media = await fetchWritingMediaContent(task.id);
        if (media.kind === 'pdf') {
          setWritingPdfUrl(media.sourceUrl);
          setWritingPdfHeaders(media.httpHeaders);
        } else {
          setWritingContent(media.text);
        }
      } catch (e) {
        setWritingError(e instanceof Error ? e.message : String(e));
      } finally {
        setWritingLoading(false);
      }
    },
    [clearWritingPdf]
  );

  /** 文集单篇 / markdown 上传：从 storage object 读正文，勿当写作任务 id 拉 media */
  const openWritingStorageManuscript = useCallback(
    async (link: KnowledgeFolderLinkItem) => {
      clearWritingPdf();
      const task = knowledgeFolderLinkToTaskItem(link);
      const meta = (link.metadata ?? {}) as Record<string, unknown>;
      const fallback =
        (typeof meta.contentPreview === 'string' && meta.contentPreview.trim()) ||
        (typeof meta.text === 'string' && meta.text.trim()) ||
        '';
      setWritingVisible(true);
      setWritingTask(task);
      setWritingContent(fallback);
      setWritingError(null);
      setWritingLoading(true);
      const objectId = link.object_id ?? link.id;
      try {
        const text = await fetchStorageObjectText(storageObjectPublicUrl(objectId), objectId);
        setWritingContent(text?.trim() ? text : fallback || '（空文稿）');
      } catch (e) {
        if (fallback) {
          setWritingContent(fallback);
        } else {
          setWritingError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setWritingLoading(false);
      }
    },
    [clearWritingPdf]
  );

  const openLink = useCallback(
    async (link: KnowledgeFolderLinkItem) => {
      if (link.broken) return;
      const kind = resolveKnowledgeFolderLinkCardKind(link);
      const task = knowledgeFolderLinkToTaskItem(link);

      if (kind === 'audio' || kind === 'music') {
        setAudioKind(kind);
        await openMediaGenerationTaskPreview(task, kind, {
          setReviewTask: () => undefined,
          setReviewVisible: () => undefined,
          setViewerVisible: setAudioVisible,
          setViewerTask: setAudioTask,
          setViewerUrls: setAudioUrls,
          setViewerLoading: setAudioLoading,
          setViewerError: setAudioError,
          setTasks: noopSetTasks,
        });
        return;
      }

      if (kind === 'graph') {
        await openGraphTask(task);
        return;
      }

      if (kind === 'video') {
        await openVideoTask(task);
        return;
      }

      // 写作任务，或文集单篇 / markdown 上传
      if (kind === 'writing' || isWritingManuscriptLink(link)) {
        if (link.ref_type === 'storage_object') {
          await openWritingStorageManuscript(link);
          return;
        }
        await openWritingTask(task);
        return;
      }

      if (kind === 'upload') {
        const objectId = link.object_id ?? link.id;
        setStoragePreview({
          id: objectId,
          name: link.name,
          contentType: link.content_type,
          url: storageObjectPublicUrl(objectId),
        });
      }
    },
    [openGraphTask, openVideoTask, openWritingTask, openWritingStorageManuscript, noopSetTasks]
  );

  const handleVideoPlayError = useCallback(async () => {
    const taskId = videoTask?.id;
    if (!taskId || videoBlobFallbackRef.current === taskId) return;
    videoBlobFallbackRef.current = taskId;
    setVideoLoading(true);
    setVideoError(null);
    try {
      const blobUrl = await fetchMediaBlobUrl(taskId, 'video', {
        delivery: 'blob',
        timeoutMs: 120_000,
        useCache: true,
      });
      setVideoUrl(blobUrl);
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : '视频加载失败');
    } finally {
      setVideoLoading(false);
    }
  }, [videoTask?.id]);

  const previewModals = (
    <>
      <AudioViewerModal
        visible={audioVisible}
        onClose={() => setAudioVisible(false)}
        title={audioTask ? linkDisplayTitle(audioTask) : '音频'}
        task={audioTask}
        mediaUrls={audioUrls}
        loading={audioLoading}
        error={audioError}
        showSubtitles={audioKind === 'audio'}
        contentTabLabel={audioKind === 'music' ? '音乐' : '口播'}
      />
      <GraphViewerModal
        visible={graphVisible}
        onClose={() => setGraphVisible(false)}
        title={graphTask ? linkDisplayTitle(graphTask) : '图片'}
        task={graphTask}
        mediaUrls={graphUrls}
        loading={graphLoading}
        error={graphError}
      />
      <VideoViewerModal
        visible={videoVisible}
        onClose={() => setVideoVisible(false)}
        title={videoTask ? linkDisplayTitle(videoTask) : '视频'}
        task={videoTask}
        videoUrl={videoUrl}
        loading={videoLoading}
        error={videoError}
        onPlayError={() => void handleVideoPlayError()}
      />
      <WritingViewerModal
        visible={writingVisible}
        onClose={() => {
          setWritingVisible(false);
          clearWritingPdf();
        }}
        title={writingTask ? linkDisplayTitle(writingTask) : '写作'}
        content={writingContent}
        pdfPreviewUrl={writingPdfUrl}
        pdfHttpHeaders={writingPdfHeaders}
        task={writingTask}
        loading={writingLoading}
        error={writingError}
      />
      <Modal
        title={storagePreview?.name || '预览'}
        open={Boolean(storagePreview)}
        onCancel={() => setStoragePreview(null)}
        footer={null}
        width={720}
        className="asset-preview-modal"
        destroyOnHidden
      >
        {storagePreview ? <StorageObjectPreviewContent item={storagePreview} /> : null}
      </Modal>
    </>
  );

  return { openLink, previewModals };
}

function linkDisplayTitle(task: WritingTaskItem): string {
  const label = (task.metadata?.label as string | undefined)?.trim();
  if (label) return label;
  const params = task.requestParams?.params as Record<string, unknown> | undefined;
  const text = String(params?.text ?? params?.prompt ?? '').trim();
  if (text) {
    return text.length > 48 ? `${text.slice(0, 48)}…` : text;
  }
  return task.id;
}
