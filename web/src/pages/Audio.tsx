import { useState, useEffect, useCallback } from 'react';
import { notification } from 'antd';
import {
  postAudioModel,
  listCgiTasks,
  deleteTask,
  fetchMediaBlobUrl,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AudioViewerModal } from '../components/AudioViewerModal';
import { TwoPaneLayout } from '../components/TwoPaneLayout';

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

function getAudioTypeFromTask(t: WritingTaskItem): 'voice' | 'music' {
  const model = (t.metadata?.model as string) || '';
  return model === 'suno-music' ? 'music' : 'voice';
}

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
      if (filterAudioType) {
        const at = getAudioTypeFromTask(t);
        if (filterAudioType !== at) return false;
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
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }

    if (audioType === 'voice') {
      if (!text.trim()) {
        notification.warning({ message: '请输入要合成的文本', placement: 'top' });
        return;
      }
    } else {
      if (!musicPrompt.trim()) {
        notification.warning({ message: '请输入歌词内容', placement: 'top' });
        return;
      }
    }

    setLoading(true);
    try {
      const model = audioType === 'voice' ? VOICE_MODEL : MUSIC_MODEL;
      const body: Record<string, unknown> = {
        metadata: { label: label.trim() || (audioType === 'voice' ? '配音' : '音乐') },
      };

      if (audioType === 'voice') {
        (body as any).text = text.trim();
        (body as any).voice_setting = {
          voice_id: voiceId,
          emotion,
          speed: 1,
          vol: 1,
          pitch: 0,
        };
        (body as any).timbre_weights = [{ voice_id: voiceId, weight: 100 }];
      } else {
        (body as any).prompt = musicPrompt.trim();
        if (musicTitle.trim()) (body as any).title = musicTitle.trim();
        if (musicTags.trim()) (body as any).tags = musicTags.trim();
      }

      const result = await postAudioModel(model, { ...body, storeToMinio: true });
      const bodyRes = (result.data as Record<string, unknown>) ?? {};
      const innerData = bodyRes.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? bodyRes.taskId) as string | undefined;

      if (result.error || bodyRes.error) {
        notification.error({
          message: '提交失败',
          description: (bodyRes.error as string) || result.error || '请稍后重试',
          placement: 'top',
        });
        return;
      }
      if (taskId) {
        notification.success({
          message: '任务已创建',
          description: `${taskId}\n可在左侧任务列表中查看进度。`,
          placement: 'top',
        });
        setText('');
        setMusicPrompt('');
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

  return (
    <div className="audio-page">
      <TwoPaneLayout
        leftClassName="audio-list-pane"
        rightClassName="audio-form-pane"
        left={
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
                    <span className="audio-task-subtype">
                      {AUDIO_TYPE_OPTIONS.find((o) => o.value === getAudioTypeFromTask(t))?.label ??
                        getAudioTypeFromTask(t)}
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
              ))}
            </ul>
          )}
        </div>
          </section>
        }
        right={
          <section className="audio-form-pane">
        <h3 className="audio-form-title">新建音频任务</h3>
        <form onSubmit={handleSubmit} className="form-group audio-form">
          <div className="form-row">
            <label>类型</label>
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
                <label>文本内容 *</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="请输入要合成的文本..."
                  rows={5}
                  required
                />
              </div>
              <div className="form-row-group">
                <div className="form-row">
                  <label>音色</label>
                  <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                    {VOICE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>情感</label>
                  <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
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
                <label>歌词内容 *</label>
                <textarea
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="输入歌词或描述..."
                  rows={5}
                  required
                />
              </div>
              <div className="form-row-group">
                <div className="form-row">
                  <label>标题</label>
                  <input
                    type="text"
                    value={musicTitle}
                    onChange={(e) => setMusicTitle(e.target.value)}
                    placeholder="可选"
                  />
                </div>
                <div className="form-row">
                  <label>标签</label>
                  <input
                    type="text"
                    value={musicTags}
                    onChange={(e) => setMusicTags(e.target.value)}
                    placeholder="可选，逗号分隔"
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
            {loading ? '提交中...' : audioType === 'voice' ? '生成配音' : '生成音乐'}
          </button>
        </form>
          </section>
        }
      />

      <AudioViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '音频结果'}
        task={viewerTask}
        mediaUrls={viewerUrls}
        loading={viewerLoading}
        error={viewerError}
      />

      <style>{`
        .audio-page {
          flex: 1;
          min-height: 0;
        }
        .audio-list-pane {
          display: flex;
          flex-direction: column;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
        }
        .audio-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: #e0e0e0;
          border-bottom: 1px solid #333;
        }
        .audio-filters {
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #333;
        }
        .audio-filter-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
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
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1.5rem;
        }
        .audio-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: #e0e0e0;
        }
        .audio-list-scroll .muted { font-size: 0.875rem; color: #888; margin: 0; }
        .audio-task-list { list-style: none; margin: 0; padding: 0; }
        .audio-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: #252525;
          border: 1px solid #333;
          border-radius: 6px;
        }
        .audio-task-item-clickable { cursor: pointer; transition: background 0.15s, border-color 0.15s; }
        .audio-task-item-clickable:hover { background: #2d2d2d; border-color: #444; }
        .audio-task-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .audio-task-title {
          flex: 1;
          font-size: 0.9rem;
          color: #e0e0e0;
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
          border: 1px solid #7f1d1d;
          background: transparent;
          color: #fca5a5;
          cursor: pointer;
        }
        .audio-task-delete:hover:not(:disabled) { background: #7f1d1d; }
        .audio-task-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .audio-task-status--completed { background: #166534; color: #86efac; }
        .audio-task-status--failed,
        .audio-task-status--cancelled { background: #7f1d1d; color: #fca5a5; }
        .audio-task-status--processing,
        .audio-task-status--pending,
        .audio-task-status--queued { background: #1e3a5f; color: #93c5fd; }
        .audio-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #888;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .audio-task-subtype {
          background: #1e3a5f40;
          color: #93c5fd;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .audio-task-id { font-family: ui-monospace, monospace; background: #1a1a1a; padding: 0.15rem 0.4rem; border-radius: 4px; }
        .audio-task-progress { color: #93c5fd; }
        .audio-task-error { color: #fca5a5; max-width: 100%; }
        .audio-form .form-row { margin-bottom: 1rem; }
        .audio-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: #aaa; }
        .audio-form .form-row input,
        .audio-form .form-row select,
        .audio-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
          box-sizing: border-box;
        }
        .audio-form .form-row textarea { min-height: 80px; resize: vertical; }
        .form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        .form-row-group .form-row { margin-bottom: 0; }
      `}</style>
    </div>
  );
}
