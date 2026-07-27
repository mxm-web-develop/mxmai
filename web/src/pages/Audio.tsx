import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { notification, Drawer, Button, Select, Modal, message, App } from 'antd';
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
import { useOpenApiTaskNav } from '../hooks/useOpenApiTaskNav';
import {
  GenerationTaskFilterSelect,
  GenerationTaskToolbar,
} from '../components/GenerationTaskToolbar';
import { GenerationTaskListScroll } from '../components/task-list/PullToRefreshScroll';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';
import { TaskListLoading } from '../components/asset-loading';
import { AudioViewerModal } from '../components/AudioViewerModal';
import { TaskGridCard } from '../components/task-list/TaskGridCard';
import { AudioTaskVisual } from '../components/task-list/AudioTaskVisual';
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
  pickTaskIdFromRunTaskV2Response,
  pickParallelFromRunTaskV2Response,
  prepareTaskV2SubmitParams,
  buildTaskSelectionSelectOptions,
} from '../task-v2';
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

export default function Audio() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('audio');
  const statusOptions = useTaskStatusOptions();
  const { notification: ctxNotification, modal, message: ctxMessage } = App.useApp();
  const { isLoggedIn } = useAuth();

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [creationSourceTab, setCreationSourceTab] = useState<TaskCreationSourceTab>('web');
  const listResetKey = `${creationSourceTab}|${filterStatus}`;

  const fetchAudioPage = useCallback(
    async (offset: number, limit: number) => {
      const res = await listCgiTasks({
        type: 'audio',
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
    fetchPage: fetchAudioPage,
  });

  const [gridEpoch, setGridEpoch] = useState(0);
  const prevTaskCountRef = useRef(0);
  useEffect(() => {
    if (tasks.length > prevTaskCountRef.current && prevTaskCountRef.current > 0) {
      setGridEpoch((n) => n + 1);
    }
    prevTaskCountRef.current = tasks.length;
  }, [tasks.length]);

  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [createMode, setCreateMode] = useState<TaskV2CreateMode>('form');
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
  } = useTaskV2FormConfig({ scope: 'audio', enabled: isLoggedIn, formDrawerOpen: formOpen });
  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const appLang = toAppLang(i18n.language);
  const audioSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, appLang),
    [taskOptions, appLang]
  );

  const { fetchTaskIntoList } = useCgiTaskListSync(isLoggedIn, setTasks, loadTasks, {
    listScope: 'audio',
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
      const res = await runTaskV2({
        scope: 'audio',
        taskKey,
        subtype,
        params: mergeTaskLabelIntoParams(
          prepareTaskV2SubmitParams(formValues as Record<string, unknown>, formConfig?.schema, {
            scope: 'audio',
          })
        ),
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
      if (taskId) void fetchTaskIntoList(taskId);
    } catch (e) {
      ctxNotification.error({
        message: t('common.submitFailed'),
        description: e instanceof Error ? e.message : String(e),
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
            message.error(res.error);
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
    void openMediaGenerationTaskPreview(t, 'audio', {
      setReviewTask,
      setReviewVisible,
      setViewerVisible,
      setViewerTask,
      setViewerUrls,
      setViewerLoading,
      setViewerError,
      setTasks,
      onStaleReviewCompleted: () =>
        ctxMessage.info('该任务已完成，正在打开音频预览…'),
    });

  useOpenApiTaskNav({
    page: 'audio',
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
        options={audioSelectOptions}
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
        scope="audio"
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
    <section className="page-card generation-console-page audio-page">
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
        className="audio-list-scroll"
        onRefresh={() => void loadTasks()}
        refreshing={loadingTasks}
        disabled={!isLoggedIn}
      >
        {!isLoggedIn ? (
          <p className="muted">{t('auth.pleaseLoginToViewTasks')}</p>
        ) : loadingTasks ? (
          <TaskListLoading layout="media-grid" kind="audio" count={6} />
        ) : filteredTasks.length === 0 ? (
          <p className="muted">
            {creationSourceTab === 'open_api'
              ? t('generation.empty.openApiScoped', { scope: scopeLabels.scopeLabel })
              : scopeLabels.emptyHint}
          </p>
        ) : (
          <ul className="audio-task-list">
            {filteredTasks.map((task) => {
              const displayStatus = resolveTaskListStatus(task);
              const awaitingReview = isTaskEligibleForManualReview(task);
              return (
                <TaskGridCard
                  key={task.id}
                  task={task}
                  prefix="audio"
                  title={getTaskTitle(task, scopeLabels.defaultTitle)}
                  status={displayStatus}
                  statusLabel={getTaskStatusLabel(displayStatus, t)}
                  animateKey={gridEpoch}
                  visual={
                    <AudioTaskVisual
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
                    await downloadGenerationTask(task, 'audio');
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
        title={reviewTask ? `${getTaskTitle(reviewTask, scopeLabels.defaultTitle)} · 口播稿审核` : '口播稿审核'}
      hint="前置 text 子任务已生成口播稿。请检查、编辑后点击「开始生成」继续 TTS 合成。正文为临时草稿，确认后不会长期保存在任务里；如需保留请展开下方「保存到知识库」。"
        onClose={() => {
          setReviewVisible(false);
          setReviewTask(null);
        }}
        onApproved={() => void loadTasks()}
      />

      <AudioViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask, scopeLabels.defaultTitle) : '音频结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
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
        className="audio-drawer task-v2-create-drawer"
      >
        <TaskV2CreateSurface
          scope="audio"
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
