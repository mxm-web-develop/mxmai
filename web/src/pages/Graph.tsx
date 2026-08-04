import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Drawer, Select, notification, Modal, message, App } from 'antd';
import {
  listCgiTasks,
  deleteTask,
  fetchMediaBlobUrl,
  getTask,
  removeAlbumItem,
  retryAlbumItem,
  runTaskV2,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import {
  TaskBillingBar,
  formatGenerateButtonLabel,
  handleTaskBillingResponseError,
  type TaskBillingState,
} from '../components/billing/TaskBillingBar';
import {
  getCachedMediaBlobUrl,
  mediaBlobCacheKey,
  removeCachedMediaBlobUrl,
} from '../lib/mediaBlobCache';
import { useAuth } from '../context/AuthContext';
import { useCgiTaskListSync } from '../hooks/useCgiTaskListSync';
import { shouldShowInTaskList } from '../lib/taskListVisibility';
import { GraphViewerModal } from '../components/GraphViewerModal';
import { ManualReviewModal } from '../components/ManualReviewModal';
import { openGenerationTaskClick } from '../shared/openMediaGenerationTask';
import { extractFullCgiTaskFromApiResponse } from '../notifications/task-snapshot';
import { mergeTaskIntoList } from '../utils/mergeTaskItem';
import { TaskListLoading } from '../components/asset-loading';
import { GraphTaskThumb } from '../components/GraphTaskThumb';
import { useGraphTaskThumbnails } from '../hooks/useGraphTaskThumbnails';
import {
  GenerationTaskFilterSelect,
  GenerationTaskToolbar,
} from '../components/GenerationTaskToolbar';
import { TaskOpenApiBadge } from '../components/TaskOpenApiBadge';
import { TaskCardMoreMenu } from '../components/task-list/TaskCardMoreMenu';
import { TaskCardRetryButton, isTaskRetryable } from '../components/TaskCardRetryButton';
import { GenerationTaskListScroll } from '../components/task-list/PullToRefreshScroll';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';
import { downloadGenerationTask } from '../lib/downloadGenerationTask';
import {
  useTaskV2FormConfig,
  formatTaskSelectionKey,
  parseTaskSelectionKey,
  TaskV2SchemaForm,
  TaskV2TaskNameField,
  TASK_V2_DRAWER_FORM_CLASS,
  TaskV2CreateSurface,
  TaskV2CreateModeSwitch,
  type TaskV2CreateMode,
  pickTaskIdFromRunTaskV2Response,
  pickParallelFromRunTaskV2Response,
  prepareTaskV2SubmitParams,
  buildTaskSelectionLabelMap,
  buildTaskSelectionSelectOptions,
  formatTaskBusinessDisplay,
  taskMatchesSelectionFilter,
} from '../task-v2';
import { useOpenApiTaskNav } from '../hooks/useOpenApiTaskNav';
import { useGenerationTaskListBulkActions } from '../hooks/useGenerationTaskListBulkActions';
import { TaskCardSelectCheckbox } from '../components/task-list/TaskCardSelectCheckbox';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import { useTaskScopeLabels } from '../i18n/useTaskScopeLabels';
import { useTaskStatusOptions } from '../i18n/useTaskStatusOptions';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

function stripPrivateUiFields<T>(input: T): T {
  if (Array.isArray(input)) return input.map((item) => stripPrivateUiFields(item)) as T;
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith('__')) continue;
      out[key] = stripPrivateUiFields(value);
    }
    return out as T;
  }
  return input;
}

function normalizeEnumSelectionsBySchema(schema: unknown, params: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema as any).properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return params;

  const next: Record<string, unknown> = { ...params };

  for (const [key, defRaw] of Object.entries(props as Record<string, unknown>)) {
    if (!(key in next)) continue;
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    const v = next[key];

    // 1) multiSelection: type=array + items.enum + x-enum-labels
    if (String(def.type) === 'array') {
      const items = def.items;
      if (items && typeof items === 'object' && !Array.isArray(items)) {
        const en = (items as any).enum;
        const labels = def['x-enum-labels'];
        if (Array.isArray(en) && en.length > 0 && Array.isArray(labels) && labels.length > 0) {
          const enumVals = en.map((x: any) => String(x));
          const labelVals = labels.map((x: any) => String(x));
          const labelToEnum = new Map<string, string>();
          for (let i = 0; i < Math.min(enumVals.length, labelVals.length); i++) {
            const lab = labelVals[i];
            const ev = enumVals[i];
            if (lab && ev) labelToEnum.set(lab, ev);
          }

          const arr = Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? [v.trim()] : [];
          if (arr.length > 0) {
            const mapped = arr.map((s) => labelToEnum.get(s) ?? s).filter((s) => s.trim() !== '');
            next[key] = mapped;
          }
        }
      }
      continue;
    }

    // 2) selection: enum + x-enum-labels
    if (Array.isArray(def.enum) && Array.isArray(def['x-enum-labels']) && typeof v === 'string' && v.trim()) {
      const enumVals = (def.enum as unknown[]).map((x) => String(x));
      const labelVals = (def['x-enum-labels'] as unknown[]).map((x) => String(x));
      const idx = labelVals.indexOf(v);
      if (idx >= 0 && enumVals[idx]) {
        next[key] = enumVals[idx];
      }
    }
  }

  return next;
}

/** 列表摘要里有媒体，即可展示（含「部分失败后 status=failed 但 result 仍有图」） */
function graphTaskHasMedia(task: WritingTaskItem): boolean {
  return task.result?.hasMedia === true || (task.result?.mediaCount ?? 0) > 0;
}

function isGraphTaskViewable(task: WritingTaskItem): boolean {
  if (task.status === 'completed') return true;
  if (graphTaskHasMedia(task) && (task.status === 'failed' || task.status === 'cancelled')) {
    return true;
  }
  return false;
}

function getGraphMediaCount(task: WritingTaskItem): number {
  const resultMeta = task.result?.metadata as Record<string, unknown> | undefined;
  const albumReady = resultMeta?.albumReadyCount;
  if (typeof albumReady === 'number' && albumReady > 0) return albumReady;

  const rich = task.result as
    | { mediaCount?: number; mediaUrls?: unknown; storageInfo?: { keys?: unknown } }
    | undefined;
  if (typeof rich?.mediaCount === 'number' && rich.mediaCount > 0) return rich.mediaCount;
  if (Array.isArray(rich?.storageInfo?.keys) && rich.storageInfo.keys.length > 0) {
    return rich.storageInfo.keys.length;
  }
  if (Array.isArray(rich?.mediaUrls) && rich.mediaUrls.length > 0) return rich.mediaUrls.length;
  return graphTaskHasMedia(task) ? 1 : 0;
}

/** 内容图集（文档配图等）：列表用叠放相册卡，点击看全部图 */
function isGraphAlbumTask(task: WritingTaskItem): boolean {
  const resultMeta = task.result?.metadata as Record<string, unknown> | undefined;
  if (resultMeta?.resultKind === 'image-album') return true;
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  if (meta.resultKind === 'image-album') return true;
  const taskV2 = (meta.taskV2 ??
    (task.requestParams as Record<string, unknown> | undefined)?.taskV2 ??
    ((task.requestParams as Record<string, unknown> | undefined)?.params as Record<string, unknown> | undefined)
      ?.taskV2) as { taskKey?: string; subtype?: string | null } | undefined;
  const subtype = String(taskV2?.subtype ?? '').toLowerCase();
  if (taskV2?.taskKey === 'group' && subtype.includes('album')) return true;
  const ready = resultMeta?.albumReadyCount;
  if (typeof ready === 'number' && ready > 0) return true;
  return typeof resultMeta?.albumFailedCount === 'number';
}

function getTaskTitle(task: WritingTaskItem, defaultTitle: string): string {
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const inner = rp?.params as Record<string, unknown> | undefined;
  const pickStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const labelVal =
    pickStr(task.metadata?.label) ||
    pickStr((inner?.metadata as Record<string, unknown> | undefined)?.label) ||
    pickStr((rp?.metadata as Record<string, unknown> | undefined)?.label);
  if (labelVal) return labelVal;
  const promptVal = pickStr(inner?.prompt);
  return promptVal.length
    ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
    : defaultTitle;
}

export default function Graph() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('graph');
  const statusOptions = useTaskStatusOptions();
  const { notification: ctxNotification, modal, message: ctxMessage } = App.useApp();
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [createMode, setCreateMode] = useState<TaskV2CreateMode>('form');

  const {
    taskKey,
    setTaskKey,
    subtype,
    setSubtype,
    clearPendingForm,
    taskOptions,
    formConfig,
    formValues,
    setFormValues,
    resetFormValues,
    configLoading,
    listLoading,
    taskLabel,
    onTaskLabelChange,
    mergeTaskLabelIntoParams,
    resetTaskLabelAfterSubmit,
  } = useTaskV2FormConfig({ scope: 'graph', enabled: isLoggedIn, formDrawerOpen: formOpen });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const appLang = toAppLang(i18n.language);
  const graphSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, appLang),
    [taskOptions, appLang]
  );
  const taskSelectionLabelMap = useMemo(
    () => buildTaskSelectionLabelMap(taskOptions, appLang),
    [taskOptions, appLang]
  );

  const [filterSelectionKey, setFilterSelectionKey] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [creationSourceTab, setCreationSourceTab] = useState<TaskCreationSourceTab>('web');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerTaskIndex, setViewerTaskIndex] = useState(-1);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);
  const hasInitialLoadedRef = useRef(false);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;

    // 仅第一次进入页面时展示整体 loading，后续轮询静默更新，避免列表频繁“闪一下”
    if (!hasInitialLoadedRef.current) {
      setLoadingTasks(true);
    }

    try {
      // 不传 startDate 时后端返回全部任务
      const res = await listCgiTasks({
        type: 'graph',
        limit: 200,
        offset: 0,
        creationSource: creationSourceTab,
      });
      const body = res.data as WritingTaskListResponse | undefined;
      const incoming = body?.data?.tasks ?? [];

      setTasks((prev) => {
        // 按 id 建索引，尽量复用旧对象，减少 React diff & 重渲染
        const prevMap = new Map(prev.map((t) => [t.id, t]));
        let changed = false;

        const merged = incoming.map((next) => {
          const old = prevMap.get(next.id);
          if (!old) {
            changed = true;
            return next;
          }

          // 只关心会影响 UI 的字段：status / progress / createdAt 等
          const sameStatus = old.status === next.status;
          const sameCreated = old.createdAt === next.createdAt;
          const sameProgress =
            (!!old.progress?.progress || old.progress?.progress === 0) ===
              (!!next.progress?.progress || next.progress?.progress === 0) &&
            old.progress?.progress === next.progress?.progress &&
            old.progress?.error === next.progress?.error;

          if (sameStatus && sameCreated && sameProgress) {
            // 其他字段变化较少，复用旧引用，避免整个列表节点重建
            return old;
          }

          changed = true;
          return next;
        });

        // 长度变化（新增/删除任务）也视为有变化
        if (!changed && merged.length === prev.length) {
          return prev;
        }

        return merged;
      });
    } catch (e) {
      console.error('加载图片任务失败:', e);
      // 仅在首次加载失败时清空列表；后续轮询异常不打断当前展示
      if (!hasInitialLoadedRef.current) {
        setTasks([]);
      }
    } finally {
      hasInitialLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [isLoggedIn, creationSourceTab]);

  useEffect(() => {
    if (!isLoggedIn) return;
    hasInitialLoadedRef.current = false;
    void loadTasks();
  }, [isLoggedIn, creationSourceTab, loadTasks]);

  const { fetchTaskIntoList } = useCgiTaskListSync(isLoggedIn, setTasks, loadTasks, {
    listScope: 'graph',
  });

  const filteredTasks = tasks
    .filter((t) => {
      if (!shouldShowInTaskList(t, 'graph')) return false;
      if (!taskMatchesSelectionFilter(t, filterSelectionKey)) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  const bulk = useGenerationTaskListBulkActions({
    tasks: filteredTasks,
    setTasks,
    modal,
    message: ctxMessage,
    onDeletedIds: (ids) => {
      if (viewerTask && ids.has(viewerTask.id)) setViewerVisible(false);
    },
  });

  const completedTaskIds = useMemo(
    () => filteredTasks.filter((t) => isGraphTaskViewable(t)).map((t) => t.id),
    [filteredTasks]
  );
  const { thumbMap, albumThumbsMap, requestThumbnail } = useGraphTaskThumbnails(completedTaskIds);

  const viewableTasks = useMemo(
    () => filteredTasks.filter((t) => isGraphTaskViewable(t)),
    [filteredTasks]
  );

  const prefetchGraphFull = useCallback((taskId: string, mediaCount = 1) => {
    const n = Math.max(1, mediaCount);
    for (let i = 0; i < Math.min(n, 4); i++) {
      void fetchMediaBlobUrl(taskId, 'graph', { index: i }).catch(() => undefined);
    }
  }, []);

  const openViewerForTask = useCallback(
    async (t: WritingTaskItem, indexInViewable?: number) => {
      const idx = indexInViewable ?? viewableTasks.findIndex((x) => x.id === t.id);
      setViewerVisible(true);
      setViewerTask(t);
      setViewerTaskIndex(idx);
      setViewerError(null);

      if (!isGraphTaskViewable(t)) {
        setViewerUrls([]);
        setViewerLoading(false);
        setViewerError(null);
        return;
      }

      setViewerLoading(true);
      setViewerUrls([]);

      try {
        let task = t;
        // 图集列表摘要常无 storageInfo；详情补齐张数与 albumResult
        if (isGraphAlbumTask(t) || getGraphMediaCount(t) <= 0) {
          try {
            const detailRes = await getTask(t.id);
            const full = extractFullCgiTaskFromApiResponse(detailRes.data);
            if (full) {
              task = full;
              setViewerTask(full);
              setTasks((prev) => mergeTaskIntoList(prev, full));
            }
          } catch {
            /* 用列表行继续 */
          }
        }

        const mediaCount = Math.max(1, getGraphMediaCount(task));
        const urls = await Promise.all(
          Array.from({ length: mediaCount }, (_, i) =>
            fetchMediaBlobUrl(task.id, 'graph', { index: i }).catch(() => null)
          )
        );
        const ready = urls.filter((u): u is string => typeof u === 'string' && !!u);
        if (ready.length === 0) {
          // 封面 preview 已能显示时，至少回退拉一张
          const fallback = await fetchMediaBlobUrl(task.id, 'graph', { index: 0 }).catch(() => null);
          if (!fallback) throw new Error('无法加载图片');
          setViewerUrls([fallback]);
        } else {
          setViewerUrls(ready);
        }

        if (!isGraphAlbumTask(task)) {
          if (idx > 0) prefetchGraphFull(viewableTasks[idx - 1].id, getGraphMediaCount(viewableTasks[idx - 1]));
          if (idx >= 0 && idx < viewableTasks.length - 1) {
            prefetchGraphFull(viewableTasks[idx + 1].id, getGraphMediaCount(viewableTasks[idx + 1]));
          }
        }
      } catch (e) {
        setViewerError(e instanceof Error ? e.message : String(e));
      } finally {
        setViewerLoading(false);
      }
    },
    [viewableTasks, prefetchGraphFull]
  );

  // 查看器打开时同步列表中的进度；完成后自动加载结果
  useEffect(() => {
    if (!viewerVisible || !viewerTask?.id) return;
    const fresh = tasks.find((t) => t.id === viewerTask.id);
    if (!fresh) return;

    const progressChanged =
      fresh.progress?.progress !== viewerTask.progress?.progress ||
      fresh.progress?.error !== viewerTask.progress?.error;
    const statusChanged = fresh.status !== viewerTask.status;

    if (progressChanged || statusChanged) {
      setViewerTask(fresh);
    }

    if (statusChanged && isGraphTaskViewable(fresh) && !isGraphTaskViewable(viewerTask)) {
      void openViewerForTask(fresh, viewerTaskIndex);
    }
  }, [tasks, viewerVisible, viewerTask, viewerTaskIndex, openViewerForTask]);

  const goViewerPrev = useCallback(() => {
    if (viewerTaskIndex <= 0) return;
    void openViewerForTask(viewableTasks[viewerTaskIndex - 1], viewerTaskIndex - 1);
  }, [viewerTaskIndex, viewableTasks, openViewerForTask]);

  const goViewerNext = useCallback(() => {
    if (viewerTaskIndex < 0 || viewerTaskIndex >= viewableTasks.length - 1) return;
    void openViewerForTask(viewableTasks[viewerTaskIndex + 1], viewerTaskIndex + 1);
  }, [viewerTaskIndex, viewableTasks, openViewerForTask]);

  const viewerNavigation = useMemo(() => {
    // 图集查看器不混入「任务间」翻页（避免显示 1/72）
    if (viewerTask && isGraphAlbumTask(viewerTask)) return undefined;
    if (viewerTaskIndex < 0 || viewableTasks.length <= 1) return undefined;
    return {
      current: viewerTaskIndex + 1,
      total: viewableTasks.length,
      canPrev: viewerTaskIndex > 0,
      canNext: viewerTaskIndex < viewableTasks.length - 1,
      onPrev: goViewerPrev,
      onNext: goViewerNext,
    };
  }, [viewerTask, viewerTaskIndex, viewableTasks.length, goViewerPrev, goViewerNext]);

  const viewerAlbumMode = Boolean(viewerTask && isGraphAlbumTask(viewerTask));

  const handleRetryAlbumItem = useCallback(
    async (itemId: string) => {
      const taskId = viewerTask?.id;
      if (!taskId) throw new Error('缺少任务');

      const res = await retryAlbumItem(taskId, itemId);
      if (res.error) throw new Error(res.error);
      const payload = res.data?.data;
      if (payload?.status === 'failed') {
        throw new Error(payload.error || t('common.viewer.graph.albumItemFailed'));
      }

      // 单项重试会重排 storage index，清掉该任务所有媒体缓存
      for (let i = 0; i < 64; i++) {
        removeCachedMediaBlobUrl(mediaBlobCacheKey('graph', taskId, 'full', i));
        removeCachedMediaBlobUrl(mediaBlobCacheKey('graph', taskId, 'preview', i));
      }

      const detailRes = await getTask(taskId);
      const full = extractFullCgiTaskFromApiResponse(detailRes.data);
      if (!full) throw new Error('重试成功但无法刷新任务');

      setViewerTask(full);
      setTasks((prev) => mergeTaskIntoList(prev, full));

      const mediaCount = Math.max(1, getGraphMediaCount(full));
      const urls = await Promise.all(
        Array.from({ length: mediaCount }, (_, i) =>
          fetchMediaBlobUrl(taskId, 'graph', { index: i }).catch(() => null)
        )
      );
      setViewerUrls(urls.filter((u): u is string => typeof u === 'string' && !!u));
    },
    [viewerTask?.id, t]
  );

  const handleRemoveAlbumItem = useCallback(
    async (itemId: string) => {
      const taskId = viewerTask?.id;
      if (!taskId) throw new Error('缺少任务');

      const res = await removeAlbumItem(taskId, itemId);
      if (res.error) throw new Error(res.error);

      for (let i = 0; i < 64; i++) {
        removeCachedMediaBlobUrl(mediaBlobCacheKey('graph', taskId, 'full', i));
        removeCachedMediaBlobUrl(mediaBlobCacheKey('graph', taskId, 'preview', i));
      }

      const detailRes = await getTask(taskId);
      const full = extractFullCgiTaskFromApiResponse(detailRes.data);
      if (!full) throw new Error('删除成功但无法刷新任务');

      setViewerTask(full);
      setTasks((prev) => mergeTaskIntoList(prev, full));

      const mediaCount = getGraphMediaCount(full);
      if (mediaCount <= 0) {
        setViewerUrls([]);
        return;
      }
      const urls = await Promise.all(
        Array.from({ length: mediaCount }, (_, i) =>
          fetchMediaBlobUrl(taskId, 'graph', { index: i }).catch(() => null)
        )
      );
      setViewerUrls(urls.filter((u): u is string => typeof u === 'string' && !!u));
    },
    [viewerTask?.id]
  );

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      ctxNotification.warning({ message: t('auth.pleaseLogin'), placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      ctxNotification.warning({
        message: t('common.task.noBusinessConfig', { scope: scopeLabels.scopeLabel }),
        placement: 'top',
      });
      return;
    }
    setSubmitting(true);
    try {
      let cleanParams = prepareTaskV2SubmitParams(formValues, formConfig?.schema, { scope: 'graph' });
      // graph/design|group|generator|tool：params.type 勿用 subtype 覆盖；仅旧 photograph/painting 兼容写入
      if (
        subtype &&
        cleanParams.type === undefined &&
        (taskKey === 'photograph' || taskKey === 'painting')
      ) {
        cleanParams.type = subtype;
      }
      cleanParams = mergeTaskLabelIntoParams(cleanParams);

      const res = await runTaskV2({
        scope: 'graph',
        taskKey,
        subtype,
        params: cleanParams,
      });
      if (res.error) {
        if (handleTaskBillingResponseError(res)) return;
        throw new Error(res.error);
      }
      const taskId = pickTaskIdFromRunTaskV2Response(res.data);
      const parallel = pickParallelFromRunTaskV2Response(res.data);
      const parallelHint =
        parallel && parallel.total > 1
          ? `\n${t('common.task.created.parallel', { count: parallel.total })}。`
          : '';
      ctxNotification.success({
        message:
          parallel && parallel.total > 1
            ? t('common.task.created.batch', { count: parallel.total })
            : t('common.task.created.single'),
        description: taskId
          ? `${taskId}${parallelHint}\n${t('common.task.created.hint')}`
          : t('common.task.created.hint'),
        placement: 'top',
      });
      resetFormValues();
      resetTaskLabelAfterSubmit();
      if (taskId) {
        void fetchTaskIntoList(taskId);
      }
    } catch (err) {
      ctxNotification.error({
        message: t('common.submitFailed'),
        description: toUserFacingErrorMessage(err instanceof Error ? err.message : err),
        placement: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, task: WritingTaskItem) => {
    e.stopPropagation();
    modal.confirm({
      title: t('common.task.deleteConfirm.title'),
      content: t('common.task.deleteConfirm.content', {
        name: getTaskTitle(task, scopeLabels.defaultTitle),
      }),
      onOk: async () => {
        setDeletingId(task.id);
        try {
          const res = await deleteTask(task.id);
          if (res.error) {
            ctxMessage.error(res.error);
          } else {
            setTasks((prev) => prev.filter((item) => item.id !== task.id));
            ctxMessage.success('已删除');
            void loadTasks();
            if (viewerTask?.id === task.id) setViewerVisible(false);
          }
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleTaskClick = (t: WritingTaskItem) => {
    openGenerationTaskClick(t, {
      setReviewTask,
      setReviewVisible,
      onOpen: (task) => void openViewerForTask(task),
    });
  };

  useOpenApiTaskNav({
    page: 'graph',
    isLoggedIn,
    tasks,
    loadingTasks,
    setCreationSourceTab,
    onOpenTask: handleTaskClick,
  });

  const [billing, setBilling] = useState<TaskBillingState>({
    canSubmit: true,
    blockReason: null,
    estimate: null,
    loading: false,
  });
  const onBillingStateChange = useCallback((s: TaskBillingState) => setBilling(s), []);

  const renderForm = () => (
    <div className={TASK_V2_DRAWER_FORM_CLASS}>
      <Select
        placeholder={t('common.task.selectBusiness')}
        value={taskOptions.length > 0 ? selectedValue : undefined}
        options={graphSelectOptions}
        onChange={(v) => {
          const p = parseTaskSelectionKey(String(v));
          setTaskKey(p.taskKey);
          setSubtype(p.subtype);
          clearPendingForm();
        }}
      />
      <TaskV2TaskNameField value={taskLabel} onChange={onTaskLabelChange} />
      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
      />
      <TaskBillingBar
        scope="graph"
        taskKey={taskKey}
        subtype={subtype}
        params={formValues as Record<string, unknown>}
        enabled={!!formConfig?.schema && isLoggedIn}
        onStateChange={onBillingStateChange}
      />
      <Button
        type="primary"
        loading={submitting || billing.loading}
        disabled={!formConfig?.schema || !billing.canSubmit}
        onClick={() => void handleSubmit()}
      >
        {formatGenerateButtonLabel(t('common.generate'), billing.estimate, billing.loading, {
          insufficientBalance: billing.blockReason === 'insufficient_balance',
          locale: toAppLang(i18n.language),
        })}
      </Button>
    </div>
  );

  return (
    <section className="page-card generation-console-page graph-page">
      <GenerationTaskToolbar
        creationSource={{ value: creationSourceTab, onChange: setCreationSourceTab }}
        filters={
          <>
            <GenerationTaskFilterSelect
              value={filterSelectionKey}
              onChange={(v) => setFilterSelectionKey(v)}
              aria-label="图片业务"
            >
              <option value="">全部业务</option>
              {graphSelectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </GenerationTaskFilterSelect>
            <GenerationTaskFilterSelect
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              aria-label={t('common.task.filter.statusAria')}
            >
              <option value="">{t('common.task.filter.allStatuses')}</option>
              {statusOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </GenerationTaskFilterSelect>
          </>
        }
        onRefresh={() => void loadTasks()}
        refreshLoading={loadingTasks}
        primaryAction={{
          label: scopeLabels.createLabel,
          onClick: () => setFormOpen(true),
          disabled: !isLoggedIn,
        }}
        bulkSelection={bulk.toolbarBulkSelection}
      />

      <GenerationTaskListScroll
        className="graph-list-scroll"
        onRefresh={() => void loadTasks()}
        refreshing={loadingTasks}
        disabled={!isLoggedIn}
      >
        {!isLoggedIn ? (
          <p className="muted">{t('auth.pleaseLoginToViewTasks')}</p>
        ) : loadingTasks ? (
          <TaskListLoading layout="media-grid" kind="image" count={6} />
        ) : filteredTasks.length === 0 ? (
          <p className="muted">
            {creationSourceTab === 'open_api'
              ? t('generation.empty.openApiScoped', { scope: scopeLabels.scopeLabel })
              : scopeLabels.emptyHint}
          </p>
        ) : (
          <ul className="graph-task-list">
            {filteredTasks.map((task) => {
              const bizLabel = formatTaskBusinessDisplay(taskSelectionLabelMap, task);
              const album = isGraphAlbumTask(task);
              const mediaCount = getGraphMediaCount(task);
              return (
              <li
                key={task.id}
                className={`graph-task-item graph-task-item-clickable${
                  album ? ' graph-task-item--album' : ''
                }${bulk.isSelected(task.id) ? ' generation-task-item--selected' : ''}${
                  bulk.selectionMode ? ' generation-task-item--selecting' : ''
                }`}
                role="button"
                tabIndex={0}
                onClick={() => bulk.wrapTaskClick(task.id, () => handleTaskClick(task))}
                onKeyDown={(e) => e.key === 'Enter' && bulk.wrapTaskClick(task.id, () => handleTaskClick(task))}
              >
                {bulk.selectionMode ? (
                  <TaskCardSelectCheckbox
                    checked={bulk.isSelected(task.id)}
                    onToggle={() => bulk.toggleSelected(task.id)}
                  />
                ) : null}
                <GraphTaskThumb
                  taskId={task.id}
                  status={task.status}
                  progress={task.progress?.progress ?? null}
                  thumbUrl={thumbMap[task.id]}
                  albumThumbUrls={album ? albumThumbsMap[task.id] : undefined}
                  onRequest={requestThumbnail}
                  hasMedia={graphTaskHasMedia(task)}
                  isAlbum={album}
                  mediaCount={mediaCount}
                />
                <div className="graph-task-content">
                  <span className="graph-task-title" title={getTaskTitle(task, scopeLabels.defaultTitle)}>
                    {getTaskTitle(task, scopeLabels.defaultTitle)}
                  </span>
                  <div className="graph-task-meta">
                    <TaskOpenApiBadge metadata={task.metadata} />
                    {album ? (
                      <span className="graph-task-album-badge">
                        {t('common.viewer.graph.albumBadge', { count: mediaCount })}
                      </span>
                    ) : null}
                    {bizLabel && (
                      <span className="graph-task-subtype">{bizLabel}</span>
                    )}
                    <code className="graph-task-id" title={task.id}>
                      {task.id.length > 12 ? `${task.id.slice(0, 12)}…` : task.id}
                    </code>
                    {task.progress?.error && (
                      <span className="graph-task-error" title={task.progress.error}>
                        {task.progress.error.slice(0, 40)}…
                      </span>
                    )}
                  </div>
                </div>
                <div className="graph-task-actions">
                  <span className={`graph-task-status graph-task-status--${task.status}`}>
                    {getTaskStatusLabel(task.status, t)}
                  </span>
                  {isTaskRetryable(task.status, task.progress?.error) && !bulk.selectionMode && (
                    <TaskCardRetryButton taskId={task.id} onRetried={() => void fetchTaskIntoList(task.id)} />
                  )}
                </div>
                {!bulk.selectionMode ? (
                  <TaskCardMoreMenu
                    onDelete={(e) => void handleDeleteTask(e, task)}
                    onMove={(e) => {
                      e.stopPropagation();
                      bulk.openMoveToFolder([task.id]);
                    }}
                    onDownload={async (e) => {
                      e.stopPropagation();
                      await downloadGenerationTask(task, 'graph');
                    }}
                    completedActionsEnabled={task.status === 'completed'}
                    disabled={deletingId === task.id}
                    deleting={deletingId === task.id}
                  />
                ) : null}
              </li>
              );
            })}
          </ul>
        )}
      </GenerationTaskListScroll>

      <ManualReviewModal
        open={reviewVisible}
        task={reviewTask}
        onClose={() => {
          setReviewVisible(false);
          setReviewTask(null);
        }}
        onApproved={() => void loadTasks()}
      />

      <GraphViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask, scopeLabels.defaultTitle) : '图片结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
        navigation={viewerNavigation}
        variant={viewerAlbumMode ? 'album' : 'single'}
        onRetryAlbumItem={viewerAlbumMode ? handleRetryAlbumItem : undefined}
        onRemoveAlbumItem={viewerAlbumMode ? handleRemoveAlbumItem : undefined}
      />

      {bulk.moveModal}

      <Drawer
        title={
          <div className="task-v2-drawer-header">
            <span className="task-v2-drawer-header__title">{scopeLabels.createLabel}</span>
            <TaskV2CreateModeSwitch value={createMode} onChange={setCreateMode} />
          </div>
        }
        placement="right"
        size={520}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setCreateMode('form');
        }}
        destroyOnHidden
        className="graph-drawer task-v2-create-drawer"
      >
        <TaskV2CreateSurface
          scope="graph"
          mode={createMode}
          onModeChange={setCreateMode}
          open={formOpen}
        >
          {renderForm()}
        </TaskV2CreateSurface>
      </Drawer>
    </section>
  );
}
