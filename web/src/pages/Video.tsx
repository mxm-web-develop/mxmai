import { useState, useEffect, useCallback } from 'react';
import { notification } from 'antd';
import {
  createVideo,
  listCgiTasks,
  getTask,
  deleteTask,
  fetchMediaBlobUrl,
  getVideoFormOptions,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { VideoViewerModal } from '../components/VideoViewerModal';
import { TwoPaneLayout } from '../components/TwoPaneLayout';

const VIDEO_MODEL_OPTIONS = [
  { value: 'sora-2', label: 'sora-2（4/8/12 秒）' },
  { value: 'sora-2-pro', label: 'sora-2-pro（4/8/12 秒）' },
  { value: 'sora-2-deer', label: 'sora-2-deer（10/15 秒）' },
  { value: 'sora-2-deer-pro', label: 'sora-2-deer-pro（10/15/25 秒）' },
];

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

const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: '横屏（16:9）' },
  { value: 'portrait', label: '竖屏（9:16）' },
];

const DEFAULT_CHUNKS_JSON = `[
  {
    "index": 1,
    "chunk_seconds": 10,
    "prompt": "清晨山谷，薄雾缭绕。喵小游背着小包沿山路缓行，远处溪水与鸟鸣。",
    "video_description": "清晨山谷，薄雾缭绕。喵小游背着小包沿山路缓行。",
    "characters_in_shot": ["喵小游"],
    "reference_image_url": ""
  }
]`;

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

  const [scriptType, setScriptType] = useState('short-video-storyboard');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [chunksJson, setChunksJson] = useState(DEFAULT_CHUNKS_JSON);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [secondsOptions, setSecondsOptions] = useState<number[]>([]);
  const [videoModel, setVideoModel] = useState<string>('sora-2');

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerVideoUrl, setViewerVideoUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await listCgiTasks({ type: 'video', limit: 200, offset: 0 });
      const body = res.data as WritingTaskListResponse | undefined;
      const list = body?.data?.tasks ?? [];
      setTasks(list);
    } catch (e) {
      console.error('加载视频任务失败:', e);
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

  useEffect(() => {
    const isDeer = videoModel === 'sora-2-deer' || videoModel === 'sora-2-deer-pro' || videoModel === 'sora-2-all';
    const mode = isDeer ? 'sora-2-deer' : 'sora-2';
    getVideoFormOptions({ lang: 'zh', mode }).then((res) => {
      const raw = res.data as { data?: { seconds?: Array<{ value?: string | number }> } } | undefined;
      const opts = raw?.data?.seconds ?? raw?.seconds ?? [];
      const numbers = opts
        .map((o) => parseInt(String(o?.value ?? ''), 10))
        .filter((n) => Number.isFinite(n));
      if (numbers.length > 0) setSecondsOptions(numbers);
    }).catch(() => {});
  }, [videoModel]);

  const filteredTasks = tasks
    .filter((t) => !filterStatus || t.status === filterStatus)
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }

    let chunks: unknown[];
    try {
      const parsed = JSON.parse(chunksJson.trim());
      chunks = Array.isArray(parsed) ? parsed : parsed?.chunks;
      if (!Array.isArray(chunks) || chunks.length === 0) {
        notification.warning({ message: '请至少添加一个分镜段（chunks 数组）', placement: 'top' });
        return;
      }
    } catch {
      notification.warning({ message: 'chunks 不是合法 JSON 或格式错误', placement: 'top' });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        chunks,
        scriptType,
        orientation,
        storeToMinio: true,
      };
      if (label.trim()) body.label = label.trim();

      const result = await createVideo(body);
      const bodyRes = (result.data as Record<string, unknown>) ?? {};
      if (result.error || bodyRes.error) {
        notification.error({
          message: '提交失败',
          description: (bodyRes.error as string) || result.error || '请稍后重试',
          placement: 'top',
        });
        return;
      }

      const innerData = bodyRes.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? bodyRes.taskId) as string | undefined;
      const tasksList = (innerData?.tasks ?? bodyRes.tasks) as Array<{ taskId?: string }> | undefined;
      const count = tasksList?.length ?? (taskId ? 1 : 0);

      if (taskId || (tasksList && tasksList.length > 0)) {
        notification.success({
          message: '任务已创建',
          description: count > 1 ? `已创建 ${count} 个视频任务` : `${taskId}\n可在左侧任务列表中查看进度。`,
          placement: 'top',
        });
        setLabel('');
        loadTasks();
      } else {
        notification.info({
          message: '响应异常',
          description: '未获取到 taskId，请查看控制台',
          placement: 'top',
        });
      }
    } catch (err) {
      notification.error({
        message: '提交失败',
        description: err instanceof Error ? err.message : String(err),
        placement: 'top',
      });
    } finally {
      setLoading(false);
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
      const res = await getTask(t.id);
      const body = res.data as Record<string, unknown> | undefined;
      const taskData = (body?.data ?? body) as Record<string, unknown>;
      if (res.error) {
        setViewerError(res.error || '获取任务失败');
        return;
      }
      const result = taskData?.result as Record<string, unknown> | undefined;
      const mediaUrls = (result?.mediaUrls as string[] | undefined) ?? [];
      const storageUrls = (result?.storageInfo as Record<string, unknown> | undefined)?.urls as string[] | undefined;
      let url = mediaUrls[0] ?? storageUrls?.[0];

      if (!url && t.status === 'completed') {
        try {
          url = await fetchMediaBlobUrl(t.id, 'video');
        } catch (e) {
          setViewerError(e instanceof Error ? e.message : String(e));
          return;
        }
      }
      setViewerVideoUrl(url || null);
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  return (
    <div className="video-page">
      <TwoPaneLayout
        leftClassName="video-list-pane"
        rightClassName="video-form-pane"
        left={
          <section className="video-list-pane">
        <h3 className="video-list-title">我的视频任务</h3>
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
        <div className="video-list-scroll">
          {!isLoggedIn ? (
            <p className="muted">请先登录以查看任务列表。</p>
          ) : loadingTasks ? (
            <p className="muted">加载中...</p>
          ) : filteredTasks.length === 0 ? (
            <p className="muted">暂无视频任务，提交右侧表单创建新任务。</p>
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
                        className="video-task-delete"
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
          </section>
        }
        right={
          <section className="video-form-pane">
        <h3 className="video-form-title">新建视频任务</h3>
        <p className="video-form-hint">
          chunks 可从写作任务 result.metadata 取得，按 characters 填 reference_image_url。可选时长：{secondsOptions.length ? secondsOptions.join(' / ') : '10'} 秒。
        </p>
        <form onSubmit={handleSubmit} className="form-group video-form">
          <div className="form-row-group">
            <div className="form-row">
              <label>脚本类型</label>
              <select value={scriptType} onChange={(e) => setScriptType(e.target.value)}>
                {SCRIPT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>画幅</label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
              >
                {ORIENTATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>视频模型</label>
              <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)}>
                {VIDEO_MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <label>任务名称</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="可选，用于列表展示"
            />
          </div>

          <div className="form-row">
            <label>分镜 chunks（JSON 数组）*</label>
            <textarea
              value={chunksJson}
              onChange={(e) => setChunksJson(e.target.value)}
              placeholder='[{"index":1,"chunk_seconds":10,"prompt":"...","video_description":"...","characters_in_shot":[],"reference_image_url":""}]'
              rows={14}
              spellCheck={false}
              required
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? '提交中...' : '生成视频'}
          </button>
        </form>
          </section>
        }
      />

      <VideoViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '视频结果'}
        task={viewerTask}
        videoUrl={viewerVideoUrl}
        loading={viewerLoading}
        error={viewerError}
      />

      <style>{`
        .video-page {
          flex: 1;
          min-height: 0;
        }
        .video-list-pane {
          display: flex;
          flex-direction: column;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
        }
        .video-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: #e0e0e0;
          border-bottom: 1px solid #333;
        }
        .video-filters {
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #333;
        }
        .video-filter-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
        }
        .video-list-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1rem;
        }
        .video-form-pane {
          flex: 5;
          min-width: 0;
          min-height: 0;
          overflow-y: auto;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1.5rem;
        }
        .video-form-title {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
          color: #e0e0e0;
        }
        .video-form-hint {
          font-size: 0.8rem;
          color: #888;
          margin: 0 0 1rem 0;
        }
        .video-list-scroll .muted { font-size: 0.875rem; color: #888; margin: 0; }
        .video-task-list { list-style: none; margin: 0; padding: 0; }
        .video-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: #252525;
          border: 1px solid #333;
          border-radius: 6px;
        }
        .video-task-item-clickable { cursor: pointer; transition: background 0.15s, border-color 0.15s; }
        .video-task-item-clickable:hover { background: #2d2d2d; border-color: #444; }
        .video-task-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .video-task-title {
          flex: 1;
          font-size: 0.9rem;
          color: #e0e0e0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .video-task-actions { flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; }
        .video-task-status { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
        .video-task-delete {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid #7f1d1d;
          background: transparent;
          color: #fca5a5;
          cursor: pointer;
        }
        .video-task-delete:hover:not(:disabled) { background: #7f1d1d; }
        .video-task-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .video-task-status--completed { background: #166534; color: #86efac; }
        .video-task-status--failed,
        .video-task-status--cancelled { background: #7f1d1d; color: #fca5a5; }
        .video-task-status--processing,
        .video-task-status--pending,
        .video-task-status--queued { background: #1e3a5f; color: #93c5fd; }
        .video-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #888;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .video-task-id { font-family: ui-monospace, monospace; background: #1a1a1a; padding: 0.15rem 0.4rem; border-radius: 4px; }
        .video-task-progress { color: #93c5fd; }
        .video-task-error { color: #fca5a5; max-width: 100%; }
        .video-form .form-row { margin-bottom: 1rem; }
        .video-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: #aaa; }
        .video-form .form-row input,
        .video-form .form-row select,
        .video-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
          box-sizing: border-box;
        }
        .video-form .form-row textarea { min-height: 80px; resize: vertical; font-family: ui-monospace, monospace; }
        .form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        .form-row-group .form-row { margin-bottom: 0; }
      `}</style>
    </div>
  );
}
