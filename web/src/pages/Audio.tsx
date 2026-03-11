import { useState, useEffect, useCallback } from 'react';
import { notification, Drawer } from 'antd';
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

  const renderForm = () => (
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

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? '提交中...' : audioType === 'voice' ? '生成配音' : '生成音乐'}
      </button>
    </form>
  );

  return (
    <section className="page-card audio-page">
      <div className="audio-header">
        <div className="audio-header-main">
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
        width={520}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnClose
      >
        {renderForm()}
      </Drawer>
    </section>
  );
}
