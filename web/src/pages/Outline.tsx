import { useState, useEffect, useCallback } from 'react';
import { notification } from 'antd';
import {
  createOutline,
  listWritingTasks,
  getTask,
  deleteTask,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { OutlineViewerModal } from '../components/OutlineViewerModal';
import { TwoPaneLayout } from '../components/TwoPaneLayout';
import type { OutlineNode, CharacterProfile } from '../components/OutlineViewerModal';

// 大纲应用类型选项（与 mobile 一致）
const OUTLINE_APPLYTO_OPTIONS = [
  { value: 'articles', label: '文章' },
  { value: 'voice-scripts', label: '口播稿' },
  { value: 'storyboard-scripts', label: '分镜脚本' },
];

// 大纲细分类型选项（与 mobile 一致）
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

// 大纲结构类型选项
const OUTLINE_STRUCTURE_TYPE_OPTIONS = [
  { value: 'three-act', label: '三段式' },
  { value: 'aida', label: 'AIDA' },
  { value: 'pas', label: 'PAS' },
  { value: 'bab', label: 'BAB' },
  { value: 'hero-journey', label: '英雄之旅' },
  { value: 'imrad', label: 'IMRaD' },
  { value: 'hook-value-cta', label: '钩子-干货-CTA' },
  { value: 'act-scene-storyboard', label: '幕式分镜' },
];

/**
 * 与后端 outline-structure-types.ts 的 isStructureTypeAvailable 规则保持一致
 */
function getAvailableStructureTypes(
  applyTo: string,
  outlineType: string
): Array<{ value: string; label: string }> {
  const opts = OUTLINE_STRUCTURE_TYPE_OPTIONS;
  // 三段式始终可用
  const base = opts.filter((o) => o.value === 'three-act');
  if (!outlineType) return base;

  const allowed: string[] = ['three-act'];

  if (applyTo === 'articles') {
    if (outlineType === 'academic-paper') allowed.push('imrad');
    else if (outlineType === 'story-novel') allowed.push('hero-journey');
    // tech-article: 仅三段式
  } else if (applyTo === 'voice-scripts') {
    if (outlineType === 'sales-voice') {
      allowed.push('aida', 'pas', 'bab');
    } else if (outlineType === 'emotional-story-voice') {
      allowed.push('bab', 'hero-journey');
    } else if (outlineType === 'knowledge-sharing-voice') {
      allowed.push('hook-value-cta');
    }
  } else if (applyTo === 'storyboard-scripts') {
    const heroJourneyTypes = ['movie-storyboard', 'animation-storyboard', 'game-cg-storyboard'];
    const hookValueCtaTypes = ['short-video-storyboard', 'commercial-storyboard'];
    if (heroJourneyTypes.includes(outlineType)) {
      allowed.push('hero-journey', 'act-scene-storyboard');
    } else if (hookValueCtaTypes.includes(outlineType)) {
      allowed.push('hook-value-cta');
    }
  }

  return opts.filter((o) => allowed.includes(o.value));
}

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export default function Outline() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [applyTo, setApplyTo] = useState('');
  const [outlineType, setOutlineType] = useState('');
  const [outlineStructureType, setOutlineStructureType] = useState('');
  const [maxDepth, setMaxDepth] = useState('3');
  const [expectedNodes, setExpectedNodes] = useState('');
  const [totalTextCount, setTotalTextCount] = useState('');
  const [totalDurationSeconds, setTotalDurationSeconds] = useState('');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerData, setViewerData] = useState<{
    title: string;
    outline: OutlineNode | OutlineNode[] | null;
    characters: CharacterProfile[];
  } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadOutlineTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await listWritingTasks({ limit: 100, offset: 0 });
      const body = res.data as WritingTaskListResponse | undefined;
      const list = body?.data?.tasks ?? [];
      const outlineTasks = list.filter((t) => {
        const rp = t.requestParams as Record<string, unknown> | undefined;
        return rp?.taskType === 'outline';
      });
      setTasks(outlineTasks);
    } catch (e) {
      console.error('加载大纲任务失败:', e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadOutlineTasks();
    const interval = setInterval(loadOutlineTasks, 8000);
    return () => clearInterval(interval);
  }, [loadOutlineTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      notification.warning({ message: '请先登录', placement: 'top' });
      return;
    }
    if (!prompt.trim()) {
      notification.warning({ message: '请输入提示词', placement: 'top' });
      return;
    }

    if (applyTo && outlineStructureType) {
      const availableTypes = getAvailableStructureTypes(applyTo, outlineType);
      const isValid = availableTypes.some((opt) => opt.value === outlineStructureType);
      if (!isValid) {
        notification.warning({
          message: '结构类型不适用',
          description: `结构类型 ${outlineStructureType} 不适用于当前选择`,
          placement: 'top',
        });
        return;
      }
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        uid: `outline_${Date.now()}`,
        prompt: prompt.trim(),
        maxDepth: maxDepth ? parseInt(maxDepth, 10) : undefined,
        expectedNodes: expectedNodes ? parseInt(expectedNodes, 10) : undefined,
        total_textcount:
          applyTo === 'articles' && totalTextCount ? parseInt(totalTextCount, 10) : undefined,
        total_duration_seconds:
          (applyTo === 'voice-scripts' || applyTo === 'storyboard-scripts') && totalDurationSeconds
            ? parseInt(totalDurationSeconds, 10)
            : undefined,
        applyto: applyTo || undefined,
        outline_type: outlineType || undefined,
        outline_structure_type: outlineStructureType || undefined,
        language,
        outputFormat: 'json',
        metadata: label.trim() ? { label: label.trim() } : undefined,
      };

      const result = await createOutline(body);
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
      if (taskId) {
        notification.success({
          message: '任务已创建',
          description: `${taskId}\n可在下方任务列表中查看进度。`,
          placement: 'top',
        });
        setPrompt('');
        loadOutlineTasks();
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
        loadOutlineTasks();
        setViewerVisible(false);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleTaskClick = async (t: WritingTaskItem) => {
    setViewerVisible(true);
    setViewerData(null);
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await getTask(t.id);
      const body = res.data as Record<string, unknown> | undefined;
      if (res.error) {
        setViewerError(res.error || '获取任务详情失败');
        return;
      }
      // API 返回 { success, data: task }，task 含 result.metadata
      const task = (body?.data ?? body) as Record<string, unknown>;
      const result = task?.result as Record<string, unknown> | undefined;
      const metadata = result?.metadata as Record<string, unknown> | undefined;
      const outline = (metadata?.outline ?? null) as OutlineNode | OutlineNode[] | null;
      const characters = (metadata?.characters as CharacterProfile[] | undefined) ?? [];
      setViewerData({
        title: getTaskTitle(t),
        outline,
        characters,
      });
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewerLoading(false);
    }
  };

  const getTaskTitle = (t: WritingTaskItem) => {
    const rp = t.requestParams as Record<string, unknown> | undefined;
    const params = rp?.params as Record<string, unknown> | undefined;
    const labelVal =
      (t.metadata?.label as string)?.trim() ||
      (params?.metadata as Record<string, unknown> | undefined)?.label as string | undefined;
    const promptVal = (params?.prompt as string) || '';
    return (
      labelVal?.trim() ||
      (promptVal?.trim().length
        ? `大纲：${promptVal.slice(0, 36).replace(/\n/g, ' ').trim()}`
        : '写作大纲')
    );
  };

  return (
    <div className="outline-page">
      <TwoPaneLayout
        leftClassName="outline-list-pane"
        rightClassName="outline-form-pane"
        left={
          // 左侧：任务列表
          <section className="outline-list-pane">
        <h3 className="outline-list-title">我的大纲任务</h3>
        <div className="outline-list-scroll">
          {!isLoggedIn ? (
            <p className="muted">请先登录以查看任务列表。</p>
          ) : loadingTasks ? (
            <p className="muted">加载中...</p>
          ) : tasks.length === 0 ? (
            <p className="muted">暂无大纲任务，提交右侧表单创建新任务。</p>
          ) : (
            <ul className="outline-task-list">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="outline-task-item outline-task-item-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTaskClick(t)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTaskClick(t)}
                >
                  <div className="outline-task-main">
                    <span className="outline-task-title" title={getTaskTitle(t)}>
                      {getTaskTitle(t)}
                    </span>
                    <span className="outline-task-actions">
                      <span className={`outline-task-status outline-task-status--${t.status}`}>
                        {STATUS_MAP[t.status] ?? t.status}
                      </span>
                      <button
                        type="button"
                        className="outline-task-delete"
                        title="删除"
                        onClick={(e) => handleDeleteTask(e, t)}
                        disabled={deletingId === t.id}
                      >
                        {deletingId === t.id ? '…' : '删除'}
                      </button>
                    </span>
                  </div>
                  <div className="outline-task-meta">
                    <code className="outline-task-id">{t.id}</code>
                    {t.progress?.progress != null && (
                      <span className="outline-task-progress">{t.progress.progress}%</span>
                    )}
                    {t.progress?.error && (
                      <span className="outline-task-error" title={t.progress.error}>
                        {t.progress.error.slice(0, 80)}
                        {t.progress.error.length > 80 ? '…' : ''}
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
          // 右侧：提交表单
          <section className="outline-form-pane">
        <h3 className="outline-form-title">新建大纲任务</h3>
        <form onSubmit={handleSubmit} className="form-group outline-form">
          <div className="form-row">
            <label>提示词 *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="请输入大纲是关于什么的..."
              rows={4}
              required
            />
          </div>

          <div className="form-row">
            <label>应用于</label>
            <select
              value={applyTo}
              onChange={(e) => {
                setApplyTo(e.target.value);
                setOutlineType('');
                setOutlineStructureType('');
              }}
            >
              <option value="">请选择</option>
              {OUTLINE_APPLYTO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {applyTo && OUTLINE_TYPE_OPTIONS[applyTo] && (
            <div className="form-row">
              <label>细分类型</label>
              <select
                value={outlineType}
                onChange={(e) => {
                  setOutlineType(e.target.value);
                  setOutlineStructureType('');
                }}
              >
                <option value="">请选择</option>
                {OUTLINE_TYPE_OPTIONS[applyTo].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {applyTo && (
            <div className="form-row">
              <label>大纲结构类型</label>
              <select
                value={outlineStructureType}
                onChange={(e) => setOutlineStructureType(e.target.value)}
              >
                <option value="">请选择</option>
                {getAvailableStructureTypes(applyTo, outlineType).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row-group">
            {applyTo !== 'storyboard-scripts' && (
              <div className="form-row">
                <label>大纲深度</label>
                <input
                  type="number"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(e.target.value)}
                  placeholder="3"
                  min={1}
                  max={6}
                />
              </div>
            )}
            <div className="form-row">
              <label>期望节点数</label>
              <input
                type="number"
                value={expectedNodes}
                onChange={(e) => setExpectedNodes(e.target.value)}
                placeholder="可选"
                min={0}
              />
            </div>
          </div>

          {applyTo === 'articles' && (
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

          {(applyTo === 'voice-scripts' || applyTo === 'storyboard-scripts') && (
            <div className="form-row">
              <label>总时长（秒）</label>
              <input
                type="number"
                value={totalDurationSeconds}
                onChange={(e) => setTotalDurationSeconds(e.target.value)}
                placeholder="可选，例如 300"
                min={0}
              />
            </div>
          )}

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
            {loading ? '提交中...' : '生成大纲'}
          </button>
        </form>
          </section>
        }
      />

      <OutlineViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerData?.title}
        outline={viewerData?.outline ?? null}
        characters={viewerData?.characters ?? []}
        loading={viewerLoading}
        error={viewerError}
      />

      <style>{`
        .outline-page {
          flex: 1;
          min-height: 0;
        }
        .outline-list-pane {
          display: flex;
          flex-direction: column;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
        }
        .outline-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: #e0e0e0;
          border-bottom: 1px solid #333;
        }
        .outline-list-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1rem;
        }
        .outline-form-pane {
          flex: 5;
          min-width: 0;
          min-height: 0;
          overflow-y: auto;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1.5rem;
        }
        .outline-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: #e0e0e0;
        }
        .outline-list-scroll .muted {
          font-size: 0.875rem;
          color: #888;
          margin: 0;
        }
        .outline-task-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .outline-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: #252525;
          border: 1px solid #333;
          border-radius: 6px;
        }
        .outline-task-item-clickable {
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .outline-task-item-clickable:hover {
          background: #2d2d2d;
          border-color: #444;
        }
        .outline-task-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .outline-task-title {
          flex: 1;
          font-size: 0.9rem;
          color: #e0e0e0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .outline-task-actions {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .outline-task-status {
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }
        .outline-task-delete {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid #7f1d1d;
          background: transparent;
          color: #fca5a5;
          cursor: pointer;
        }
        .outline-task-delete:hover:not(:disabled) {
          background: #7f1d1d;
        }
        .outline-task-delete:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .outline-task-status--completed { background: #166534; color: #86efac; }
        .outline-task-status--failed,
        .outline-task-status--cancelled { background: #7f1d1d; color: #fca5a5; }
        .outline-task-status--processing,
        .outline-task-status--pending,
        .outline-task-status--queued { background: #1e3a5f; color: #93c5fd; }
        .outline-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #888;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .outline-task-id {
          font-family: ui-monospace, monospace;
          background: #1a1a1a;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .outline-task-progress { color: #93c5fd; }
        .outline-task-error { color: #fca5a5; max-width: 100%; }
        .outline-form .form-row { margin-bottom: 1rem; }
        .outline-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: #aaa; }
        .outline-form .form-row input,
        .outline-form .form-row select,
        .outline-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
          box-sizing: border-box;
        }
        .outline-form .form-row textarea { min-height: 80px; resize: vertical; }
        .form-row-group { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        .form-row-group .form-row { margin-bottom: 0; }
      `}</style>
    </div>
  );
}
