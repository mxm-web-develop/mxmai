import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Drawer, Select, notification } from 'antd';
import {
  listCgiTasks,
  deleteTask,
  fetchMediaBlobUrl,
  runTaskV2,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { VideoViewerModal } from '../components/VideoViewerModal';
import { useTaskV2FormConfig, formatTaskSelectionKey, parseTaskSelectionKey, TaskV2SchemaForm } from '../task-v2';

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function pickTaskIdFromRunTaskV2Response(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const inner = isRecord(raw.data) ? raw.data : raw;
  const tid = inner.taskId;
  return typeof tid === 'string' && tid.trim() ? tid : null;
}

const SCRIPT_TYPE_OPTIONS = [
  { value: 'short-video-storyboard', label: '短视频分镜' },
  { value: 'movie-storyboard', label: '电影分镜' },
  { value: 'animation-storyboard', label: '动画分镜' },
  { value: 'music-video-storyboard', label: '音乐视频分镜' },
  { value: 'commercial-storyboard', label: '广告分镜' },
  { value: 'documentary-storyboard', label: '纪录片分镜' },
  { value: 'motion-graphics-storyboard', label: '概念动效分镜' },
  { value: 'educational-storyboard', label: '教育片分镜' },
  { value: 'game-cg-storyboard', label: '游戏CG分镜' },
];

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function getTaskTitle(t: WritingTaskItem): string {
  const labelVal = (t.metadata?.label as string)?.trim();
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const scriptType = (params?.scriptType as string) || '';
  return (
    labelVal ||
    (scriptType
      ? `${SCRIPT_TYPE_OPTIONS.find((o) => o.value === scriptType)?.label ?? scriptType}`
      : '视频任务')
  );
}

export default function Video() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [submitting, setSubmitting] = useState(false);

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
  } = useTaskV2FormConfig({ scope: 'video', enabled: isLoggedIn });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const videoSelectOptions = useMemo(
    () =>
      taskOptions.map((it) => ({
        label: (() => {
          const tk = (it.taskLabel ?? '').trim() || it.taskKey;
          if (!it.subtype) return tk;
          const st = (it.subtypeLabel ?? '').trim() || it.subtype;
          return `${tk} / ${st}`;
        })(),
        value: formatTaskSelectionKey(it.taskKey, it.subtype),
      })),
    [taskOptions]
  );

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerVideoUrl, setViewerVideoUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // 仅首次进入页面时展示整体 loading，后续轮询静默更新，避免列表反复“闪一下”
  const hasInitialLoadedRef = useRef(false);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    if (!hasInitialLoadedRef.current) {
      setLoadingTasks(true);
    }
    try {
      const res = await listCgiTasks({ type: 'video', limit: 200, offset: 0 });
      const body = res.data as WritingTaskListResponse | undefined;
      const list = body?.data?.tasks ?? [];
      setTasks(list);
    } catch (e) {
      console.error('加载视频任务失败:', e);
      setTasks([]);
    } finally {
      hasInitialLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 8000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const filteredTasks = tasks
    .filter((t) => !filterStatus || t.status === filterStatus)
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  const renderForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Select
        style={{ width: '100%' }}
        placeholder="选择业务（taskKey / subtype）"
        value={taskOptions.length > 0 ? selectedValue : undefined}
        options={videoSelectOptions}
        onChange={(v) => {
          const p = parseTaskSelectionKey(String(v));
          setTaskKey(p.taskKey);
          setSubtype(p.subtype);
          clearPendingForm();
        }}
      />
      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
      />
      <Button type="primary" loading={submitting} disabled={!formConfig?.schema} onClick={() => void handleSubmit()}>
        生成
      </Button>
    </div>
  );

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      notification.warning({ message: '暂无可用的视频业务配置', placement: 'top' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope: 'video',
        taskKey,
        subtype,
        params: formValues,
      });
      const taskId = pickTaskIdFromRunTaskV2Response(res.data);
      notification.success({
        message: '任务已创建',
        description: taskId ? `${taskId}\n可在左侧任务列表中查看进度。` : '可在左侧任务列表中查看进度。',
        placement: 'top',
      });
      setFormOpen(false);
      resetFormValues();
      loadTasks();
    } catch (err) {
      notification.error({
        message: '提交失败',
        description: err instanceof Error ? err.message : String(err),
        placement: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, t: WritingTaskItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除任务「${getTaskTitle(t)}」吗？此操作不可恢复。`)) return;
    setDeletingId(t.id);
    try {
      const res = await deleteTask(t.id);
      if (res.error) {
        alert(res.error);
      } else {
        loadTasks();
        if (viewerTask?.id === t.id) setViewerVisible(false);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleTaskClick = async (t: WritingTaskItem) => {
    setViewerVisible(true);
    setViewerTask(t);
    setViewerVideoUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    try {
      if (t.status === 'completed') {
        const blobUrl = await fetchMediaBlobUrl(t.id, 'video');
        setViewerVideoUrl(blobUrl);
      } else {
        setViewerVideoUrl(null);
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  return (
    <section className="page-card video-page">
      <div className="video-header">
        <div className="video-header-main">
          <div className="video-filters">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="video-filter-select"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="video-header-actions">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => loadTasks()}
            disabled={loadingTasks}
          >
            {loadingTasks ? '刷新中…' : '刷新列表'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen(true)}
            disabled={!isLoggedIn}
          >
            新建视频任务
          </button>
        </div>
      </div>

      <div className="video-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看任务列表。</p>
        ) : loadingTasks ? (
          <p className="muted">加载中...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="muted">暂无视频任务，点击右上角「新建视频任务」开始。</p>
        ) : (
          <ul className="video-task-list">
            {filteredTasks.map((t) => (
              <li
                key={t.id}
                className="video-task-item video-task-item-clickable"
                role="button"
                tabIndex={0}
                onClick={() => handleTaskClick(t)}
                onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(t)}
              >
                <div className="video-thumb">
                  <div className="video-thumb-play" />
                  <span className="video-thumb-orientation">—</span>
                </div>
                <div className="video-task-main">
                  <span className="video-task-title" title={getTaskTitle(t)}>
                    {getTaskTitle(t)}
                  </span>
                  <span className="video-task-actions">
                    <span className={`video-task-status video-task-status--${t.status}`}>
                      {STATUS_MAP[t.status] ?? t.status}
                    </span>
                    <button
                      type="button"
                      className="btn-danger btn-small"
                      title="删除"
                      onClick={(e) => handleDeleteTask(e, t)}
                      disabled={deletingId === t.id}
                    >
                      {deletingId === t.id ? '…' : '删除'}
                    </button>
                  </span>
                </div>
                <div className="video-task-meta">
                  <code className="video-task-id">{t.id}</code>
                  {t.progress?.progress != null && (
                    <span className="video-task-progress">{t.progress.progress}%</span>
                  )}
                  {t.progress?.error && (
                    <span className="video-task-error" title={t.progress.error}>
                      {t.progress.error.slice(0, 60)}
                      {t.progress.error.length > 60 ? '…' : ''}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <VideoViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '视频结果'}
        task={viewerTask}
        videoUrl={viewerVideoUrl}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title="新建视频任务"
        placement="right"
        size={520}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnHidden
      >
        {renderForm()}
      </Drawer>
    </section>
  );
}
