import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { App, Drawer, Select, Button } from 'antd';
import {
  runTaskV2,
  listWritingTasks,
  listOutlineTasks,
  getTask,
  deleteTask,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCgiTaskListSync } from '../hooks/useCgiTaskListSync';
import { TaskListLoading } from '../components/asset-loading';
import {
  GenerationTaskSearchInput,
  GenerationTaskToolbar,
} from '../components/GenerationTaskToolbar';
import { OutlineViewerModal } from '../components/OutlineViewerModal';
import { ManualReviewModal } from '../components/ManualReviewModal';
import { TaskCardMoreMenu } from '../components/task-list/TaskCardMoreMenu';
import { MoveTasksToKnowledgeFolderModal } from '../components/task-list/MoveTasksToKnowledgeFolderModal';
import { GenerationTaskListScroll } from '../components/task-list/PullToRefreshScroll';
import { downloadGenerationTask } from '../lib/downloadGenerationTask';
import type { OutlineNode, CharacterProfile } from '../components/OutlineViewerModal';
import {
  useTaskV2FormConfig,
  formatTaskSelectionKey,
  parseTaskSelectionKey,
  TaskV2SchemaForm,
  TaskV2TaskNameField,
  TASK_V2_DRAWER_FORM_CLASS,
  buildTaskSelectionSelectOptions,
} from '../task-v2';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { getTaskStatusLabel } from '../i18n/taskStatus';
import { useTaskScopeLabels } from '../i18n/useTaskScopeLabels';
import { openGenerationTaskClick } from '../shared/openMediaGenerationTask';

function tryParseOutlineFromText(text: string): OutlineNode | OutlineNode[] | null {
  if (!text) return null;
  let cleaned = text.trim();
  // 去掉可能的 markdown 代码块包裹
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*/i, '').replace(/\s*```$/i, '');
  }
  // 尝试截取第一个 JSON 对象或数组
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start < 0) return null;
  const candidate = cleaned.slice(start);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed)) return parsed as OutlineNode[];
    if (parsed && typeof parsed === 'object') return parsed as OutlineNode;
    return null;
  } catch {
    return null;
  }
}

export default function Outline() {
  const { t, i18n } = useTranslation();
  const scopeLabels = useTaskScopeLabels('outline');
  const { notification: ctxNotification, modal, message: ctxMessage } = App.useApp();
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  // 创建大纲抽屉默认关闭，用户点击「新建大纲」才打开
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerData, setViewerData] = useState<{
    title: string;
    outline: OutlineNode | OutlineNode[] | null;
    characters: CharacterProfile[];
  } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTaskIds, setMoveTaskIds] = useState<string[]>([]);

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
  } = useTaskV2FormConfig({
    scope: 'outline',
    enabled: isLoggedIn,
    buildDefaultsOptions: { fallbackUid: () => `outline_${Date.now()}` },
    formDrawerOpen: formOpen,
  });

  // 仅首次进入页面时展示整体 loading，后续轮询静默更新，避免列表反复“闪一下”
  const hasInitialLoadedRef = useRef(false);

  const loadOutlineTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    if (!hasInitialLoadedRef.current) {
      setLoadingTasks(true);
    }
    try {
      const [writingRes, outlineRes] = await Promise.all([
        listWritingTasks({ limit: 100, offset: 0 }),
        listOutlineTasks({ limit: 100, offset: 0 }),
      ]);
      const writingBody = writingRes.data as WritingTaskListResponse | undefined;
      const outlineBody = outlineRes.data as WritingTaskListResponse | undefined;
      const list = [...(writingBody?.data?.tasks ?? []), ...(outlineBody?.data?.tasks ?? [])];

      const outlineTasks = list
        .filter((t) => {
          const rp = t.requestParams as Record<string, unknown> | undefined;
          return rp?.taskType === 'outline';
        })
        .sort((a, b) => {
          const aTime = new Date(a.createdAt ?? 0).getTime();
          const bTime = new Date(b.createdAt ?? 0).getTime();
          return bTime - aTime;
        });
      setTasks(outlineTasks);
    } catch (e) {
      console.error('加载大纲任务失败:', e);
      setTasks([]);
    } finally {
      hasInitialLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [isLoggedIn]);

  // 大纲结构类型不做过滤，用户可选任意结构类型

  useEffect(() => {
    if (!isLoggedIn) return;
    void loadOutlineTasks();
  }, [isLoggedIn, loadOutlineTasks]);

  const { fetchTaskIntoList } = useCgiTaskListSync(isLoggedIn, setTasks, loadOutlineTasks, {
    listScope: 'outline',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      ctxNotification.warning({ message: t('auth.pleaseLogin'), placement: 'top' });
      return;
    }
    const promptVal = String(formValues.prompt ?? '').trim();
    if (!promptVal) {
      ctxNotification.warning({ message: '请输入提示词', placement: 'top' });
      return;
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = { ...formValues, outputFormat: 'json' };
      body.prompt = promptVal;
      const uidRaw = String(body.uid ?? '').trim();
      body.uid = uidRaw || `outline_${Date.now()}`;
      delete body.label;

      const result = await runTaskV2({
        scope: 'outline',
        taskKey,
        subtype,
        params: mergeTaskLabelIntoParams(body),
      });
      const bodyRes = (result.data as Record<string, unknown>) ?? {};
      if (result.error || bodyRes.error) {
        const msg = (bodyRes.error as string) || result.error || '请稍后重试';
        const isNetworkError =
          result.status === 0 ||
          /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg);
        ctxNotification.error({
          message: t('common.submitFailed'),
          description: isNetworkError
            ? `${msg}。请确认 Gateway 与 mxmcgi 已启动（如 pnpm run dev:all）。`
            : msg,
          placement: 'top',
        });
        return;
      }
      const taskId = (bodyRes.taskId as string | undefined) ?? undefined;
      if (taskId) {
        ctxNotification.success({
          message: t('common.task.created.single'),
          description: `${taskId}\n${t('common.task.created.hint')}`,
          placement: 'top',
        });
        resetFormValues();
        resetTaskLabelAfterSubmit();
        void fetchTaskIntoList(taskId);
        setFormOpen(false);
      } else {
        ctxNotification.info({
          message: '响应异常',
          description: '未获取到 taskId，请查看控制台',
          placement: 'top',
        });
      }
    } catch (err) {
      ctxNotification.error({
        message: t('common.submitFailed'),
        description: err instanceof Error ? err.message : String(err),
        placement: 'top',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, task: WritingTaskItem) => {
    e.stopPropagation();
    modal.confirm({
      title: t('common.task.deleteConfirm.title'),
      content: t('common.task.deleteConfirm.content', {
        name: getTaskTitle(task),
      }),
      onOk: async () => {
        setDeletingId(task.id);
        try {
          const res = await deleteTask(task.id);
          if (res.error) {
            ctxMessage.error(res.error);
          } else {
            loadOutlineTasks();
            setViewerVisible(false);
          }
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const openOutlineViewer = async (t: WritingTaskItem) => {
    setViewerVisible(true);
    setViewerData(null);
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await getTask(t.id);
      const body = res.data as Record<string, unknown> | undefined;
      if (res.error) {
        setViewerError(res.error || '获取任务详情失败');
        return;
      }
      const task = (body?.data ?? body) as Record<string, unknown>;
      const result = task?.result as Record<string, unknown> | undefined;
      const metadata = result?.metadata as Record<string, unknown> | undefined;
      let outline = (metadata?.outline ?? null) as OutlineNode | OutlineNode[] | null;
      const characters = (metadata?.characters as CharacterProfile[] | undefined) ?? [];

      if (!outline && typeof metadata?.text === 'string' && metadata.text.trim()) {
        const parsed = tryParseOutlineFromText(metadata.text);
        if (parsed) {
          outline = parsed;
        }
      }
      setViewerData({
        title: getTaskTitle(t),
        outline,
        characters,
      });
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
      onOpen: (task) => void openOutlineViewer(task),
    });
  };

  const getTaskTitle = (task: WritingTaskItem) => {
    const rp = task.requestParams as Record<string, unknown> | undefined;
    const params = rp?.params as Record<string, unknown> | undefined;
    const labelVal =
      (task.metadata?.label as string)?.trim() ||
      ((params?.metadata as Record<string, unknown> | undefined)?.label as string | undefined);
    const promptVal = (params?.prompt as string) || '';
    return (
      labelVal?.trim() ||
      (promptVal?.trim().length
        ? `大纲：${promptVal.slice(0, 36).replace(/\n/g, ' ').trim()}`
        : scopeLabels.defaultTitle)
    );
  };

  const outlineSelectOptions = useMemo(
    () => buildTaskSelectionSelectOptions(taskOptions, toAppLang(i18n.language)),
    [taskOptions, i18n.language]
  );

  const renderForm = () => (
    <div className={TASK_V2_DRAWER_FORM_CLASS}>
      {taskOptions.length > 0 ? (
        <Select
          value={formatTaskSelectionKey(taskKey, subtype)}
          onChange={(v) => {
            const { taskKey: k, subtype: st } = parseTaskSelectionKey(String(v));
            setTaskKey(k);
            setSubtype(st);
            clearPendingForm();
          }}
          options={outlineSelectOptions}
        />
      ) : null}

      <TaskV2TaskNameField value={taskLabel} onChange={onTaskLabelChange} />

      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
      />

      <Button
        type="primary"
        htmlType="submit"
        loading={loading}
        disabled={!formConfig?.schema}
        onClick={handleSubmit}
      >
        {loading ? t('common.refreshing') : t('common.generate')}
      </Button>
    </div>
  );

  const visibleTasks = tasks.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const title = getTaskTitle(t).toLowerCase();
    return title.includes(q) || t.id.toLowerCase().includes(q);
  });

  return (
    <section className="page-card generation-console-page outline-page">
      <GenerationTaskToolbar
        filters={
          <GenerationTaskSearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务名称或 ID…"
            aria-label="搜索大纲任务"
          />
        }
        onRefresh={() => void loadOutlineTasks()}
        refreshLoading={loadingTasks}
        primaryAction={{
          label: scopeLabels.createLabel,
          onClick: () => setFormOpen(true),
          disabled: !isLoggedIn,
        }}
      />

      <GenerationTaskListScroll
        className="outline-list-scroll"
        onRefresh={() => void loadOutlineTasks()}
        refreshing={loadingTasks}
        disabled={!isLoggedIn}
      >
        {!isLoggedIn ? (
          <p className="muted">{t('auth.pleaseLoginToViewTasks')}</p>
        ) : loadingTasks ? (
          <TaskListLoading layout="row-list" kind="outline" count={5} />
        ) : visibleTasks.length === 0 ? (
          <p className="muted">{scopeLabels.emptyHint}</p>
        ) : (
          <ul className="outline-task-list">
            {visibleTasks.map((task) => (
              <li
                key={task.id}
                className="outline-task-item outline-task-item-clickable"
                role="button"
                tabIndex={0}
                onClick={() => handleTaskClick(task)}
                onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(task)}
              >
                <div className="outline-task-main">
                  <span className="outline-task-title" title={getTaskTitle(task)}>
                    {getTaskTitle(task)}
                  </span>
                  <span className="outline-task-actions">
                    <span className={`outline-task-status outline-task-status--${task.status}`}>
                      {getTaskStatusLabel(task.status, t)}
                    </span>
                  </span>
                </div>
                <div className="outline-task-meta">
                  <code className="outline-task-id">{task.id}</code>
                  {task.progress?.progress != null && (
                    <span className="outline-task-progress">{task.progress.progress}%</span>
                  )}
                  {task.progress?.error && (
                    <span className="outline-task-error" title={task.progress.error}>
                      {task.progress.error.slice(0, 80)}
                      {task.progress.error.length > 80 ? '…' : ''}
                    </span>
                  )}
                </div>
                <TaskCardMoreMenu
                  onDelete={(e) => void handleDeleteTask(e, task)}
                  onMove={(e) => {
                    e.stopPropagation();
                    setMoveTaskIds([task.id]);
                    setMoveOpen(true);
                  }}
                  onDownload={async (e) => {
                    e.stopPropagation();
                    await downloadGenerationTask(task, 'outline');
                  }}
                  completedActionsEnabled={task.status === 'completed'}
                  disabled={deletingId === task.id}
                  deleting={deletingId === task.id}
                />
              </li>
            ))}
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
        onApproved={() => void loadOutlineTasks()}
      />

      <OutlineViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerData?.title}
        outline={viewerData?.outline ?? null}
        characters={viewerData?.characters ?? []}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title={scopeLabels.createLabel}
        placement="right"
        size={520}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnHidden
      >
        {renderForm()}
      </Drawer>

      <MoveTasksToKnowledgeFolderModal
        open={moveOpen}
        taskIds={moveTaskIds}
        onClose={() => setMoveOpen(false)}
      />
    </section>
  );
}
