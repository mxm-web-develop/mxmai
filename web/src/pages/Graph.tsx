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
import { GraphViewerModal } from '../components/GraphViewerModal';
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

// 业务类型与子类型（与 mobile 对齐）
const GRAPH_TYPE_OPTIONS = [
  { value: 'photograph', label: '摄影' },
  { value: 'design', label: '设计' },
  { value: 'painting', label: '绘画' },
];

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function getGraphType(t: WritingTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  return (rp?.graphType as string) ?? '';
}

function getTaskTitle(t: WritingTaskItem): string {
  const labelVal = (t.metadata?.label as string)?.trim();
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string) || '';
  return (
    labelVal ||
    (promptVal?.trim().length
      ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
      : '图片任务')
  );
}

export default function Graph() {
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
  } = useTaskV2FormConfig({ scope: 'graph', enabled: isLoggedIn });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const graphSelectOptions = useMemo(
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

  // v2 表单已完全 schema 驱动：旧的 graphType/type/advanced/reference 等硬编码状态不再保留
  const [filterGraphType, setFilterGraphType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const thumbnailFetchingRef = useRef<Set<string>>(new Set());
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
  }, [isLoggedIn]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 8000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const filteredTasks = tasks
    .filter((t) => {
      if (filterGraphType && getGraphType(t) !== filterGraphType) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  // 已完成任务的缩略图：按需拉取并缓存 blob URL
  useEffect(() => {
    filteredTasks.forEach((t) => {
      if (t.status !== 'completed' || thumbnailCache[t.id] || thumbnailFetchingRef.current.has(t.id)) return;
      thumbnailFetchingRef.current.add(t.id);
      fetchMediaBlobUrl(t.id, 'graph')
        .then((url) => setThumbnailCache((prev) => ({ ...prev, [t.id]: url })))
        .finally(() => thumbnailFetchingRef.current.delete(t.id));
    });
  }, [filteredTasks, thumbnailCache]);

  // 任务从列表移除时释放对应 blob，避免内存泄漏
  useEffect(() => {
    const ids = new Set(filteredTasks.map((t) => t.id));
    setThumbnailCache((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (!ids.has(id)) {
          try {
            URL.revokeObjectURL(prev[id]);
          } catch {
            // ignore
          }
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filteredTasks]);

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      notification.warning({ message: '暂无可用的图片业务配置', placement: 'top' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope: 'graph',
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
    setViewerUrls([]);
    setViewerError(null);
    setViewerLoading(true);
    try {
      // 已完成任务统一通过带认证的媒体接口取 blob，保证弹窗内图片能正常显示（getTask 的 mediaUrls 可能是内网 MinIO 地址）
      if (t.status === 'completed') {
        const blobUrl = await fetchMediaBlobUrl(t.id, 'graph');
        setViewerUrls([blobUrl]);
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  const renderForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Select
        style={{ width: '100%' }}
        placeholder="选择业务（taskKey / subtype）"
        value={taskOptions.length > 0 ? selectedValue : undefined}
        options={graphSelectOptions}
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
      <Button
        type="primary"
        loading={submitting}
        disabled={!formConfig?.schema}
        onClick={() => void handleSubmit()}
      >
        生成
      </Button>
    </div>
  );

  return (
    <section className="page-card graph-page">
      <div className="graph-header">
        <div className="graph-header-main">
          <div className="graph-filters">
            <select
              value={filterGraphType}
              onChange={(e) => setFilterGraphType(e.target.value)}
              className="graph-filter-select"
            >
              <option value="">全部类型</option>
              {GRAPH_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="graph-filter-select"
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
        <div className="graph-header-actions">
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
            新建图片任务
          </button>
        </div>
      </div>

      <div className="graph-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看任务列表。</p>
        ) : loadingTasks ? (
          <p className="muted">加载中...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="muted">暂无图片任务，点击右上角「新建图片任务」开始。</p>
        ) : (
          <ul className="graph-task-list">
            {filteredTasks.map((t) => (
              <li
                key={t.id}
                className="graph-task-item graph-task-item-clickable"
                role="button"
                tabIndex={0}
                onClick={() => handleTaskClick(t)}
                onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(t)}
              >
                <div className="graph-task-thumb">
                  {t.status === 'completed' ? (
                    thumbnailCache[t.id] ? (
                      <img src={thumbnailCache[t.id]} alt="" className="graph-task-thumb-img" />
                    ) : (
                      <span className="graph-task-thumb-placeholder">加载中</span>
                    )
                  ) : (
                    <span className="graph-task-thumb-placeholder">—</span>
                  )}
                </div>
                <div className="graph-task-content">
                  <span className="graph-task-title" title={getTaskTitle(t)}>
                    {getTaskTitle(t)}
                  </span>
                  <div className="graph-task-meta">
                    {getGraphType(t) && (
                      <span className="graph-task-subtype">
                        {GRAPH_TYPE_OPTIONS.find((o) => o.value === getGraphType(t))?.label ??
                          getGraphType(t)}
                      </span>
                    )}
                    <code className="graph-task-id" title={t.id}>
                      {t.id.length > 12 ? `${t.id.slice(0, 12)}…` : t.id}
                    </code>
                    {t.progress?.progress != null && (
                      <span className="graph-task-progress">{t.progress.progress}%</span>
                    )}
                    {t.progress?.error && (
                      <span className="graph-task-error" title={t.progress.error}>
                        {t.progress.error.slice(0, 40)}…
                      </span>
                    )}
                  </div>
                </div>
                <div className="graph-task-actions">
                  <span className={`graph-task-status graph-task-status--${t.status}`}>
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <GraphViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '图片结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title="新建图片任务"
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
