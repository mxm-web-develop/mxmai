import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { TwoPaneLayout } from '../components/TwoPaneLayout';
import * as AudioAPI from '../api/audio-web';
import type { AudioTaskItem } from '../api/audio-web';

const AUDIO_TYPE_OPTIONS = [
  { value: 'voice', label: '配音' },
  { value: 'music', label: '音乐' },
];

const VOICE_MODEL = 'minimax-speech-2.8-hd';
const MUSIC_MODEL = 'suno-music';

const VOICE_OPTIONS = [
  { value: 'female-shaonv', label: '少女音色' },
  { value: 'female-yujie', label: '御姐音色' },
  { value: 'female-chengshu', label: '成熟女性' },
  { value: 'female-tianmei', label: '甜美女性' },
  { value: 'male-qn-jingying', label: '精英青年' },
  { value: 'male-qn-badao', label: '霸道青年' },
  { value: 'presenter_male', label: '男性主持人' },
  { value: 'presenter_female', label: '女性主持人' },
];

const EMOTION_OPTIONS = [
  { value: 'neutral', label: '中性' },
  { value: 'happy', label: '开心' },
  { value: 'sad', label: '悲伤' },
  { value: 'angry', label: '愤怒' },
];

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function getAudioTypeFromTask(t: AudioTaskItem): 'voice' | 'music' {
  const model = (t.metadata?.model as string) || '';
  return model === 'suno-music' ? 'music' : 'voice';
}

function getTaskTitle(t: AudioTaskItem): string {
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

export function AudioPage() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<AudioTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [audioType, setAudioType] = useState<'voice' | 'music'>('voice');
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('female-shaonv');
  const [emotion, setEmotion] = useState('neutral');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
  const [musicTags, setMusicTags] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterAudioType, setFilterAudioType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<AudioTaskItem | null>(null);
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await AudioAPI.listAudioTasks({ limit: 200, offset: 0 });
      const body = res.data;
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
      if (filterAudioType) {
        const taskType = getAudioTypeFromTask(t);
        if (filterAudioType === 'voice' && taskType !== 'voice') return false;
        if (filterAudioType === 'music' && taskType !== 'music') return false;
      }
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

    if (audioType === 'voice' && !text.trim()) {
      alert('请输入配音文本');
      return;
    }

    if (audioType === 'music' && !musicPrompt.trim()) {
      alert('请输入音乐描述');
      return;
    }

    setLoading(true);

    try {
      let params: Record<string, any> = {};
      let modelName = '';

      if (audioType === 'voice') {
        modelName = VOICE_MODEL;
        params = {
          text: text.trim(),
          voice_id: voiceId,
          emotion: emotion,
          storeToMinio: true,
        };
        if (label.trim()) {
          params.metadata = { label: label.trim() };
        }
      } else {
        modelName = MUSIC_MODEL;
        params = {
          prompt: musicPrompt.trim(),
          storeToMinio: true,
        };
        if (musicTitle.trim()) params.title = musicTitle.trim();
        if (musicTags.trim()) params.tags = musicTags.trim();
        if (label.trim()) {
          params.metadata = { label: label.trim() };
        }
      }

      const result = await AudioAPI.createAudioTask(modelName, params);
      const bodyRes = result.data ?? {};
      if (result.error || (bodyRes as any).error) {
        alert(`提交失败: ${(bodyRes as any).error || result.error || '请稍后重试'}`);
        return;
      }
      const innerData = (bodyRes as any)?.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? (bodyRes as any).taskId) as string | undefined;
      if (taskId) {
        alert(`音频任务已创建: ${taskId}\n可在下方任务列表中查看进度。`);
        if (audioType === 'voice') {
          setText('');
        } else {
          setMusicPrompt('');
          setMusicTitle('');
          setMusicTags('');
        }
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

  const handleDeleteTask = async (e: React.MouseEvent, t: AudioTaskItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除任务「${getTaskTitle(t)}」吗？此操作不可恢复。`)) return;
    setDeletingId(t.id);
    try {
      // 这里需要调用删除API，但AudioAPI中没有deleteTask，需要添加
      // 暂时先重新加载列表
      loadTasks();
      if (viewerTask?.id === t.id) setViewerVisible(false);
    } finally {
      setDeletingId(null);
    }
  };

  const handleTaskClick = async (t: AudioTaskItem) => {
    setViewerVisible(true);
    setViewerTask(t);
    setViewerUrls([]);
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await AudioAPI.getMediaAudio(t.id);
      const data = res.data;
      if (res.error) {
        setViewerError(res.error || '获取内容失败');
        return;
      }

      // 处理音频URL
      if (t.result?.mediaUrls && t.result.mediaUrls.length > 0) {
        setViewerUrls(t.result.mediaUrls);
      } else if (t.result?.storageInfo?.urls && t.result.storageInfo.urls.length > 0) {
        setViewerUrls(t.result.storageInfo.urls);
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
          setViewerUrls(urls);
        } else {
          setViewerError('未找到音频文件');
        }
      } else {
        setViewerError('未找到音频文件');
      }
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  return (
    <div className="audio-page">
      <TwoPaneLayout
        leftClassName="audio-list-pane"
        rightClassName="audio-form-pane"
        left={
          // 左侧：任务列表
          <section className="audio-list-pane">
            <h3 className="audio-list-title">我的音频任务</h3>
            <div className="audio-filters">
              <select
                value={filterAudioType}
                onChange={(e) => setFilterAudioType(e.target.value)}
                className="audio-filter-select"
              >
                <option value="">全部类型</option>
                {AUDIO_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
            <div className="audio-list-scroll">
              {!isLoggedIn ? (
                <p className="muted">请先登录以查看任务列表。</p>
              ) : loadingTasks ? (
                <p className="muted">加载中...</p>
              ) : filteredTasks.length === 0 ? (
                <p className="muted">暂无音频任务，提交右侧表单创建新任务。</p>
              ) : (
                <ul className="audio-task-list">
                  {filteredTasks.map((t) => {
                    const taskType = getAudioTypeFromTask(t);
                    return (
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
                              className="audio-task-delete"
                              title="删除"
                              onClick={(e) => handleDeleteTask(e, t)}
                              disabled={deletingId === t.id}
                            >
                              {deletingId === t.id ? '…' : '删除'}
                            </button>
                          </span>
                        </div>
                        <div className="audio-task-meta">
                          <span className="audio-task-type">
                            {taskType === 'voice' ? '配音' : '音乐'}
                          </span>
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
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        }
        right={
          // 右侧：新建表单
          <section className="audio-form-pane">
            <h3 className="audio-form-title">新建音频任务</h3>
            <form onSubmit={handleSubmit} className="form-group audio-form">
              <div className="form-row">
                <label>音频类型</label>
                <select
                  value={audioType}
                  onChange={(e) => setAudioType(e.target.value as 'voice' | 'music')}
                >
                  {AUDIO_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {audioType === 'voice' ? (
                <>
                  <div className="form-row">
                    <label>配音文本 *</label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="请输入需要配音的文本..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="form-row-group">
                    <div className="form-row">
                      <label>音色</label>
                      <select
                        value={voiceId}
                        onChange={(e) => setVoiceId(e.target.value)}
                      >
                        {VOICE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-row">
                      <label>情感</label>
                      <select
                        value={emotion}
                        onChange={(e) => setEmotion(e.target.value)}
                      >
                        {EMOTION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-row">
                    <label>音乐描述 *</label>
                    <textarea
                      value={musicPrompt}
                      onChange={(e) => setMusicPrompt(e.target.value)}
                      placeholder="描述你想要的音乐风格、情绪、乐器等..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="form-row-group">
                    <div className="form-row">
                      <label>音乐标题</label>
                      <input
                        type="text"
                        value={musicTitle}
                        onChange={(e) => setMusicTitle(e.target.value)}
                        placeholder="可选"
                      />
                    </div>
                    <div className="form-row">
                      <label>音乐标签</label>
                      <input
                        type="text"
                        value={musicTags}
                        onChange={(e) => setMusicTags(e.target.value)}
                        placeholder="可选，用逗号分隔"
                      />
                    </div>
                  </div>
                </>
              )}

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
                {loading ? '提交中...' : '生成音频'}
              </button>
            </form>
          </section>
        }
      />

      {/* 音频查看模态框 */}
      {viewerVisible && (
        <div className="modal-overlay" onClick={() => setViewerVisible(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewerTask ? getTaskTitle(viewerTask) : '音频内容'}</h3>
              <button className="modal-close" onClick={() => setViewerVisible(false)}>
                ×
              </button>
            </div>
            <div className="modal-content">
              {viewerLoading ? (
                <div className="loading-indicator">加载中...</div>
              ) : viewerError ? (
                <div className="error-message">{viewerError}</div>
              ) : viewerUrls.length > 0 ? (
                <div className="audio-player-container">
                  {viewerUrls.map((url, index) => (
                    <div key={index} className="audio-player-item">
                      <audio controls src={url} className="audio-player">
                        您的浏览器不支持音频播放
                      </audio>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="audio-download">
                        下载音频
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-audio">暂无音频文件</div>
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
        .audio-page {
          flex: 1;
          min-height: 0;
        }
        .audio-list-pane {
          display: flex;
          flex-direction: column;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .audio-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border);
        }
        .audio-filters {
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid var(--color-border);
        }
        .audio-filter-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
        }
        .audio-list-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1rem;
        }
        .audio-form-pane {
          flex: 5;
          min-width: 0;
          min-height: 0;
          overflow-y: auto;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
        }
        .audio-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: var(--color-text);
        }
        .audio-list-scroll .muted {
          font-size: 0.875rem;
          color: var(--color-text-muted);
          margin: 0;
        }
        .audio-task-list { list-style: none; margin: 0; padding: 0; }
        .audio-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }
        .audio-task-item-clickable {
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .audio-task-item-clickable:hover {
          background: var(--color-surface-light);
          border-color: var(--color-border-light);
        }
        .audio-task-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .audio-task-title {
          flex: 1;
          font-size: 0.9rem;
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .audio-task-actions { flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; }
        .audio-task-status { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
        .audio-task-delete {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--color-error);
          background: transparent;
          color: var(--color-error);
          cursor: pointer;
        }
        .audio-task-delete:hover:not(:disabled) { background: var(--color-error); color: white; }
        .audio-task-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .audio-task-status--completed { background: var(--color-success); color: white; }
        .audio-task-status--failed,
        .audio-task-status--cancelled { background: var(--color-error); color: white; }
        .audio-task-status--processing,
        .audio-task-status--pending,
        .audio-task-status--queued { background: var(--color-primary); color: white; }
        .audio-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: var(--color-text-muted);
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .audio-task-type {
          background: var(--color-primary-light);
          color: var(--color-primary);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .audio-task-id { font-family: ui-monospace, monospace; background: var(--color-surface-light); padding: 0.15rem 0.4rem; border-radius: 4px; }
        .audio-task-progress { color: var(--color-primary); }
        .audio-task-error { color: var(--color-error); max-width: 100%; }
        .audio-form .form-row { margin-bottom: 1rem; }
        .audio-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: var(--color-text-muted); }
        .audio-form .form-row input,
        .audio-form .form-row select,
        .audio-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
        }
        .audio-form .form-row textarea {
          font-family: inherit;
          resize: vertical;
        }
        .audio-form .form-row input:focus,
        .audio-form .form-row select:focus,
        .audio-form .form-row textarea:focus {
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
        .audio-form button[type="submit"] {
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
        .audio-form button[type="submit"]:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }
        .audio-form button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 音频播放器样式 */
        .audio-player-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .audio-player-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .audio-player {
          width: 100%;
          border-radius: 6px;
        }
        .audio-download {
          align-self: flex-start;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          background: var(--color-primary);
          color: white;
          text-decoration: none;
          font-size: 0.75rem;
          transition: background 0.2s ease;
        }
        .audio-download:hover {
          background: var(--color-primary-hover);
        }
        .empty-audio {
          text-align: center;
          padding: 2rem;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
