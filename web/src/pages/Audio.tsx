import { useState, useEffect, useCallback, useMemo } from 'react';
import { notification, Drawer, Button, Select } from 'antd';
import {
  listCgiTasks,
  deleteTask,
  fetchMediaBlobUrl,
  runTaskV2,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AudioViewerModal } from '../components/AudioViewerModal';
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
  const textVal = (params?.text as string) || (params?.prompt as string) || '';
  return (
    labelVal ||
    (textVal?.trim().length
      ? `${textVal.slice(0, 40).replace(/\n/g, ' ').trim()}${textVal.length > 40 ? '…' : ''}`
      : '音频任务')
  );
}

export default function Audio() {
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
  } = useTaskV2FormConfig({ scope: 'audio', enabled: isLoggedIn });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const audioSelectOptions = useMemo(
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
  const [formOpen, setFormOpen] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await listCgiTasks({ type: 'audio', limit: 200, offset: 0 });
      const body = res.data as WritingTaskListResponse | undefined;
      const list = body?.data?.tasks ?? [];
      setTasks(list);
    } catch (e) {
      console.error('加载音频任务失败:', e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 8000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const filteredTasks = tasks
    .filter((t) => {
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      notification.warning({ message: '暂无可用的音频业务配置', placement: 'top' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope: 'audio',
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
    } catch (e) {
      notification.error({
        message: '提交失败',
        description: e instanceof Error ? e.message : String(e),
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
    setViewerUrls([]);
    setViewerError(null);
    setViewerLoading(true);
    try {
      // 与图片一致：已完成的音频统一走带鉴权的媒体接口取 blob URL
      // getTask 返回的 mediaUrls/storageUrls 可能是内网/受保护地址，<audio> 无法携带鉴权而导致播放失败
      if (t.status === 'completed') {
        const blobUrl = await fetchMediaBlobUrl(t.id, 'audio');
        setViewerUrls([blobUrl]);
      } else {
        setViewerUrls([]);
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  const renderForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Select
          style={{ minWidth: 260 }}
          placeholder="选择业务（taskKey / subtype）"
          value={taskOptions.length > 0 ? selectedValue : undefined}
          options={audioSelectOptions}
          onChange={(v) => {
            const p = parseTaskSelectionKey(String(v));
            setTaskKey(p.taskKey);
            setSubtype(p.subtype);
            clearPendingForm();
          }}
        />
        <Button type="primary" loading={submitting} disabled={!formConfig?.schema} onClick={() => void handleSubmit()}>
          生成
        </Button>
      </div>
      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
      />
    </div>
  );

  return (
    <section className="page-card audio-page">
      <div className="audio-header">
        <div className="audio-header-main">
          <div className="audio-filters">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="audio-filter-select"
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
        <div className="audio-header-actions">
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
            新建音频任务
          </button>
        </div>
      </div>

      <div className="audio-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看任务列表。</p>
        ) : loadingTasks ? (
          <p className="muted">加载中...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="muted">暂无音频任务，点击右上角「新建音频任务」开始。</p>
        ) : (
          <ul className="audio-task-list">
            {filteredTasks.map((t) => (
              <li
                key={t.id}
                className="audio-task-item audio-task-item-clickable"
                role="button"
                tabIndex={0}
                onClick={() => handleTaskClick(t)}
                onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(t)}
              >
                <div className="audio-task-main">
                  <span className="audio-task-title" title={getTaskTitle(t)}>
                    {getTaskTitle(t)}
                  </span>
                  <span className="audio-task-actions">
                    <span className={`audio-task-status audio-task-status--${t.status}`}>
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
                <div className="audio-task-meta">
                  <code className="audio-task-id">{t.id}</code>
                  {t.progress?.progress != null && (
                    <span className="audio-task-progress">{t.progress.progress}%</span>
                  )}
                  {t.progress?.error && (
                    <span className="audio-task-error" title={t.progress.error}>
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

      <AudioViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '音频结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title="新建音频任务"
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
