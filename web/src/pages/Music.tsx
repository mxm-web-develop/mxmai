import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Select, notification, Modal, message, App } from 'antd';
import {
  listCgiTasks,
  deleteTask,
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
import { useAuth } from '../context/AuthContext';
import { useCgiTaskListSync } from '../hooks/useCgiTaskListSync';
import { usePaginatedCgiTaskList } from '../hooks/usePaginatedCgiTaskList';
import {
  GenerationTaskFilterSelect,
  GenerationTaskToolbar,
} from '../components/GenerationTaskToolbar';
import { GenerationTaskListScroll } from '../components/task-list/PullToRefreshScroll';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';
import { TaskListLoading } from '../components/asset-loading';
import { AudioViewerModal } from '../components/AudioViewerModal';
import { TaskGridCard } from '../components/task-list/TaskGridCard';
import { MusicTaskVisual } from '../components/task-list/MusicTaskVisual';
import { TaskListLoadSentinel } from '../components/task-list/TaskListLoadSentinel';
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
  prepareTaskV2SubmitParams,
  buildTaskSelectionSelectOptions,
} from '../task-v2';
import { useOpenApiTaskNav } from '../hooks/useOpenApiTaskNav';
import { ManualReviewModal } from '../components/ManualReviewModal';
import { isTaskEligibleForManualReview } from '../shared/manualReview';
import { resolveTaskListStatus } from '../utils/mergeTaskItem';
import { openMediaGenerationTaskPreview } from '../shared/openMediaGenerationTask';
import { useGenerationTaskListBulkActions } from '../hooks/useGenerationTaskListBulkActions';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import { useTaskScopeLabels } from '../i18n/useTaskScopeLabels';
import { useTaskStatusOptions } from '../i18n/useTaskStatusOptions';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

function getTaskTitle(task: WritingTaskItem, defaultTitle: string): string {
  const labelVal = (task.metadata?.label as string)?.trim();
  if (labelVal) return labelVal;
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const textVal = (params?.text as string) || (params?.prompt as string) || '';
  return textVal?.trim().length
    ? `${textVal.slice(0, 40).replace(/\n/g, ' ').trim()}${textVal.length > 40 ? '…' : ''}`
    : defaultTitle;
}

export default function Music() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('music');
  const statusOptions = useTaskStatusOptions();
  const { notification: ctxNotification, modal, message: ctxMessage } = App.useApp();
  const { isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [billing, setBilling] = useState<TaskBillingState>({
    canSubmit: true,
    blockReason: null,
    estimate: null,
    loading: false,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [createMode, setCreateMode] = useState<TaskV2CreateMode>('form');

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [creationSourceTab, setCreationSourceTab] = useState<TaskCreationSourceTab>('web');
  const listResetKey = `${creationSourceTab}|${filterStatus}`;

  const fetchMusicPage = useCallback(
    async (offset: number, limit: number) => {
      const res = await listCgiTasks({
        type: 'music',
        limit,
        offset,
        creationSource: creationSourceTab,
        status: filterStatus || undefined,
      });
      if (res.error) throw new Error(res.error);
      const body = res.data as WritingTaskListResponse | undefined;
      return {
        tasks: body?.data?.tasks ?? [],
        total: body?.data?.total ?? 0,
      };
    },
    [creationSourceTab, filterStatus]
  );

  const {
    tasks,
    setTasks,
    hasMore,
    loadingInitial: loadingTasks,
    loadingMore,
    loadMore,
    refresh: loadTasks,
  } = usePaginatedCgiTaskList({
    enabled: isLoggedIn,
    resetKey: listResetKey,
    fetchPage: fetchMusicPage,
  });

  const [gridEpoch, setGridEpoch] = useState(0);
  const prevTaskCountRef = useRef(0);
  useEffect(() => {
    if (tasks.length > prevTaskCountRef.current && prevTaskCountRef.current > 0) {
      setGridEpoch((n) => n + 1);
    }
    prevTaskCountRef.current = tasks.length;
  }, [tasks.length]);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);

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
  } = useTaskV2FormConfig({ scope: 'music', enabled: isLoggedIn, formDrawerOpen: formOpen });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const appLang = toAppLang(i18n.language);
  const musicSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, appLang),
    [taskOptions, appLang]
  );

  const { fetchTaskIntoList } = useCgiTaskListSync(isLoggedIn, setTasks, loadTasks, {
    listScope: 'music',
  });

  const filteredTasks = useMemo(
    () =>
      [...tasks].sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      ),
    [tasks]
  );

  const bulk = useGenerationTaskListBulkActions({
    tasks: filteredTasks,
    setTasks,
    modal,
    message: ctxMessage,
    onDeletedIds: (ids) => {
      if (viewerTask && ids.has(viewerTask.id)) setViewerVisible(false);
    },
  });

  const handleRun = async () => {
    if (!taskOptions.length) {
      ctxNotification.warning({
        message: t('common.task.noBusinessConfig', { scope: scopeLabels.scopeLabel }),
        placement: 'top',
      });
      return;
    }
    setLoading(true);
    try {
      const res = await runTaskV2({
        scope: 'music',
        taskKey,
        subtype,
        params: mergeTaskLabelIntoParams(
          prepareTaskV2SubmitParams(formValues as Record<string, unknown>, formConfig?.schema, {
            scope: 'music',
          })
        ),
      });
      if (res.error) {
        if (handleTaskBillingResponseError(res)) return;
        throw new Error(res.error);
      }
      const raw = res.data as Record<string, unknown> | undefined;
      const inner = raw?.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : raw;
      const taskId = typeof inner?.taskId === 'string' ? inner.taskId : null;
      ctxNotification.success({ message: t('common.task.created.single') });
      setFormOpen(false);
      resetFormValues();
      resetTaskLabelAfterSubmit();
      if (taskId) void fetchTaskIntoList(taskId);
    } catch (e: any) {
      ctxNotification.error({ message: t('common.submitFailed'), description: e?.message || String(e) });
    } finally {
      setLoading(false);
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
            message.error(toUserFacingErrorMessage(res.error));
          } else {
            setTasks((prev) => prev.filter((item) => item.id !== task.id));
            if (viewerTask?.id === task.id) setViewerVisible(false);
          }
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleTaskClick = (t: WritingTaskItem) =>
    void openMediaGenerationTaskPreview(t, 'music', {
      setReviewTask,
      setReviewVisible,
      setViewerVisible,
      setViewerTask,
      setViewerUrls,
      setViewerLoading,
      setViewerError,
      setTasks,
      onStaleReviewCompleted: () =>
        ctxMessage.info('该任务已完成，正在打开音乐预览…'),
    });

  useOpenApiTaskNav({
    page: 'music',
    isLoggedIn,
    tasks,
    loadingTasks,
    setCreationSourceTab,
    onOpenTask: handleTaskClick,
  });

  return (
    <section className="page-card generation-console-page music-page">
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
        className="music-list-scroll"
        onRefresh={() => void loadTasks()}
        refreshing={loadingTasks}
        disabled={!isLoggedIn}
      >
        {!isLoggedIn ? (
          <p className="muted">{t('auth.pleaseLoginToViewTasks')}</p>
        ) : loadingTasks ? (
          <TaskListLoading layout="media-grid" kind="music" count={6} />
        ) : filteredTasks.length === 0 ? (
          <p className="muted">
            {creationSourceTab === 'open_api'
              ? t('generation.empty.openApiScoped', { scope: scopeLabels.scopeLabel })
              : scopeLabels.emptyHint}
          </p>
        ) : (
          <ul className="music-task-list">
            {filteredTasks.map((task) => {
              const displayStatus = resolveTaskListStatus(task);
              const awaitingReview = isTaskEligibleForManualReview(task);
              return (
                <TaskGridCard
                  key={task.id}
                  task={task}
                  prefix="music"
                  title={getTaskTitle(task, scopeLabels.defaultTitle)}
                  status={displayStatus}
                  statusLabel={getTaskStatusLabel(displayStatus, t)}
                  animateKey={gridEpoch}
                  visual={
                    <MusicTaskVisual
                      task={task}
                      status={displayStatus}
                      awaitingReview={awaitingReview}
                    />
                  }
                  onClick={() => bulk.wrapTaskClick(task.id, () => void handleTaskClick(task))}
                  onDelete={(e) => void handleDeleteTask(e, task)}
                  onMove={(e) => {
                    e.stopPropagation();
                    bulk.openMoveToFolder([task.id]);
                  }}
                  onDownload={async (e) => {
                    e.stopPropagation();
                    await downloadGenerationTask(task, 'music');
                  }}
                  deleting={deletingId === task.id}
                  selectionMode={bulk.selectionMode}
                  selected={bulk.isSelected(task.id)}
                  onToggleSelect={() => bulk.toggleSelected(task.id)}
                />
              );
            })}
            <TaskListLoadSentinel
              enabled={hasMore && !filterStatus}
              loading={loadingMore}
              onVisible={() => void loadMore()}
            />
          </ul>
        )}
      </GenerationTaskListScroll>

      <ManualReviewModal
        open={reviewVisible}
        task={reviewTask}
        title={reviewTask ? `${getTaskTitle(reviewTask, scopeLabels.defaultTitle)} · 歌词审核` : '歌词审核'}
        hint="前置 text 子任务已生成歌词/提示词。请检查、编辑后点击「开始生成」继续音乐合成。正文为临时草稿；如需长期保留请展开「保存到知识库」。"
        onClose={() => {
          setReviewVisible(false);
          setReviewTask(null);
        }}
        onApproved={() => void loadTasks()}
      />

      <AudioViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask, scopeLabels.defaultTitle) : '音乐结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
        showSubtitles={false}
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
        className="music-drawer task-v2-create-drawer"
      >
        <TaskV2CreateSurface
          scope="music"
          mode={createMode}
          onModeChange={setCreateMode}
          open={formOpen}
        >
          <div className={TASK_V2_DRAWER_FORM_CLASS}>
            <Select
              placeholder={t('common.task.selectBusiness')}
              value={taskOptions.length > 0 ? selectedValue : undefined}
              options={musicSelectOptions}
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
              surface="panel"
            />
            <TaskBillingBar
              scope="music"
              taskKey={taskKey}
              subtype={subtype}
              params={formValues as Record<string, unknown>}
              enabled={!!formConfig?.schema && isLoggedIn}
              onStateChange={setBilling}
            />
            <Button
              type="primary"
              loading={loading || billing.loading}
              disabled={!formConfig?.schema || !billing.canSubmit}
              onClick={() => void handleRun()}
            >
              {formatGenerateButtonLabel(t('common.generate'), billing.estimate, billing.loading, {
                insufficientBalance: billing.blockReason === 'insufficient_balance',
                locale: toAppLang(i18n.language),
              })}
            </Button>
          </div>
        </TaskV2CreateSurface>
      </Drawer>

      {bulk.moveModal}
    </section>
  );
}

