import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Drawer, Select, notification } from 'antd';
import {
  listWritingTasks,
  deleteTask,
  getMediaWriting,
  runTaskV2,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { WritingViewerModal } from '../components/WritingViewerModal';
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

// 写作类型选项（排除 outlines，与 mobile 对齐）
const WRITING_TYPE_OPTIONS = [
  { value: 'articles', label: '文章' },
  { value: 'lyrics', label: '歌词' },
  { value: 'voice-scripts', label: '口播稿' },
  { value: 'storyboard-scripts', label: '分镜脚本' },
];

// 细分类型选项
const OUTLINE_TYPE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  articles: [
    { value: 'tech-article', label: '科技文章' },
    { value: 'story-novel', label: '故事小说' },
    { value: 'academic-paper', label: '学术论文' },
  ],
  'voice-scripts': [
    { value: 'sales-voice', label: '带货口播' },
    { value: 'emotional-story-voice', label: '情感故事口播' },
    { value: 'knowledge-sharing-voice', label: '知识分享口播' },
  ],
  'storyboard-scripts': [
    { value: 'short-video-storyboard', label: '短视频分镜' },
    { value: 'movie-storyboard', label: '电影分镜' },
    { value: 'animation-storyboard', label: '动画分镜' },
    { value: 'music-video-storyboard', label: '音乐视频分镜' },
    { value: 'commercial-storyboard', label: '广告分镜' },
    { value: 'documentary-storyboard', label: '纪录片分镜' },
    { value: 'motion-graphics-storyboard', label: '概念动效分镜' },
    { value: 'educational-storyboard', label: '教育片分镜' },
    { value: 'game-cg-storyboard', label: '游戏CG分镜' },
  ],
};

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function extractWritingType(t: WritingTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  return (
    (t.metadata?.writing_type as string) ??
    (params?.writing_type as string) ??
    (params?.params as Record<string, unknown> | undefined)?.writing_type as string ??
    ''
  );
}

function extractOutlineType(t: WritingTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  return (
    (params?.outline_type as string) ??
    (params?.params as Record<string, unknown> | undefined)?.outline_type as string ??
    ''
  );
}

function getTaskTitle(t: WritingTaskItem): string {
  const labelVal =
    (t.metadata?.label as string)?.trim() ||
    (t.metadata?.writing_type_label as string)?.trim();
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string) || '';
  return (
    labelVal ||
    (promptVal?.trim().length
      ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
      : '写作任务')
  );
}

function getSubtypeLabel(writingType: string, outlineType: string): string {
  const opts = OUTLINE_TYPE_OPTIONS[writingType];
  if (!opts || !outlineType) return '';
  const found = opts.find((o) => o.value === outlineType);
  return found?.label ?? outlineType;
}

export default function Writing() {
  const { isLoggedIn } = useAuth();
  const [allTasks, setAllTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [filterWritingType, setFilterWritingType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

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
  } = useTaskV2FormConfig({ scope: 'writing', enabled: isLoggedIn });

  const selectedValue = useMemo(() => formatTaskSelectionKey(taskKey, subtype), [taskKey, subtype]);
  const writingSelectOptions = useMemo(
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

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerContent, setViewerContent] = useState<string>('');
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
      const res = await listWritingTasks({ limit: 200, offset: 0 });
      const body = res.data as WritingTaskListResponse | undefined;
      const list = body?.data?.tasks ?? [];
      setAllTasks(list);
    } catch (e) {
      console.error('加载写作任务失败:', e);
      setAllTasks([]);
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

  const filteredTasks = allTasks
    .filter((t) => {
      if (filterWritingType && extractWritingType(t) !== filterWritingType) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
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
        options={writingSelectOptions}
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

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!taskOptions.length) {
      notification.warning({ message: '暂无可用的写作业务配置', placement: 'top' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await runTaskV2({
        scope: 'writing',
        taskKey,
        subtype,
        params: formValues,
      });
      const taskId = pickTaskIdFromRunTaskV2Response(res.data);
      notification.success({
        message: '任务已创建',
        description: taskId ? `${taskId}\n可在下方任务列表中查看进度。` : '可在下方任务列表中查看进度。',
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
    setViewerContent('');
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await getMediaWriting(t.id);
      const data = res.data;
      if (res.error) {
        setViewerError(res.error || '获取内容失败');
        return;
      }
      if (typeof data === 'string') {
        setViewerContent(data);
      } else if (data && typeof data === 'object' && 'data' in data) {
        const inner = (data as { data?: unknown }).data;
        setViewerContent(
          typeof inner === 'string' ? inner : JSON.stringify(inner ?? data, null, 2)
        );
      } else {
        setViewerContent(JSON.stringify(data ?? {}, null, 2));
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  return (
    <section className="page-card writing-page">
      <div className="writing-header">
        <div className="writing-header-main">
          <div className="writing-filters">
            <select
              value={filterWritingType}
              onChange={(e) => setFilterWritingType(e.target.value)}
              className="writing-filter-select"
            >
              <option value="">全部类型</option>
              {WRITING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="writing-filter-select"
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
        <div className="writing-header-actions">
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
            新建写作任务
          </button>
        </div>
      </div>

      <div className="writing-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看任务列表。</p>
        ) : loadingTasks ? (
          <p className="muted">加载中...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="muted">暂无写作任务，点击右上角「新建写作任务」开始。</p>
        ) : (
          <ul className="writing-task-list">
            {filteredTasks.map((t) => {
              const wt = extractWritingType(t);
              const ot = extractOutlineType(t);
              const subtypeLabel = getSubtypeLabel(wt, ot);
              return (
                <li
                  key={t.id}
                  className="writing-task-item writing-task-item-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTaskClick(t)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(t)}
                >
                  <div className="writing-task-main">
                    <span className="writing-task-title" title={getTaskTitle(t)}>
                      {getTaskTitle(t)}
                    </span>
                    <span className="writing-task-actions">
                      <span className={`writing-task-status writing-task-status--${t.status}`}>
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
                  <div className="writing-task-meta">
                    {subtypeLabel && (
                      <span className="writing-task-subtype">{subtypeLabel}</span>
                    )}
                    <code className="writing-task-id">{t.id}</code>
                    {t.progress?.progress != null && (
                      <span className="writing-task-progress">{t.progress.progress}%</span>
                    )}
                    {t.progress?.error && (
                      <span className="writing-task-error" title={t.progress.error}>
                        {t.progress.error.slice(0, 60)}
                        {t.progress.error.length > 60 ? '…' : ''}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <WritingViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '写作内容'}
        content={viewerContent}
        task={viewerTask}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title="新建写作任务"
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
