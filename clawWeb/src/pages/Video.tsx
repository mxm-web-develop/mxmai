import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { TwoPaneLayout } from '../components/TwoPaneLayout';
import * as VideoAPI from '../api/video-web';
import type { VideoTaskItem } from '../api/video-web';

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

function getTaskTitle(t: VideoTaskItem): string {
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

export function VideoPage() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<VideoTaskItem[]>([]);
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
  const [viewerTask, setViewerTask] = useState<VideoTaskItem | null>(null);
  const [viewerVideoUrl, setViewerVideoUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await VideoAPI.listVideoTasks({ limit: 200, offset: 0 });
      const body = res.data;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      alert('请先登录');
      return;
    }

    // 验证JSON格式
    let chunksData;
    try {
      chunksData = JSON.parse(chunksJson);
      if (!Array.isArray(chunksData) || chunksData.length === 0) {
        throw new Error('chunks必须是非空数组');
      }
    } catch (err) {
      alert(`JSON格式错误: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    setLoading(true);

    try {
      const params: Record<string, any> = {
        scriptType,
        orientation,
        chunks: chunksData,
        storeToMinio: true,
      };
      if (label.trim()) {
        params.metadata = { label: label.trim() };
      }

      const result = await VideoAPI.createVideoTask(videoModel, params);
      const bodyRes = result.data ?? {};
      if (result.error || (bodyRes as any).error) {
        alert(`提交失败: ${(bodyRes as any).error || result.error || '请稍后重试'}`);
        return;
      }
      const innerData = (bodyRes as any)?.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? (bodyRes as any).taskId) as string | undefined;
      if (taskId) {
        alert(`视频任务已创建: ${taskId}\n可在下方任务列表中查看进度。`);
        setLabel('');
        loadTasks();
      } else {
        alert('响应异常: 未获取到 taskId，请查看控制台');
      }
    } catch (err) {
      alert(`提交失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, t: VideoTaskItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除任务「${getTaskTitle(t)}」吗？此操作不可恢复。`)) return;
    setDeletingId(t.id);
    try {
      // 这里需要调用删除API，但VideoAPI中没有deleteTask，需要添加
      // 暂时先重新加载列表
      loadTasks();
      if (viewerTask?.id === t.id) setViewerVisible(false);
    } finally {
      setDeletingId(null);
    }
  };

  const handleTaskClick = async (t: VideoTaskItem) => {
    setViewerVisible(true);
    setViewerTask(t);
    setViewerVideoUrl(null);
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await VideoAPI.getMediaVideo(t.id);
      const data = res.data;
      if (res.error) {
        setViewerError(res.error || '获取内容失败');
        return;
      }

      // 处理视频URL
      if (t.result?.mediaUrls && t.result.mediaUrls.length > 0) {
        setViewerVideoUrl(t.result.mediaUrls[0]);
      } else if (t.result?.storageInfo?.urls && t.result.storageInfo.urls.length > 0) {
        setViewerVideoUrl(t.result.storageInfo.urls[0]);
      } else if (data && typeof data === 'object') {
        // 尝试从响应数据中提取URL
        const urls: string[] = [];
        if ((data as any).urls && Array.isArray((data as any).urls)) {
          urls.push(...(data as any).urls);
        }
        if ((data as any).mediaUrls && Array.isArray((data as any).mediaUrls)) {
          urls.push(...(data as any).mediaUrls);
        }
        if (urls.length > 0) {
          setViewerVideoUrl(urls[0]);
        } else {
          setViewerError('未找到视频文件');
        }
      } else {
        setViewerError('未找到视频文件');
      }
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
          // 左侧：任务列表
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
                  {filteredTasks.map((t) => {
                    const rp = t.requestParams as Record<string, unknown> | undefined;
                    const params = rp?.params as Record<string, unknown> | undefined;
                    const scriptTypeVal = (params?.scriptType as string) || '';
                    const scriptTypeLabel = SCRIPT_TYPE_OPTIONS.find(o => o.value === scriptTypeVal)?.label || scriptTypeVal;
                    return (
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
                          {scriptTypeLabel && (
                            <span className="video-task-scripttype">{scriptTypeLabel}</span>
                          )}
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
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        }
        right={
          // 右侧：新建表单
          <section className="video-form-pane">
            <h3 className="video-form-title">新建视频任务</h3>
            <form onSubmit={handleSubmit} className="form-group video-form">
              <div className="form-row">
                <label>视频模型</label>
                <select
                  value={videoModel}
                  onChange={(e) => setVideoModel(e.target.value)}
                >
                  {VIDEO_MODEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label>脚本类型</label>
                  <select
                    value={scriptType}
                    onChange={(e) => setScriptType(e.target.value)}
                  >
                    {SCRIPT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>视频方向</label>
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
              </div>

              <div className="form-row">
                <label>分镜JSON *</label>
                <textarea
                  value={chunksJson}
                  onChange={(e) => setChunksJson(e.target.value)}
                  placeholder="请输入分镜JSON数组..."
                  rows={8}
                  required
                />
                <small className="form-help">
                  格式: [{"{"}"index": 1, "chunk_seconds": 10, "prompt": "...", "video_description": "...", "characters_in_shot": ["..."], "reference_image_url": ""{"}"}]
                </small>
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

              <button type="submit" disabled={loading}>
                {loading ? '提交中...' : '生成视频'}
              </button>
            </form>
          </section>
        }
      />

      {/* 视频查看模态框 */}
      {viewerVisible && (
        <div className="modal-overlay" onClick={() => setViewerVisible(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewerTask ? getTaskTitle(viewerTask) : '视频内容'}</h3>
              <button className="modal-close" onClick={() => setViewerVisible(false)}>
                ×
              </button>
            </div>
            <div className="modal-content">
              {viewerLoading ? (
                <div className="loading-indicator">加载中...</div>
              ) : viewerError ? (
                <div className="error-message">{viewerError}</div>
              ) : viewerVideoUrl ? (
                <div className="video-player-container">
                  <video controls src={viewerVideoUrl} className="video-player">
                    您的浏览器不支持视频播放
                  </video>
                  <a href={viewerVideoUrl} target="_blank" rel="noopener noreferrer" className="video-download">
                    下载视频
                  </a>
                </div>
              ) : (
                <div className="empty-video">暂无视频文件</div>
              )}
              {viewerTask && (
                <div className="task-metadata">
                  <div className="metadata-row">
                    <span className="metadata-label">任务ID:</span>
                    <code className="metadata-value">{viewerTask.id}</code>
                  </div>
                  <div className="metadata-row">
                    <span className="metadata-label">状态:</span>
                    <span className={`metadata-value status-${viewerTask.status}`}>
                      {STATUS_MAP[viewerTask.status] ?? viewerTask.status}
                    </span>
                  </div>
                  {viewerTask.createdAt && (
                    <div className="metadata-row">
                      <span className="metadata-label">创建时间:</span>
                      <span className="metadata-value">
                        {new Date(viewerTask.createdAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewerVisible(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .video-page {
          flex: 1;
          min-height: 0;
        }
        .video-list-pane {
          display: flex;
          flex-direction: column;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .video-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border);
        }
        .video-filters {
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid var(--color-border);
        }
        .video-filter-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
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
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
        }
        .video-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: var(--color-text);
        }
        .video-list-scroll .muted {
          font-size: 0.875rem;
          color: var(--color-text-muted);
          margin: 0;
        }
        .video-task-list { list-style: none; margin: 0; padding: 0; }
        .video-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }
        .video-task-item-clickable {
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .video-task-item-clickable:hover {
          background: var(--color-surface-light);
          border-color: var(--color-border-light);
        }
        .video-task-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .video-task-title {
          flex: 1;
          font-size: 0.9rem;
          color: var(--color-text);
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
          border: 1px solid var(--color-error);
          background: transparent;
          color: var(--color-error);
          cursor: pointer;
        }
        .video-task-delete:hover:not(:disabled) { background: var(--color-error); color: white; }
        .video-task-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .video-task-status--completed { background: var(--color-success); color: white; }
        .video-task-status--failed,
        .video-task-status--cancelled { background: var(--color-error); color: white; }
        .video-task-status--processing,
        .video-task-status--pending,
        .video-task-status--queued { background: var(--color-primary); color: white; }
        .video-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: var(--color-text-muted);
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .video-task-scripttype {
          background: var(--color-primary-light);
          color: var(--color-primary);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .video-task-id { font-family: ui-monospace, monospace; background: var(--color-surface-light); padding: 0.15rem 0.4rem; border-radius: 4px; }
        .video-task-progress { color: var(--color-primary); }
        .video-task-error { color: var(--color-error); max-width: 100%; }
        .video-form .form-row { margin-bottom: 1rem; }
        .video-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: var(--color-text-muted); }
        .video-form .form-row input,
        .video-form .form-row select,
        .video-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
        }
        .video-form .form-row textarea {
          font-family: ui-monospace, monospace;
          resize: vertical;
        }
        .video-form .form-row input:focus,
        .video-form .form-row select:focus,
        .video-form .form-row textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .form-row-group {
          display: flex;
          gap: 1rem;
        }
        .form-row-group .form-row {
          flex: 1;
        }
        .form-help {
          display: block;
          margin-top: 0.25rem;
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }
        .video-form button[type="submit"] {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: none;
          background: var(--color-primary);
          color: white;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .video-form button[type="submit"]:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }
        .video-form button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 视频播放器样式 */
        .video-player-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .video-player {
          width: 100%;
          border-radius: 6px;
        }
        .video-download {
          align-self: flex-start;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          background: var(--color-primary);
          color: white;
          text-decoration: none;
          font-size: 0.75rem;
          transition: background 0.2s ease;
        }
        .video-download:hover {
          background: var(--color-primary-hover);
        }
        .empty-video {
          text-align: center;
          padding: 2rem;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
