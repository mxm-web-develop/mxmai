import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Drawer, Select,  message, App } from 'antd';
import {
  listCgiTasks,
  deleteTask,
  fetchMediaBlobUrl,
  getTask,
  getAuthenticatedMediaStreamUrl,
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
import { extractFullCgiTaskFromApiResponse } from '../notifications/task-snapshot';
import { useAuth } from '../context/AuthContext';
import { useCgiTaskListSync } from '../hooks/useCgiTaskListSync';
import { shouldShowInTaskList } from '../lib/taskListVisibility';
import {
  GenerationTaskFilterSelect,
  GenerationTaskToolbar,
} from '../components/GenerationTaskToolbar';
import { TaskOpenApiBadge } from '../components/TaskOpenApiBadge';
import { TaskCardRetryButton, isTaskRetryable } from '../components/TaskCardRetryButton';
import { TaskCardMoreMenu } from '../components/task-list/TaskCardMoreMenu';
import { GenerationTaskListScroll } from '../components/task-list/PullToRefreshScroll';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';
import { TaskListLoading } from '../components/asset-loading';
import { VideoViewerModal } from '../components/VideoViewerModal';
import { ManualReviewModal } from '../components/ManualReviewModal';
import { openGenerationTaskClick } from '../shared/openMediaGenerationTask';
import {
  formatManualReviewProgressDetail,
  formatManualReviewProgressLabel,
  resolveTaskListStatus,
  hasPendingManualReviewGate,
  isTaskMediaReady,
  mergeTaskIntoList,
} from '../utils/mergeTaskItem';
import { VideoTaskThumb } from '../components/VideoTaskThumb';
import { useVideoTaskThumbnails } from '../hooks/useVideoTaskThumbnails';
import { extractAutocutClipPreviews } from '../lib/autocutClipPreviews';
import type { AutocutClipPreview } from '../lib/autocutClipPreviews';
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
  collectListTaskIdsFromRunTaskV2Response,
  prepareTaskV2SubmitParams,
  validateTaskV2SubmitParams,
  buildTaskSelectionLabelMap,
  buildTaskSelectionSelectOptions,
  formatTaskBusinessDisplayFull,
} from '../task-v2';
import { useOpenApiTaskNav } from '../hooks/useOpenApiTaskNav';
import { useGenerationTaskListBulkActions } from '../hooks/useGenerationTaskListBulkActions';
import { TaskCardSelectCheckbox } from '../components/task-list/TaskCardSelectCheckbox';
import { invalidateAuthenticatedMediaStreamCache } from '../lib/mediaBlobCache';
import type { TaskSelectionLabels } from '../task-v2';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import { useTaskScopeLabels } from '../i18n/useTaskScopeLabels';
import { useTaskStatusOptions } from '../i18n/useTaskStatusOptions';

function getTaskTitle(
  task: WritingTaskItem,
  defaultTitle: string,
  labelMap?: Map<string, TaskSelectionLabels>
): string {
  const labelVal = (task.metadata?.label as string)?.trim();
  if (labelVal) return labelVal;
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const inner = rp?.params as Record<string, unknown> | undefined;
  const innerLabel = (inner?.metadata as Record<string, unknown> | undefined)?.label;
  if (typeof innerLabel === 'string' && innerLabel.trim()) return innerLabel.trim();
  const promptVal = (inner?.prompt as string)?.trim();
  if (promptVal) {
    return `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`;
  }
  if (labelMap) {
    const labels = formatTaskBusinessDisplayFull(labelMap, task);
    if (labels.subtypeLabel) return `${labels.taskLabel} / ${labels.subtypeLabel}`;
    if (labels.taskLabel) return labels.taskLabel;
  }
  return defaultTitle;
}

export default function Video() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('video');
  const statusOptions = useTaskStatusOptions();
  const { notification: ctxNotification, modal, message: ctxMessage } = App.useApp();
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  } = useTaskV2FormConfig({ scope: 'video', enabled: isLoggedIn, formDrawerOpen: formOpen });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const appLang = toAppLang(i18n.language);
  const videoSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, appLang),
    [taskOptions, appLang]
  );
  const taskSelectionLabelMap = useMemo(
    () => buildTaskSelectionLabelMap(taskOptions, appLang),
    [taskOptions, appLang]
  );

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [creationSourceTab, setCreationSourceTab] = useState<TaskCreationSourceTab>('web');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerVideoUrl, setViewerVideoUrl] = useState<string | null>(null);
  const [viewerClipPreviews, setViewerClipPreviews] = useState<AutocutClipPreview[]>([]);
  const [viewerHint, setViewerHint] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const videoBlobFallbackRef = useRef<string | null>(null);

  // 首次进入清除旧版缓存的无 token 直链，避免黑屏
  useEffect(() => {
    invalidateAuthenticatedMediaStreamCache();
  }, []);

  // 仅首次进入页面时展示整体 loading，后续轮询静默更新，避免列表反复“闪一下”
  const hasInitialLoadedRef = useRef(false);

  const loadTasks = useCallback(async (options?: { force?: boolean }) => {
    if (!isLoggedIn) return;
    if (!hasInitialLoadedRef.current) {
      setLoadingTasks(true);
    }
    try {
      const res = await listCgiTasks(
        {
          type: 'video',
          limit: 200,
          offset: 0,
          creationSource: creationSourceTab,
        },
        { force: options?.force }
      );
      if (res.error) {
        console.error('加载视频任务失败:', res.error);
        setLoadError(res.error);
        return;
      }
      setLoadError(null);
      const body = res.data as WritingTaskListResponse | undefined;
      const list = (body?.data?.tasks ?? []).filter((t) => shouldShowInTaskList(t, 'video'));
      setTasks(list);
    } catch (e) {
      console.error('加载视频任务失败:', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      hasInitialLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [isLoggedIn, creationSourceTab]);

  useEffect(() => {
    if (!isLoggedIn) return;
    hasInitialLoadedRef.current = false;
    void loadTasks({ force: true });
  }, [isLoggedIn, creationSourceTab, loadTasks]);

  const { fetchTaskIntoList } = useCgiTaskListSync(isLoggedIn, setTasks, loadTasks, {
    listScope: 'video',
  });

  const filteredTasks = tasks
    .filter((t) => !filterStatus || t.status === filterStatus)
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

  const thumbEligibleIds = useMemo(
    () =>
      filteredTasks
        .filter((t) => {
          const s = resolveTaskListStatus(t);
          return (
            t.status === 'completed' ||
            s === 'awaiting_review' ||
            s === 'completed' ||
            extractAutocutClipPreviews(t).length > 0
          );
        })
        .map((t) => t.id),
    [filteredTasks]
  );
  const taskById = useMemo(
    () => Object.fromEntries(filteredTasks.map((t) => [t.id, t])),
    [filteredTasks]
  );
  const { thumbMap, requestThumbnail } = useVideoTaskThumbnails(thumbEligibleIds, taskById);

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
        options={videoSelectOptions}
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
        scope="video"
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
      const cleanParams = prepareTaskV2SubmitParams(
        formValues as Record<string, unknown>,
        formConfig?.schema,
        { scope: 'video' }
      );
      const validationError = validateTaskV2SubmitParams(cleanParams, formConfig?.schema);
      if (validationError) {
        ctxMessage.error(validationError);
        return;
      }
      const res = await runTaskV2({
        scope: 'video',
        taskKey,
        subtype,
        params: mergeTaskLabelIntoParams(cleanParams),
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
      setFormOpen(false);
      resetFormValues();
      resetTaskLabelAfterSubmit();
      const listIds = collectListTaskIdsFromRunTaskV2Response(res.data);
      for (const id of listIds) {
        void fetchTaskIntoList(id);
      }
      void loadTasks();
    } catch (err) {
      ctxNotification.error({
        message: t('common.submitFailed'),
        description: err instanceof Error ? err.message : String(err),
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
        name: getTaskTitle(task, scopeLabels.defaultTitle, taskSelectionLabelMap),
      }),
      onOk: async () => {
        setDeletingId(task.id);
        try {
          const res = await deleteTask(task.id);
          if (res.error) {
            message.error(res.error);
          } else {
            loadTasks();
            if (viewerTask?.id === task.id) setViewerVisible(false);
          }
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const openVideoViewer = async (t: WritingTaskItem) => {
    if (hasPendingManualReviewGate(t)) {
      setReviewTask(t);
      setReviewVisible(true);
      return;
    }

    setViewerVisible(true);
    setViewerTask(t);
    setViewerError(null);
    setViewerHint(null);
    setViewerClipPreviews([]);
    videoBlobFallbackRef.current = null;

    const clips = extractAutocutClipPreviews(t);

    if (t.status === 'completed' && isTaskMediaReady(t)) {
      setViewerVideoUrl(getAuthenticatedMediaStreamUrl(t.id, 'video'));
      setViewerClipPreviews(clips);
      setViewerLoading(false);
      return;
    }

    // 未完成：有片段预览则直接展示；已完成或缺媒体摘要时再拉详情
    if (clips.length > 0 && t.status !== 'completed') {
      setViewerVideoUrl(null);
      setViewerClipPreviews(clips);
      setViewerLoading(false);
      setViewerHint('以下为管线中已生成的 AI 视频 / 配图预览。');
      return;
    }

    setViewerVideoUrl(null);
    setViewerLoading(true);
    try {
      const detailRes = await getTask(t.id);
      const full = extractFullCgiTaskFromApiResponse(detailRes.data);
      if (full) {
        setViewerTask(full);
        setTasks((prev) => mergeTaskIntoList(prev, full));
        const detailClips = extractAutocutClipPreviews(full);
        if (full.status === 'completed' && isTaskMediaReady(full)) {
          setViewerVideoUrl(getAuthenticatedMediaStreamUrl(full.id, 'video'));
          setViewerClipPreviews(detailClips);
          return;
        }
        if (detailClips.length > 0) {
          setViewerClipPreviews(detailClips);
          setViewerHint(
            full.status === 'completed' && !isTaskMediaReady(full)
              ? '最终成片尚未导出；以下为管线中已生成的 AI 视频 / 配图，可预览。完整流程请从列表进入审核。'
              : '以下为管线中已生成的 AI 视频 / 配图预览。'
          );
          return;
        }
        if (full.status === 'completed') {
          setViewerError('任务尚未生成最终视频，请从列表进入审核继续流程。');
        }
        return;
      }

      if (clips.length > 0) {
        setViewerClipPreviews(clips);
        setViewerHint('以下为管线中已生成的 AI 视频 / 配图预览。');
        return;
      }
      if (t.status === 'completed') {
        setViewerError('任务尚未生成最终视频，请从列表进入审核继续流程。');
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  const handleTaskClick = async (t: WritingTaskItem) => {
    openGenerationTaskClick(t, {
      setReviewTask,
      setReviewVisible,
      onOpen: (task) => void openVideoViewer(task),
    });
  };

  const handleVideoPlayError = useCallback(async () => {
    const taskId = viewerTask?.id;
    if (!taskId || videoBlobFallbackRef.current === taskId) return;
    videoBlobFallbackRef.current = taskId;
    setViewerLoading(true);
    setViewerError(null);
    try {
      const blobUrl = await fetchMediaBlobUrl(taskId, 'video', {
        delivery: 'blob',
        timeoutMs: 120_000,
        useCache: true,
      });
      setViewerVideoUrl(blobUrl);
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : '视频加载失败');
    } finally {
      setViewerLoading(false);
    }
  }, [viewerTask?.id]);

  useOpenApiTaskNav({
    page: 'video',
    isLoggedIn,
    tasks,
    loadingTasks,
    setCreationSourceTab,
    onOpenTask: handleTaskClick,
  });

  return (
    <section className="page-card generation-console-page video-page">
      <GenerationTaskToolbar
        creationSource={{ value: creationSourceTab, onChange: setCreationSourceTab }}
        filters={
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
        }
        onRefresh={() => void loadTasks({ force: true })}
        refreshLoading={loadingTasks}
        primaryAction={{
          label: scopeLabels.createLabel,
          onClick: () => setFormOpen(true),
          disabled: !isLoggedIn,
        }}
        bulkSelection={bulk.toolbarBulkSelection}
      />

      <GenerationTaskListScroll
        className="video-list-scroll"
        onRefresh={() => void loadTasks({ force: true })}
        refreshing={loadingTasks}
        disabled={!isLoggedIn}
      >
        {!isLoggedIn ? (
          <p className="muted">{t('auth.pleaseLoginToViewTasks')}</p>
        ) : loadingTasks ? (
          <TaskListLoading layout="row-list" kind="video" count={5} />
        ) : loadError ? (
          <p className="muted">{t('common.task.loadError', { error: loadError })}</p>
        ) : filteredTasks.length === 0 ? (
          <p className="muted">
            {creationSourceTab === 'open_api'
              ? t('generation.empty.openApiScoped', { scope: scopeLabels.scopeLabel })
              : scopeLabels.emptyHint}
          </p>
        ) : (
          <ul className="video-task-list">
            {filteredTasks.map((task) => {
              const displayStatus = resolveTaskListStatus(task);
              const reviewLabel = formatManualReviewProgressLabel(task);
              const reviewDetail = formatManualReviewProgressDetail(task);
              const statusLabel = reviewLabel ?? getTaskStatusLabel(displayStatus, t);
              const taskTitle = getTaskTitle(task, scopeLabels.defaultTitle, taskSelectionLabelMap);
              const idShort =
                task.id.length > 10 ? `${task.id.slice(0, 10)}…` : task.id;
              const clipPreviews = extractAutocutClipPreviews(task);
              const thumbStatus =
                displayStatus === 'awaiting_review' &&
                (thumbMap[task.id] || clipPreviews.length > 0)
                  ? 'completed'
                  : displayStatus;
              return (
              <li
                key={task.id}
                className={`video-task-item video-task-item-clickable${
                  bulk.isSelected(task.id) ? ' generation-task-item--selected' : ''
                }${bulk.selectionMode ? ' generation-task-item--selecting' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => bulk.wrapTaskClick(task.id, () => handleTaskClick(task))}
                onKeyDown={(e) =>
                  e.key === 'Enter' && bulk.wrapTaskClick(task.id, () => handleTaskClick(task))
                }
              >
                {bulk.selectionMode ? (
                  <TaskCardSelectCheckbox
                    checked={bulk.isSelected(task.id)}
                    onToggle={() => bulk.toggleSelected(task.id)}
                  />
                ) : null}
                <VideoTaskThumb
                  taskId={task.id}
                  status={thumbStatus}
                  thumbUrl={thumbMap[task.id]}
                  onRequest={requestThumbnail}
                />
                <div className="video-task-main video-task-main--with-clips">
                  <div className="video-task-main-row">
                    <span className="video-task-title" title={taskTitle}>
                      {taskTitle}
                    </span>
                    <span className="video-task-actions">
                      <span
                        className={`video-task-status video-task-status--${displayStatus}`}
                        title={reviewDetail ?? statusLabel}
                      >
                        {statusLabel}
                      </span>
                      {isTaskRetryable(displayStatus, task.progress?.error) && !bulk.selectionMode && (
                        <TaskCardRetryButton
                          taskId={task.id}
                          onRetried={() => void fetchTaskIntoList(task.id)}
                        />
                      )}
                    </span>
                  </div>
                  {clipPreviews.length > 0 ? (
                    <div
                      className="video-task-clip-strip"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {clipPreviews.slice(0, 6).map((clip) => (
                        <button
                          key={clip.clipId}
                          type="button"
                          className="video-task-clip-chip"
                          title={clip.label}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewerTask(task);
                            setViewerVideoUrl(null);
                            setViewerClipPreviews(clipPreviews);
                            setViewerHint(
                              '以下为管线中已生成的 AI 视频 / 配图；它们也是独立生成任务，可在视频/图文列表中单独打开。'
                            );
                            setViewerError(null);
                            setViewerLoading(false);
                            setViewerVisible(true);
                          }}
                        >
                          {clip.kind === 'video' ? (
                            <video src={clip.url} muted playsInline preload="metadata" />
                          ) : (
                            <img src={clip.url} alt="" loading="lazy" />
                          )}
                        </button>
                      ))}
                      {clipPreviews.length > 6 ? (
                        <span className="video-task-clip-more">+{clipPreviews.length - 6}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="video-task-meta">
                  <TaskOpenApiBadge metadata={task.metadata} />
                  <code className="video-task-id" title={task.id}>
                    {idShort}
                  </code>
                  {task.progress?.progress != null && (
                    <span className="video-task-progress">{task.progress.progress}%</span>
                  )}
                  {displayStatus === 'failed' && task.progress?.error && (
                    <span className="video-task-error" title={task.progress.error}>
                      {task.progress.error.slice(0, 40)}
                      {task.progress.error.length > 40 ? '…' : ''}
                    </span>
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
                      await downloadGenerationTask(task, 'video');
                    }}
                    completedActionsEnabled={displayStatus === 'completed'}
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
          const taskId = reviewTask?.id;
          setReviewVisible(false);
          setReviewTask(null);
          if (taskId) void fetchTaskIntoList(taskId);
          else void loadTasks();
        }}
        onApproved={() => {
          const taskId = reviewTask?.id;
          if (taskId) void fetchTaskIntoList(taskId);
          else void loadTasks();
        }}
      />

      <VideoViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={
          viewerTask
            ? getTaskTitle(viewerTask, scopeLabels.defaultTitle, taskSelectionLabelMap)
            : t('generation.results.video')
        }
        task={viewerTask}
        videoUrl={viewerVideoUrl}
        clipPreviews={viewerClipPreviews}
        hint={viewerHint}
        loading={viewerLoading}
        error={viewerError}
        onPlayError={() => void handleVideoPlayError()}
      />

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
        className="video-drawer task-v2-create-drawer"
      >
        <TaskV2CreateSurface
          scope="video"
          mode={createMode}
          onModeChange={setCreateMode}
          open={formOpen}
        >
          {renderForm()}
        </TaskV2CreateSurface>
      </Drawer>

      {bulk.moveModal}
    </section>
  );
}
