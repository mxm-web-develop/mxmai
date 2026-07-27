import type { Dispatch, SetStateAction } from 'react';
import {
  getTask,
  getAuthenticatedMediaStreamUrl,
  type WritingTaskItem,
} from '../api/client';
import { extractFullCgiTaskFromApiResponse } from '../notifications/task-snapshot';
import {
  isTaskEligibleForManualReview,
  isTaskMediaReady,
  mergeTaskIntoList,
  resolveTaskListStatus,
} from '../utils/mergeTaskItem';

type MediaKind = 'audio' | 'music' | 'graph' | 'video';

export type OpenMediaTaskPreviewHandlers = {
  setReviewTask: (t: WritingTaskItem | null) => void;
  setReviewVisible: (v: boolean) => void;
  setViewerVisible: (v: boolean) => void;
  setViewerTask: (t: WritingTaskItem | null) => void;
  setViewerUrls: (urls: string[]) => void;
  setViewerLoading: (v: boolean) => void;
  setViewerError: (e: string | null) => void;
  setTasks: Dispatch<SetStateAction<WritingTaskItem[]>>;
  onStaleReviewCompleted?: () => void;
};

/** 任意异步业务列表点击：优先打开人工审核弹窗 */
export async function openGenerationTaskClick(
  t: WritingTaskItem,
  handlers: Pick<OpenMediaTaskPreviewHandlers, 'setReviewTask' | 'setReviewVisible' | 'onStaleReviewCompleted'> & {
    onOpen: (task: WritingTaskItem) => void | Promise<void>;
  }
): Promise<void> {
  if (isTaskEligibleForManualReview(t)) {
    try {
      const detailRes = await getTask(t.id);
      const full = extractFullCgiTaskFromApiResponse(detailRes.data);
      if (full && isTaskEligibleForManualReview(full)) {
        handlers.setReviewTask(full);
        handlers.setReviewVisible(true);
        return;
      }
      if (full && full.status === 'awaiting_review' && resolveTaskListStatus(full) === 'completed') {
        handlers.onStaleReviewCompleted?.();
        await handlers.onOpen(full);
        return;
      }
    } catch {
      // 回退到列表行
    }
    handlers.setReviewTask(t);
    handlers.setReviewVisible(true);
    return;
  }
  if (t.status === 'awaiting_review' && resolveTaskListStatus(t) === 'completed') {
    handlers.onStaleReviewCompleted?.();
  }
  await handlers.onOpen(t);
}

/** 音频/音乐列表点击：先开预览再拉详情，避免 getTask 阻塞（历史 base64 任务尤甚） */
export async function openMediaGenerationTaskPreview(
  t: WritingTaskItem,
  mediaKind: MediaKind,
  handlers: OpenMediaTaskPreviewHandlers
): Promise<void> {
  const {
    setReviewTask,
    setReviewVisible,
    setViewerVisible,
    setViewerTask,
    setViewerUrls,
    setViewerLoading,
    setViewerError,
    setTasks,
    onStaleReviewCompleted,
  } = handlers;

  let task = t;

  if (isTaskEligibleForManualReview(task)) {
    try {
      const detailRes = await getTask(task.id);
      const full = extractFullCgiTaskFromApiResponse(detailRes.data);
      if (full) {
        setTasks((prev) => mergeTaskIntoList(prev, full));
        if (isTaskEligibleForManualReview(full)) {
          setReviewTask(full);
          setReviewVisible(true);
          return;
        }
        task = full;
      } else {
        setReviewTask(task);
        setReviewVisible(true);
        return;
      }
    } catch {
      setReviewTask(task);
      setReviewVisible(true);
      return;
    }
  }

  if (task.status === 'awaiting_review' && resolveTaskListStatus(task) === 'completed') {
    onStaleReviewCompleted?.();
  }

  setViewerVisible(true);
  setViewerTask(task);
  setViewerError(null);

  if (isTaskMediaReady(task)) {
    setViewerUrls([getAuthenticatedMediaStreamUrl(task.id, mediaKind)]);
    setViewerLoading(false);
    void getTask(task.id)
      .then((detailRes) => {
        const full = extractFullCgiTaskFromApiResponse(detailRes.data);
        if (full) {
          setViewerTask(full);
          setTasks((prev) => mergeTaskIntoList(prev, full));
        }
      })
      .catch(() => undefined);
    return;
  }

  setViewerUrls([]);
  setViewerLoading(true);
  try {
    const detailRes = await getTask(task.id);
    const full = extractFullCgiTaskFromApiResponse(detailRes.data);
    if (full) {
      setViewerTask(full);
      setTasks((prev) => mergeTaskIntoList(prev, full));
      if (isTaskMediaReady(full)) {
        setViewerUrls([getAuthenticatedMediaStreamUrl(full.id, mediaKind)]);
      }
    }
  } catch (e) {
    setViewerError(e instanceof Error ? e.message : String(e));
  } finally {
    setViewerLoading(false);
  }
}
