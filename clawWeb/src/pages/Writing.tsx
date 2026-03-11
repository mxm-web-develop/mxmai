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

              {writingType === 'storyboard-scripts' && (
                <div className="form-row-group">
                  <div className="form-row">
                    <label>每段时长（秒）</label>
                    <select
                      value={storyboardChunkSeconds}
                      onChange={(e) => setStoryboardChunkSeconds(e.target.value)}
                    >
                      {[4, 5, 8, 10, 15, 20, 25].map((n) => (
                        <option key={n} value={n}>
                          {n} 秒
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>期望总时长（秒）</label>
                    <input
                      type="number"
                      value={storyboardTotalDurationSeconds}
                      onChange={(e) => setStoryboardTotalDurationSeconds(e.target.value)}
                      placeholder="可选"
                      min={0}
                    />
                  </div>
                </div>
              )}

              <div className="form-row">
                <label>使用大纲</label>
                <select
                  value={selectedOutlineId}
                  onChange={(e) => setSelectedOutlineId(e.target.value)}
                >
                  <option value="">不使用大纲</option>
                  {outlineTasks.map((ot) => (
                    <option key={ot.id} value={ot.id}>
                      {getTaskTitle(ot)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label>提示词 *</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="请输入写作内容需求，或根据大纲生成时填「根据大纲进行生成」..."
                  rows={4}
                  required
                />
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label>语言</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
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
              </div>

              <button type="submit" disabled={loading}>
                {loading ? '提交中...' : '生成'}
              </button>
            </form>
          </section>
        }
      />

      <WritingViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerTask ? getTaskTitle(viewerTask) : '写作内容'}
        content={viewerContent}
        task={viewerTask}
        loading={viewerLoading}
        error={viewerError}
      />

      <style>{`
        .writing-page {
          flex: 1;
          min-height: 0;
        }
        .writing-list-pane {
          display: flex;
          flex-direction: column;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .writing-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border);
        }
        .writing-filters {
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid var(--color-border);
        }
        .writing-filter-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
        }
        .writing-list-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1rem;
        }
        .writing-form-pane {
          flex: 5;
          min-width: 0;
          min-height: 0;
          overflow-y: auto;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
        }
        .writing-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: var(--color-text);
        }
        .writing-list-scroll .muted {
          font-size: 0.875rem;
          color: var(--color-text-muted);
          margin: 0;
        }
        .writing-task-list { list-style: none; margin: 0; padding: 0; }
        .writing-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }
        .writing-task-item-clickable {
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .writing-task-item-clickable:hover {
          background: var(--color-surface-light);
          border-color: var(--color-border-light);
        }
        .writing-task-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .writing-task-title {
          flex: 1;
          font-size: 0.9rem;
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .writing-task-actions { flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; }
        .writing-task-status { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
        .writing-task-delete {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--color-error);
          background: transparent;
          color: var(--color-error);
          cursor: pointer;
        }
        .writing-task-delete:hover:not(:disabled) { background: var(--color-error); color: white; }
        .writing-task-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .writing-task-status--completed { background: var(--color-success); color: white; }
        .writing-task-status--failed,
        .writing-task-status--cancelled { background: var(--color-error); color: white; }
        .writing-task-status--processing,
        .writing-task-status--pending,
        .writing-task-status--queued { background: var(--color-primary); color: white; }
        .writing-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: var(--color-text-muted);
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .writing-task-subtype {
          background: var(--color-primary-light);
          color: var(--color-primary);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .writing-task-id { font-family: ui-monospace, monospace; background: var(--color-surface-light); padding: 0.15rem 0.4rem; border-radius: 4px; }
        .writing-task-progress { color: var(--color-primary); }
        .writing-task-error { color: var(--color-error); max-width: 100%; }
        .writing-form .form-row { margin-bottom: 1rem; }
        .writing-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: var(--color-text-muted); }
        .writing-form .form-row input,
        .writing-form .form-row select,
        .writing-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
        }
        .writing-form .form-row textarea {
          font-family: inherit;
          resize: vertical;
        }
        .writing-form .form-row input:focus,
        .writing-form .form-row select:focus,
        .writing-form .form-row textarea:focus {
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
        .writing-form button[type="submit"] {
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
        .writing-form button[type="submit"]:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }
        .writing-form button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* TwoPaneLayout 样式 */
        .two-pane-layout {
          display: flex;
          gap: 1.5rem;
          height: calc(100vh - 200px);
          min-height: 500px;
        }
        .two-pane-left {
          flex: 3;
          min-width: 0;
          min-height: 0;
        }
        .two-pane-right {
          flex: 5;
          min-width: 0;
          min-height: 0;
        }

        /* 移动端样式 */
        .two-pane-layout--mobile {
          flex-direction: column;
          height: auto;
        }
        .two-pane-fab {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          background: var(--color-primary);
          color: white;
          font-size: 0.875rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 100;
        }
        .two-pane-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .two-pane-overlay-inner {
          background: var(--color-surface);
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .two-pane-overlay-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--color-border);
        }
        .two-pane-overlay-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text);
        }
        .two-pane-overlay-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .two-pane-overlay-body {
          padding: 1.5rem;
        }
      `}</style>
    </div>
  );
}