import { useState, useEffect, useCallback } from 'react';
import { Drawer, notification } from 'antd';
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
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

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
      const outlineTasks = list
        .filter((t) => {
          const rp = t.requestParams as Record<string, unknown> | undefined;
          return rp?.taskType === 'outline';
        })
        .sort((a, b) => {
          const aTime = new Date(a.createdAt ?? 0).getTime();
          const bTime = new Date(b.createdAt ?? 0).getTime();
          return bTime - aTime;
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
        const msg = (bodyRes.error as string) || result.error || '请稍后重试';
        const isNetworkError = result.status === 0 || /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg);
        notification.error({
          message: '提交失败',
          description: isNetworkError
            ? `${msg}。请确认 Gateway 与 mxmcgi 已启动（如 pnpm run dev:all）。`
            : msg,
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
        setFormOpen(false);
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

  const renderForm = () => (
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
  );

  const visibleTasks = tasks.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const title = getTaskTitle(t).toLowerCase();
    return title.includes(q) || t.id.toLowerCase().includes(q);
  });

  return (
    <section className="page-card outline-page">
      <div className="outline-header">
        <div className="outline-header-main">
          <div className="outline-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索任务名称或 ID..."
            />
          </div>
        </div>
        <div className="outline-header-actions">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => loadOutlineTasks()}
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
            新建大纲
          </button>
        </div>
      </div>

      <div className="outline-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看大纲任务。</p>
        ) : loadingTasks ? (
          <p className="muted">加载中...</p>
        ) : visibleTasks.length === 0 ? (
          <p className="muted">暂无大纲任务，点击右上角「新建大纲」开始。</p>
        ) : (
          <ul className="outline-task-list">
            {visibleTasks.map((t) => (
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
                      className="btn-danger btn-small"
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

      <OutlineViewerModal
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        title={viewerData?.title}
        outline={viewerData?.outline ?? null}
        characters={viewerData?.characters ?? []}
        loading={viewerLoading}
        error={viewerError}
      />

      <Drawer
        title="新建大纲任务"
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
