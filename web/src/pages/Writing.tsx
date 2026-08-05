import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Drawer, message, App } from 'antd';
import {
  listWritingTasks,
  invalidateTaskListCache,
  deleteTask,
  fetchWritingMediaContent,
  fetchWritingOfficeEmbedUrl,
  writingTaskPrefersPdfPreview,
  writingTaskPrefersPptxPreview,
  getTask,
  removeCollectionItem,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { type TaskBillingState } from '../components/billing/TaskBillingBar';
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
import { WritingViewerModal } from '../components/WritingViewerModal';
import { ManualReviewModal } from '../components/ManualReviewModal';
import { WritingCreateWizard } from '../components/WritingCreateWizard';
// create UX: WritingCreateWizard only（已废弃 WritingWarpGuidedCreate / 长表单）
import { openGenerationTaskClick } from '../shared/openMediaGenerationTask';
import { WritingTaskCard } from '../components/task-list/WritingTaskCard';
import { TaskListLoadSentinel } from '../components/task-list/TaskListLoadSentinel';
import { downloadGenerationTask } from '../lib/downloadGenerationTask';
import {
  extractCgiTaskFromApiResponse,
  extractFullCgiTaskFromApiResponse,
} from '../notifications/task-snapshot';
import { mergeTaskIntoList, resolveTaskListStatus } from '../utils/mergeTaskItem';
import {
  useTaskV2FormConfig,
  formatTaskSelectionKey,
  TASK_V2_DRAWER_FORM_CLASS,
  TaskV2CreateSurface,
  TaskV2CreateModeSwitch,
  type TaskV2CreateMode,
  buildTaskSelectionLabelMap,
  buildTaskSelectionSelectOptions,
  formatTaskBusinessDisplayFull,
  taskMatchesSelectionFilter,
} from '../task-v2';
import { useOpenApiTaskNav } from '../hooks/useOpenApiTaskNav';
import { useGenerationTaskListBulkActions } from '../hooks/useGenerationTaskListBulkActions';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import { useTaskScopeLabels } from '../i18n/useTaskScopeLabels';
import { useTaskStatusOptions } from '../i18n/useTaskStatusOptions';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

async function waitForAwaitingReview(
  taskId: string,
  attempts = 12,
  intervalMs = 400
): Promise<WritingTaskItem | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await getTask(taskId);
    const item = extractCgiTaskFromApiResponse(res.data);
    if (item?.status === 'awaiting_review') return item;
    if (item && ['failed', 'cancelled', 'completed', 'network_error'].includes(item.status)) {
      return item;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

function getTaskTitle(task: WritingTaskItem, defaultTitle: string): string {
  const labelVal =
    (task.metadata?.label as string)?.trim() ||
    (task.metadata?.writing_type_label as string)?.trim();
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string) || '';
  return (
    labelVal ||
    (promptVal?.trim().length
      ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
      : defaultTitle)
  );
}

export default function Writing() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('writing');
  const statusOptions = useTaskStatusOptions();
  const { modal, message: ctxMessage } = App.useApp();
  const { isLoggedIn } = useAuth();

  const [filterSelectionKey, setFilterSelectionKey] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [creationSourceTab, setCreationSourceTab] = useState<TaskCreationSourceTab>('web');

  const listResetKey = `${creationSourceTab}|${filterStatus}|${filterSelectionKey}`;

  const fetchWritingPage = useCallback(
    async (offset: number, limit: number) => {
      const res = await listWritingTasks({
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
    tasks: allTasks,
    setTasks: setAllTasks,
    hasMore,
    loadingInitial: loadingTasks,
    loadingMore,
    loadMore,
    refresh: loadTasks,
  } = usePaginatedCgiTaskList({
    enabled: isLoggedIn,
    resetKey: listResetKey,
    fetchPage: fetchWritingPage,
  });

  const [gridEpoch, setGridEpoch] = useState(0);
  const prevTaskCountRef = useRef(0);
  useEffect(() => {
    if (allTasks.length > prevTaskCountRef.current && prevTaskCountRef.current > 0) {
      setGridEpoch((n) => n + 1);
    }
    prevTaskCountRef.current = allTasks.length;
  }, [allTasks.length]);

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
    resetFormValues,
    configLoading,
    listLoading,
    taskLabel,
    onTaskLabelChange,
    mergeTaskLabelIntoParams,
    resetTaskLabelAfterSubmit,
  } = useTaskV2FormConfig({ scope: 'writing', enabled: isLoggedIn, formDrawerOpen: formOpen });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const appLang = toAppLang(i18n.language);
  const writingSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, appLang),
    [taskOptions, appLang]
  );
  const taskSelectionLabelMap = useMemo(
    () => buildTaskSelectionLabelMap(taskOptions, appLang),
    [taskOptions, appLang]
  );

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerContent, setViewerContent] = useState<string>('');
  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);
  const [viewerPdfHeaders, setViewerPdfHeaders] = useState<Record<string, string> | null>(null);
  const [viewerPptxUrl, setViewerPptxUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);

  const clearViewerPdf = useCallback(() => {
    setViewerPdfUrl(null);
    setViewerPdfHeaders(null);
    setViewerPptxUrl(null);
  }, []);

  useEffect(() => () => clearViewerPdf(), [clearViewerPdf]);

  const { fetchTaskIntoList } = useCgiTaskListSync(isLoggedIn, setAllTasks, loadTasks, {
    listScope: 'writing',
  });

  // 进行中任务：5s 主动拉一次状态（WS 丢包时列表不会卡在「生成中」两分钟）
  useEffect(() => {
    if (!isLoggedIn) return;
    const inflight = allTasks.filter((t) =>
      ['pending', 'queued', 'processing'].includes(String(t.status ?? ''))
    );
    if (inflight.length === 0) return;
    const timer = window.setInterval(() => {
      for (const t of inflight.slice(0, 8)) {
        void fetchTaskIntoList(t.id);
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [isLoggedIn, allTasks, fetchTaskIntoList]);

  const filteredTasks = useMemo(
    () =>
      allTasks
        .filter((t) => taskMatchesSelectionFilter(t, filterSelectionKey))
        .sort(
          (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        ),
    [allTasks, filterSelectionKey]
  );

  const bulk = useGenerationTaskListBulkActions({
    tasks: filteredTasks,
    setTasks: setAllTasks,
    modal,
    message: ctxMessage,
    onDeletedIds: (ids) => {
      if (viewerTask && ids.has(viewerTask.id)) setViewerVisible(false);
    },
  });

  const [billing, setBilling] = useState<TaskBillingState>({
    canSubmit: true,
    blockReason: null,
    estimate: null,
    loading: false,
  });
  const onBillingStateChange = useCallback((s: TaskBillingState) => {
    setBilling((prev) => {
      if (
        prev.canSubmit === s.canSubmit &&
        prev.blockReason === s.blockReason &&
        prev.loading === s.loading &&
        prev.estimate === s.estimate
      ) {
        return prev;
      }
      return s;
    });
  }, []);

  const finishCreateDrawer = useCallback(() => {
    setFormOpen(false);
    resetFormValues();
    resetTaskLabelAfterSubmit();
    void loadTasks();
  }, [resetFormValues, resetTaskLabelAfterSubmit, loadTasks]);

  const onGuidedTaskCreated = useCallback(
    (id: string) => {
      void fetchTaskIntoList(id);
      // 闸门由 WritingCreateWizard 内联处理，勿再弹 ManualReviewModal
    },
    [fetchTaskIntoList]
  );

  const renderForm = () => (
    <div className={TASK_V2_DRAWER_FORM_CLASS}>
      <WritingCreateWizard
        taskOptions={taskOptions}
        selectOptions={writingSelectOptions}
        selectedValue={selectedValue}
        onSelectBusiness={(k, st) => {
          setTaskKey(k);
          setSubtype(st);
          clearPendingForm();
        }}
        taskKey={taskKey}
        subtype={subtype}
        formConfig={formConfig}
        configLoading={configLoading || listLoading}
        taskLabel={taskLabel}
        onTaskLabelChange={onTaskLabelChange}
        mergeTaskLabelIntoParams={mergeTaskLabelIntoParams}
        locale={toAppLang(i18n.language)}
        generateLabel={t('common.generate')}
        billing={billing}
        onBillingStateChange={onBillingStateChange}
        onTaskCreated={onGuidedTaskCreated}
        onFinished={finishCreateDrawer}
      />
    </div>
  );

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
            setAllTasks((prev) => prev.filter((item) => item.id !== task.id));
            if (viewerTask?.id === task.id) setViewerVisible(false);
          }
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const openWritingViewer = async (t: WritingTaskItem) => {
    clearViewerPdf();
    setViewerVisible(true);
    setViewerTask(t);
    setViewerContent('');
    setViewerError(null);
    setViewerLoading(true);
    try {
      let detail: WritingTaskItem = t;
      // 拉完整任务（含 pipelineTrace / requestParams），列表摘要不够看「数据」页
      try {
        const detailRes = await getTask(t.id);
        const full = extractFullCgiTaskFromApiResponse(detailRes.data);
        if (full) {
          detail = full;
          setViewerTask(full);
          // 详情已终态时回写列表，避免正文已出但卡片仍显示「生成中」
          setAllTasks((prev) => mergeTaskIntoList(prev, full));
          if (full.status !== t.status) invalidateTaskListCache();
        }
      } catch {
        /* 详情失败仍可用列表行打开数据页 */
      }

      const terminalNoContent = ['failed', 'cancelled', 'network_error'].includes(detail.status);
      if (terminalNoContent) {
        // 失败任务通常无正文；不请求 content，避免挡住「数据」页
        return;
      }

      const media = await fetchWritingMediaContent(t.id);
      if (media.kind === 'pdf') {
        setViewerPdfUrl(media.sourceUrl);
        setViewerPdfHeaders(media.httpHeaders);
      } else if (media.kind === 'pptx') {
        // 优先公网签名 HTTPS，供 Office Online 嵌真 PPTX；失败再退回鉴权 URL（页舞台）
        const officeSrc = await fetchWritingOfficeEmbedUrl(t.id).catch(() => null);
        setViewerPptxUrl(officeSrc || media.sourceUrl);
      } else {
        setViewerContent(media.text);
        const meta = (detail.result?.metadata ?? detail.metadata) as
          | Record<string, unknown>
          | undefined;
        if (meta?.pdfRenderStatus === 'failed') {
          const hint =
            typeof meta.pdfRenderError === 'string' && meta.pdfRenderError.trim()
              ? meta.pdfRenderError
              : 'PDF 生成失败，已降级为 Markdown 阅读';
          ctxMessage.warning(hint);
        } else if (meta?.presentationRenderStatus === 'failed') {
          const hint =
            typeof meta.presentationRenderError === 'string' &&
            meta.presentationRenderError.trim()
              ? meta.presentationRenderError
              : 'PPTX 生成失败，已降级为大纲阅读';
          ctxMessage.warning(hint);
        } else if (writingTaskPrefersPdfPreview(detail)) {
          ctxMessage.warning('PDF 缓存未能流式打开，已降级为 Markdown 阅读');
        } else if (writingTaskPrefersPptxPreview(detail)) {
          ctxMessage.warning('PPTX 缓存未能打开，已降级为大纲阅读');
        }
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  const handleRemoveCollectionItem = useCallback(async (itemId: string) => {
    const taskId = viewerTask?.id;
    if (!taskId) throw new Error('缺少任务');
    const res = await removeCollectionItem(taskId, itemId);
    if (res.error) throw new Error(res.error);

    const detailRes = await getTask(taskId);
    const full = extractFullCgiTaskFromApiResponse(detailRes.data);
    if (!full) throw new Error('删除成功但无法刷新任务');

    setViewerTask(full);
    setAllTasks((prev) => mergeTaskIntoList(prev, full));
    invalidateTaskListCache();

    try {
      const media = await fetchWritingMediaContent(taskId);
      if (media.kind === 'pdf') {
        clearViewerPdf();
        setViewerPdfUrl(media.sourceUrl);
        setViewerPdfHeaders(media.httpHeaders);
        setViewerContent('');
      } else if (media.kind === 'pptx') {
        clearViewerPdf();
        const officeSrc = await fetchWritingOfficeEmbedUrl(taskId).catch(() => null);
        setViewerPptxUrl(officeSrc || media.sourceUrl);
        setViewerContent('');
      } else {
        clearViewerPdf();
        setViewerContent(media.text);
      }
    } catch {
      /* 正文刷新失败不影响文集 metadata 已更新 */
    }
  }, [viewerTask?.id]);

  const handleTaskClick = async (t: WritingTaskItem) => {
    openGenerationTaskClick(t, {
      setReviewTask,
      setReviewVisible,
      onOpen: (task) => void openWritingViewer(task),
    });
  };

  useOpenApiTaskNav({
    page: 'writing',
    isLoggedIn,
    tasks: allTasks,
    loadingTasks,
    setCreationSourceTab,
    onOpenTask: handleTaskClick,
  });

  return (
    <section className="page-card generation-console-page writing-page">
      <GenerationTaskToolbar
        creationSource={{ value: creationSourceTab, onChange: setCreationSourceTab }}
        filters={
          <>
            <GenerationTaskFilterSelect
              value={filterSelectionKey}
              onChange={(v) => setFilterSelectionKey(v)}
              aria-label="写作业务"
            >
              <option value="">全部业务</option>
              {writingSelectOptions.map((o) => (
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
        onRefresh={() => {
          invalidateTaskListCache();
          void loadTasks();
        }}
        refreshLoading={loadingTasks}
        primaryAction={{
          label: scopeLabels.createLabel,
          onClick: () => setFormOpen(true),
          disabled: !isLoggedIn,
        }}
        bulkSelection={bulk.toolbarBulkSelection}
      />

      <GenerationTaskListScroll
        className="writing-list-scroll"
        onRefresh={() => {
          invalidateTaskListCache();
          void loadTasks();
        }}
        refreshing={loadingTasks}
        disabled={!isLoggedIn}
      >
        {!isLoggedIn ? (
          <p className="muted">{t('auth.pleaseLoginToViewTasks')}</p>
        ) : loadingTasks ? (
          <TaskListLoading layout="media-grid" kind="writing" count={6} />
        ) : filteredTasks.length === 0 ? (
          <p className="muted">
            {creationSourceTab === 'open_api'
              ? t('generation.empty.openApiScoped', { scope: scopeLabels.scopeLabel })
              : scopeLabels.emptyHint}
          </p>
        ) : (
          <ul className="writing-task-list">
            {filteredTasks.map((task) => {
              const { taskLabel: typeLabel, subtypeLabel } = formatTaskBusinessDisplayFull(
                taskSelectionLabelMap,
                task
              );
              const displayStatus = resolveTaskListStatus(task);
              return (
                <WritingTaskCard
                  key={task.id}
                  task={task}
                  title={getTaskTitle(task, scopeLabels.defaultTitle)}
                  status={displayStatus}
                  statusLabel={getTaskStatusLabel(displayStatus, t)}
                  typeLabel={typeLabel || undefined}
                  subtypeLabel={subtypeLabel || undefined}
                  animateKey={gridEpoch}
                  onClick={() => bulk.wrapTaskClick(task.id, () => void handleTaskClick(task))}
                  onDelete={(e) => void handleDeleteTask(e, task)}
                  onMove={(e) => {
                    e.stopPropagation();
                    bulk.openMoveToFolder([task.id]);
                  }}
                  onDownload={async (e) => {
                    e.stopPropagation();
                    await downloadGenerationTask(task, 'writing');
                  }}
                  deleting={deletingId === task.id}
                  selectionMode={bulk.selectionMode}
                  selected={bulk.isSelected(task.id)}
                  onToggleSelect={() => bulk.toggleSelected(task.id)}
                />
              );
            })}
            <TaskListLoadSentinel
              enabled={hasMore && !filterSelectionKey}
              loading={loadingMore}
              onVisible={() => void loadMore()}
            />
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
        onApproved={() => {
          const id = reviewTask?.id;
          void (async () => {
            await loadTasks();
            if (!id) return;
            const next = await waitForAwaitingReview(id, 20, 500);
            if (next?.status === 'awaiting_review') {
              setReviewTask(next);
              setReviewVisible(true);
            }
          })();
        }}
      />

      <WritingViewerModal
        visible={viewerVisible}
        onClose={() => {
          clearViewerPdf();
          setViewerVisible(false);
        }}
        title={viewerTask ? getTaskTitle(viewerTask, scopeLabels.defaultTitle) : '写作内容'}
        content={viewerContent}
        pdfPreviewUrl={viewerPdfUrl}
        pdfHttpHeaders={viewerPdfHeaders}
        pptxPreviewUrl={viewerPptxUrl}
        task={viewerTask}
        loading={viewerLoading}
        error={viewerError}
        onRemoveCollectionItem={handleRemoveCollectionItem}
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
        className="writing-drawer task-v2-create-drawer"
      >
        <TaskV2CreateSurface
          scope="writing"
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
