import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { TwoPaneLayout } from '../components/TwoPaneLayout';
import { OutlineViewerModal } from '../components/OutlineViewerModal';
import * as OutlineAPI from '../api/outline-web';
import type { OutlineTaskItem } from '../api/outline-web';

// 大纲应用类型选项
const OUTLINE_APPLYTO_OPTIONS = [
  { value: 'articles', label: '文章' },
  { value: 'voice-scripts', label: '口播稿' },
  { value: 'storyboard-scripts', label: '分镜脚本' },
];

// 大纲细分类型选项
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

// 立场选项
const STANCE_OPTIONS = [
  { value: 'neutral', label: '中立客观' },
  { value: 'supportive', label: '支持赞同' },
  { value: 'critical', label: '批判质疑' },
  { value: 'balanced', label: '平衡辩证' },
];

// 语调选项
const TONE_OPTIONS = [
  { value: 'formal', label: '正式严谨' },
  { value: 'casual', label: '轻松随意' },
  { value: 'professional', label: '专业权威' },
  { value: 'friendly', label: '友好亲切' },
  { value: 'energetic', label: '充满活力' },
  { value: 'calm', label: '平静温和' },
];

// 口播稿语速选项
const SPEECH_RATE_OPTIONS = [
  { value: '150', label: '150 CPM（很慢）' },
  { value: '180', label: '180 CPM（偏慢）' },
  { value: '210', label: '210 CPM（正常）' },
  { value: '240', label: '240 CPM（偏快）' },
  { value: '270', label: '270 CPM（很快）' },
];

// 口播稿节奏选项
const VOICE_SCRIPT_RHYTHM_OPTIONS = [
  { value: 'slow', label: '慢节奏（停顿长、频率低、文字少）' },
  { value: 'normal', label: '正常节奏（平衡）' },
  { value: 'fast', label: '快节奏（停顿短、频率高、文字多）' },
];

// 分镜节奏选项
const RHYTHM_OPTIONS = [
  { value: '10', label: '慢（10 镜头/分钟）' },
  { value: '18', label: '正常（18 镜头/分钟）' },
  { value: '28', label: '快（28 镜头/分钟）' },
];

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

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

function extractApplyTo(t: OutlineTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  return (
    (params?.applyto as string) ??
    (params?.params as Record<string, unknown> | undefined)?.applyto as string ??
    ''
  );
}

function extractOutlineType(t: OutlineTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  return (
    (params?.outline_type as string) ??
    (params?.params as Record<string, unknown> | undefined)?.outline_type as string ??
    ''
  );
}

function getTaskTitle(t: OutlineTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string) || '';
  return promptVal?.trim().length
    ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
    : '大纲任务';
}

function getSubtypeLabel(applyTo: string, outlineType: string): string {
  const opts = OUTLINE_TYPE_OPTIONS[applyTo];
  if (!opts || !outlineType) return '';
  const found = opts.find((o) => o.value === outlineType);
  return found?.label ?? outlineType;
}

export function OutlinePage() {
  const { isLoggedIn } = useAuth();
  const [allTasks, setAllTasks] = useState<OutlineTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [filterApplyTo, setFilterApplyTo] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [applyTo, setApplyTo] = useState('articles');
  const [outlineType, setOutlineType] = useState('');
  const [outlineStructureType, setOutlineStructureType] = useState('three-act');
  const [prompt, setPrompt] = useState('');
  const [stance, setStance] = useState('');
  const [tone, setTone] = useState('');
  const [speechRate, setSpeechRate] = useState('');
  const [voiceScriptRhythm, setVoiceScriptRhythm] = useState('');
  const [rhythm, setRhythm] = useState('');
  const [totalTextCount, setTotalTextCount] = useState('');
  const [totalDurationSeconds, setTotalDurationSeconds] = useState('');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerTask, setViewerTask] = useState<OutlineTaskItem | null>(null);
  const [viewerContent, setViewerContent] = useState<string>('');
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTasks(true);
    try {
      const res = await OutlineAPI.listOutlineTasks({ limit: 200, offset: 0 });
      const body = res.data;
      const list = body?.data?.tasks ?? [];
      const outlineTasks = list.filter((t) => {
        const rp = t.requestParams as Record<string, unknown> | undefined;
        return rp?.taskType === 'outline';
      });
      setAllTasks(outlineTasks);
    } catch (e) {
      console.error('加载大纲任务失败:', e);
      setAllTasks([]);
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
      if (filterApplyTo && extractApplyTo(t) !== filterApplyTo) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

  const availableStructureTypes = getAvailableStructureTypes(applyTo, outlineType);

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
      const uid = `outline_${Date.now()}`;
      const body: Record<string, unknown> = {
        uid,
        prompt: prompt.trim(),
        applyto: applyTo,
        outline_type: outlineType || undefined,
        outline_structure_type: outlineStructureType,
        stance: stance || undefined,
        tone: tone || undefined,
        language,
        outputFormat: 'json',
        storeToMinio: true,
      };

      if (applyTo === 'articles' && totalTextCount) {
        body.total_textcount = parseInt(totalTextCount, 10);
      }

      if (applyTo === 'voice-scripts') {
        if (speechRate) body.speech_rate = speechRate;
        if (voiceScriptRhythm) body.voice_script_rhythm = voiceScriptRhythm;
        if (totalDurationSeconds) body.total_duration_seconds = parseInt(totalDurationSeconds, 10);
      }

      if (applyTo === 'storyboard-scripts') {
        if (rhythm) body.rhythm = rhythm;
        if (totalDurationSeconds) body.total_duration_seconds = parseInt(totalDurationSeconds, 10);
      }

      const result = await OutlineAPI.createOutline(body);
      const bodyRes = result.data ?? {};
      if (result.error || (bodyRes as any).error) {
        alert(`提交失败: ${(bodyRes as any).error || result.error || '请稍后重试'}`);
        return;
      }
      const innerData = (bodyRes as any)?.data as Record<string, unknown> | undefined;
      const taskId = (innerData?.taskId ?? (bodyRes as any).taskId) as string | undefined;
      if (taskId) {
        alert(`大纲任务已创建: ${taskId}\n可在下方任务列表中查看进度。`);
        setPrompt('');
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

  const handleDeleteTask = async (e: React.MouseEvent, t: OutlineTaskItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除大纲任务「${getTaskTitle(t)}」吗？此操作不可恢复。`)) return;
    setDeletingId(t.id);
    try {
      const res = await OutlineAPI.getOutlineTask(t.id);
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

  const handleTaskClick = async (t: OutlineTaskItem) => {
    setViewerVisible(true);
    setViewerTask(t);
    setViewerContent('');
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await OutlineAPI.getMediaOutline(t.id);
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
    <div className="outline-page">
      <TwoPaneLayout
        leftClassName="outline-list-pane"
        rightClassName="outline-form-pane"
        left={
          // 左侧：任务列表
          <section className="outline-list-pane">
            <h3 className="outline-list-title">我的大纲任务</h3>
            <div className="outline-filters">
              <select
                value={filterApplyTo}
                onChange={(e) => setFilterApplyTo(e.target.value)}
                className="outline-filter-select"
              >
                <option value="">全部类型</option>
                {OUTLINE_APPLYTO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="outline-filter-select"
              >
                <option value="">全部状态</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="outline-list-scroll">
              {!isLoggedIn ? (
                <p className="muted">请先登录以查看任务列表。</p>
              ) : loadingTasks ? (
                <p className="muted">加载中...</p>
              ) : filteredTasks.length === 0 ? (
                <p className="muted">暂无大纲任务，提交右侧表单创建新任务。</p>
              ) : (
                <ul className="outline-task-list">
                  {filteredTasks.map((t) => {
                    const applyToVal = extractApplyTo(t);
                    const outlineTypeVal = extractOutlineType(t);
                    const subtypeLabel = getSubtypeLabel(applyToVal, outlineTypeVal);
                    return (
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
                          {subtypeLabel && (
                            <span className="outline-task-subtype">{subtypeLabel}</span>
                          )}
                          <code className="outline-task-id">{t.id}</code>
                          {t.progress?.progress != null && (
                            <span className="outline-task-progress">{t.progress.progress}%</span>
                          )}
                          {t.progress?.error && (
                            <span className="outline-task-error" title={t.progress.error}>
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
          <section className="outline-form-pane">
            <h3 className="outline-form-title">新建大纲任务</h3>
            <form onSubmit={handleSubmit} className="form-group outline-form">
              <div className="form-row">
                <label>应用于</label>
                <select
                  value={applyTo}
                  onChange={(e) => {
                    setApplyTo(e.target.value);
                    setOutlineType('');
                    setOutlineStructureType('three-act');
                  }}
                >
                  {OUTLINE_APPLYTO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {OUTLINE_TYPE_OPTIONS[applyTo] && (
                <div className="form-row">
                  <label>细分类型</label>
                  <select
                    value={outlineType}
                    onChange={(e) => {
                      setOutlineType(e.target.value);
                      setOutlineStructureType('three-act');
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

              <div className="form-row">
                <label>大纲结构类型</label>
                <select
                  value={outlineStructureType}
                  onChange={(e) => setOutlineStructureType(e.target.value)}
                >
                  {availableStructureTypes.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label>提示词 *</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="请输入大纲需求描述..."
                  rows={4}
                  required
                />
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label>立场</label>
                  <select
                    value={stance}
                    onChange={(e) => setStance(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {STANCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>语调</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {TONE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
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
                  <label>期望总时长（秒）</label>
                  <input
                    type="number"
                    value={totalDurationSeconds}
                    onChange={(e) => setTotalDurationSeconds(e.target.value)}
                    placeholder="可选"
                    min={0}
                  />
                </div>
              )}

              {applyTo === 'voice-scripts' && (
                <div className="form-row-group">
                  <div className="form-row">
                    <label>语速</label>
                    <select
                      value={speechRate}
                      onChange={(e) => setSpeechRate(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {SPEECH_RATE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>节奏</label>
                    <select
                      value={voiceScriptRhythm}
                      onChange={(e) => setVoiceScriptRhythm(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {VOICE_SCRIPT_RHYTHM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {applyTo === 'storyboard-scripts' && (
                <div className="form-row">
                  <label>节奏</label>
                  <select
                    value={rhythm}
                    onChange={(e) => setRhythm(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {RHYTHM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
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
        title={viewerTask ? getTaskTitle(viewerTask) : '大纲内容'}
        content={viewerContent}
        task={viewerTask}
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
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .outline-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border);
        }
        .outline-filters {
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid var(--color-border);
        }
        .outline-filter-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
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
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
        }
        .outline-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: var(--color-text);
        }
        .outline-list-scroll .muted {
          font-size: 0.875rem;
          color: var(--color-text-muted);
          margin: 0;
        }
        .outline-task-list { list-style: none; margin: 0; padding: 0; }
        .outline-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }
        .outline-task-item-clickable {
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .outline-task-item-clickable:hover {
          background: var(--color-surface-light);
          border-color: var(--color-border-light);
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
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .outline-task-actions { flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; }
        .outline-task-status { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
        .outline-task-delete {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--color-error);
          background: transparent;
          color: var(--color-error);
          cursor: pointer;
        }
        .outline-task-delete:hover:not(:disabled) { background: var(--color-error); color: white; }
        .outline-task-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .outline-task-status--completed { background: var(--color-success); color: white; }
        .outline-task-status--failed,
        .outline-task-status--cancelled { background: var(--color-error); color: white; }
        .outline-task-status--processing,
        .outline-task-status--pending,
        .outline-task-status--queued { background: var(--color-primary); color: white; }
        .outline-task-meta {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: var(--color-text-muted);
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .outline-task-subtype {
          background: var(--color-primary-light);
          color: var(--color-primary);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .outline-task-id { font-family: ui-monospace, monospace; background: var(--color-surface-light); padding: 0.15rem 0.4rem; border-radius: 4px; }
        .outline-task-progress { color: var(--color-primary); }
        .outline-task-error { color: var(--color-error); max-width: 100%; }
        .outline-form .form-row { margin-bottom: 1rem; }
        .outline-form .form-row label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: var(--color-text-muted); }
        .outline-form .form-row input,
        .outline-form .form-row select,
        .outline-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-surface-light);
          color: var(--color-text);
          font-size: 0.875rem;
        }
        .outline-form .form-row textarea {
          font-family: inherit;
          resize: vertical;
        }
        .outline-form .form-row input:focus,
        .outline-form .form-row select:focus,
        .outline-form .form-row textarea:focus {
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
        .outline-form button[type="submit"] {
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
        .outline-form button[type="submit"]:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }
        .outline-form button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
