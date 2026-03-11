import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { TwoPaneLayout } from '../components/TwoPaneLayout';
import { WritingViewerModal } from '../components/WritingViewerModal';
import * as WritingAPI from '../api/writing-web';
import type { WritingTaskItem } from '../api/writing-web';

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

export function WritingPage() {
  const { isLoggedIn } = useAuth();
  const [allTasks, setAllTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [filterWritingType, setFilterWritingType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [writingType, setWritingType] = useState('articles');
  const [outlineType, setOutlineType] = useState('');
  const [prompt, setPrompt] = useState('');
  const [label, setLabel] = useState('');
  const [selectedOutlineId, setSelectedOutlineId] = useState<string>('');
  const [outlineTasks, setOutlineTasks] = useState<WritingTaskItem[]>([]);
  const [outlines, setOutlines] = useState<unknown[]>([]);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [storyboardChunkSeconds, setStoryboardChunkSeconds] = useState('10');
  const [storyboardTotalDurationSeconds, setStoryboardTotalDurationSeconds] = useState('');
  const [totalTextCount, setTotalTextCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<WritingTaskItem | null>(null);
  const [viewerContent, setViewerContent] = useState<string>('');
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await WritingAPI.listWritingTasks({ limit: 200, offset: 0 });
      const body = res.data;
      const list = body?.data?.tasks ?? [];
      const writingTasks = list.filter((t) => {
        const rp = t.requestParams as Record<string, unknown> | undefined;
        return rp?.taskType !== 'outline';
      });
      const outlineOnly = list.filter((t) => {
        const rp = t.requestParams as Record<string, unknown> | undefined;
        return rp?.taskType === 'outline';
      });
      setAllTasks(writingTasks);
      setOutlineTasks(outlineOnly);
    } catch (e) {
      console.error('加载写作任务失败:', e);
      setAllTasks([]);
      setOutlineTasks([]);
    } finally {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      alert('请先登录');
      return;
    }
    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    setLoading(true);

    try {
      let finalOutlines = outlines;
      if (selectedOutlineId && outlineTasks.some((t) => t.id === selectedOutlineId)) {
        const taskRes = await WritingAPI.getTask(selectedOutlineId);
        const taskBody = taskRes.data as Record<string, unknown> | undefined;
        const task = (taskBody?.data ?? taskBody) as Record<string, unknown>;
        const result = task?.result as Record<string, unknown> | undefined;
        const metadata = result?.metadata as Record<string, unknown> | undefined;
        const outline = metadata?.outline;
        if (outline) {
          finalOutlines = Array.isArray(outline) ? outline : [outline];
        }
      }

      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        writing_type: writingType,
        outline_type: outlineType || undefined,
        total_textcount:
          writingType === 'articles' && totalTextCount ? parseInt(totalTextCount, 10) : undefined,
        outlines: finalOutlines?.length ? finalOutlines : undefined,
        outputFormat: 'json',
        storeToMinio: true,
        language,
        metadata: {
          writing_type_label: WRITING_TYPE_OPTIONS.find((o) => o.value === writingType)?.label ?? writingType,
          label: label.trim() || undefined,
        },
      };
      if (writingType === 'voice-scripts') {
        (body as any).storage_form = 'txt';
        (body as any).format = 'tts';
      }
      if (writingType === 'lyrics') {
        (body as any).format = 'suno';
        (body as any).storage_form = 'txt';
      }
      if (writingType === 'storyboard-scripts') {
        if (storyboardChunkSeconds) (body as any).storyboard_chunk_seconds = parseInt(storyboardChunkSeconds, 10);
        if (storyboardTotalDurationSeconds)
          (body as any).storyboard_total_duration_seconds = parseInt(storyboardTotalDurationSeconds, 10);
      }

      const result = await WritingAPI.createWriting(body);
      const bodyRes = result.data ?? {};
      if (result.error || (bodyRes as any).error) {
        alert(`提交失败: ${(bodyRes as any).error || result.error || '请稍后重试'}`);
        return;
      }
      const innerData = (bodyRes as any)?.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? (bodyRes as any).taskId) as string | undefined;
      if (taskId) {
        alert(`任务已创建: ${taskId}\n可在下方任务列表中查看进度。`);
        setPrompt('');
        setLabel('');
        setSelectedOutlineId('');
        setOutlines([]);
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

  const handleDeleteTask = async (e: React.MouseEvent, t: WritingTaskItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除任务「${getTaskTitle(t)}」吗？此操作不可恢复。`)) return;
    setDeletingId(t.id);
    try {
      const res = await WritingAPI.deleteTask(t.id);
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
      const res = await WritingAPI.getMediaWriting(t.id);
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
    <div className="writing-page">
      <TwoPaneLayout
        leftClassName="writing-list-pane"
        rightClassName="writing-form-pane"
        left={
          // 左侧：任务列表
          <section className="writing-list-pane">
            <h3 className="writing-list-title">我的写作任务</h3>
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
            <div className="writing-list-scroll">
              {!isLoggedIn ? (
                <p className="muted">请先登录以查看任务列表。</p>
              ) : loadingTasks ? (
                <p className="muted">加载中...</p>
              ) : filteredTasks.length === 0 ? (
                <p className="muted">暂无写作任务，提交右侧表单创建新任务。</p>
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
                              className="writing-task-delete"
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
          </section>
        }
        right={
          // 右侧：新建表单
          <section className="writing-form-pane">
            <h3 className="writing-form-title">新建写作任务</h3>
            <form onSubmit={handleSubmit} className="form-group writing-form">
              <div className="form-row">
                <label>写作类型</label>
                <select
                  value={writingType}
                  onChange={(e) => {
                    setWritingType(e.target.value);
                    setOutlineType('');
                  }}
                >
                  {WRITING_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {writingType === 'articles' && (
                <div className="form-row">
                  <label>总字数</label>
                  <input
                    type="number"
                    value={totalTextCount}
                    onChange={(e) => setTotalTextCount(e.target.value)}
                    placeholder="可选，100-100000"
                    min={0}
                  />
                </div>
              )}

              {(writingType === 'articles' || writingType === 'voice-scripts' || writingType === 'storyboard-scripts') &&
                OUTLINE_TYPE_OPTIONS[writingType] && (
                  <div className="form-row">
                    <label>细分类型</label>
                    <select
                      value={outlineType}
                      onChange={(e) => setOutlineType(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {OUTLINE_TYPE_OPTIONS[writingType].map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {writingType ===