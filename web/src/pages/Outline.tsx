import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { notification } from 'antd';
import {
  createOutline,
  listWritingTasks,
  listOutlineTasks,
  getTask,
  deleteTask,
  type WritingTaskItem,
  type WritingTaskListResponse,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { OutlineViewerModal } from '../components/OutlineViewerModal';
import type { OutlineNode, CharacterProfile } from '../components/OutlineViewerModal';
import {
  useTaskV2FormConfig,
  formatTaskSelectionKey,
  parseTaskSelectionKey,
  TaskV2SchemaForm,
} from '../task-v2';

const STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const DrawerOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.7);
  backdrop-filter: blur(4px);
  z-index: 40;
  animation: outline-drawer-fade-in 0.2s ease-out;
  @keyframes outline-drawer-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const DrawerPanel = styled.div`
  position: fixed;
  inset: 0;
  left: auto;
  width: 100%;
  max-width: 440px;
  min-width: 300px;
  box-sizing: border-box;
  background: linear-gradient(180deg, hsl(222 47% 11%) 0%, hsl(222 47% 9%) 100%);
  border-left: 1px solid rgba(71, 85, 105, 0.4);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.35);
  z-index: 41;
  display: flex;
  flex-direction: column;
  animation: outline-drawer-slide 0.25s ease-out;
  @keyframes outline-drawer-slide {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
`;

const DrawerHeader = styled.div`
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(71, 85, 105, 0.35);
  flex-shrink: 0;
`;

const DrawerTitle = styled.h3`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: rgba(248, 250, 252, 0.95);
`;

const DrawerBody = styled.div`
  flex: 1;
  padding: 1.5rem 1.5rem 2rem;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
`;

/* 表单：成熟 UI，全部用 styled 保证样式生效 */
const OutlineForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
`;

const FormLabelOptional = styled.label`
  font-size: 0.8125rem;
  font-weight: 500;
  color: #94a3b8;
  letter-spacing: 0.01em;
`;

const formControlBase = `
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  line-height: 1.4;
  color: #f1f5f9;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  &::placeholder {
    color: #64748b;
  }
  &:focus {
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FormSelect = styled.select`
  ${formControlBase}
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M2 4 L6 8 L10 4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2rem;
`;

const FormPrimaryButton = styled.button`
  width: 100%;
  height: 2.75rem;
  margin-top: 0.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: #0f172a;
  background: #10b981;
  border: none;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
  cursor: pointer;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.1s ease;
  &:hover:not(:disabled) {
    background: #34d399;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
  }
  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4);
  }
  &:active:not(:disabled) {
    transform: scale(0.99);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

function tryParseOutlineFromText(text: string): OutlineNode | OutlineNode[] | null {
  if (!text) return null;
  let cleaned = text.trim();
  // 去掉可能的 markdown 代码块包裹
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*/i, '').replace(/\s*```$/i, '');
  }
  // 尝试截取第一个 JSON 对象或数组
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start < 0) return null;
  const candidate = cleaned.slice(start);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed)) return parsed as OutlineNode[];
    if (parsed && typeof parsed === 'object') return parsed as OutlineNode;
    return null;
  } catch {
    return null;
  }
}

export default function Outline() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  // 创建大纲抽屉默认关闭，用户点击「新建大纲」才打开
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

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

  const {
    taskKey,
    setTaskKey,
    subtype,
    setSubtype,
    clearPendingForm,
    taskOptions,
    formConfig,
    formValues,
    setFormValues,
    resetFormValues,
    configLoading,
    listLoading,
  } = useTaskV2FormConfig({
    scope: 'outline',
    enabled: isLoggedIn,
    buildDefaultsOptions: { fallbackUid: () => `outline_${Date.now()}` },
  });

  // 仅首次进入页面时展示整体 loading，后续轮询静默更新，避免列表反复“闪一下”
  const hasInitialLoadedRef = useRef(false);

  const loadOutlineTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    if (!hasInitialLoadedRef.current) {
      setLoadingTasks(true);
    }
    try {
      const [writingRes, outlineRes] = await Promise.all([
        listWritingTasks({ limit: 100, offset: 0 }),
        listOutlineTasks({ limit: 100, offset: 0 }),
      ]);
      const writingBody = writingRes.data as WritingTaskListResponse | undefined;
      const outlineBody = outlineRes.data as WritingTaskListResponse | undefined;
      const list = [...(writingBody?.data?.tasks ?? []), ...(outlineBody?.data?.tasks ?? [])];

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
      hasInitialLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [isLoggedIn]);

  // 大纲结构类型不做过滤，用户可选任意结构类型

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
    const promptVal = String(formValues.prompt ?? '').trim();
    if (!promptVal) {
      notification.warning({ message: '请输入提示词', placement: 'top' });
      return;
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = { ...formValues, outputFormat: 'json' };
      body.prompt = promptVal;
      const uidRaw = String(body.uid ?? '').trim();
      body.uid = uidRaw || `outline_${Date.now()}`;
      const labelRaw = body.label;
      if (typeof labelRaw === 'string' && labelRaw.trim()) {
        body.metadata = { label: labelRaw.trim() };
      }
      delete body.label;

      const result = await createOutline(body, { scope: 'outline', taskKey, subtype });
      const bodyRes = (result.data as Record<string, unknown>) ?? {};
      if (result.error || bodyRes.error) {
        const msg = (bodyRes.error as string) || result.error || '请稍后重试';
        const isNetworkError =
          result.status === 0 ||
          /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg);
        notification.error({
          message: '提交失败',
          description: isNetworkError
            ? `${msg}。请确认 Gateway 与 mxmcgi 已启动（如 pnpm run dev:all）。`
            : msg,
          placement: 'top',
        });
        return;
      }
      const taskId = (bodyRes.taskId as string | undefined) ?? undefined;
      if (taskId) {
        notification.success({
          message: '任务已创建',
          description: `${taskId}\n可在下方任务列表中查看进度。`,
          placement: 'top',
        });
        resetFormValues();
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
      let outline = (metadata?.outline ?? null) as OutlineNode | OutlineNode[] | null;
      const characters = (metadata?.characters as CharacterProfile[] | undefined) ?? [];

      // v2 任务：若 metadata.outline 不存在，但 metadata.text 中包含 JSON，大纲从 text 解析
      if (!outline && typeof metadata?.text === 'string' && metadata.text.trim()) {
        const parsed = tryParseOutlineFromText(metadata.text);
        if (parsed) {
          outline = parsed;
        }
      }
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
      ((params?.metadata as Record<string, unknown> | undefined)?.label as string | undefined);
    const promptVal = (params?.prompt as string) || '';
    return (
      labelVal?.trim() ||
      (promptVal?.trim().length
        ? `大纲：${promptVal.slice(0, 36).replace(/\n/g, ' ').trim()}`
        : '写作大纲')
    );
  };

  const renderForm = () => (
    <OutlineForm onSubmit={handleSubmit}>
      {taskOptions.length > 0 ? (
        <FormField>
          <FormLabelOptional>类别 / 细分</FormLabelOptional>
          <FormSelect
            value={formatTaskSelectionKey(taskKey, subtype)}
            onChange={(e) => {
              const { taskKey: k, subtype: st } = parseTaskSelectionKey(e.target.value || '');
              setTaskKey(k);
              setSubtype(st);
              clearPendingForm();
            }}
          >
            {taskOptions.map((it) => {
              const key = `${it.taskKey}::${it.subtype ?? ''}`;
              const label = (() => {
                const tk = (it.taskLabel ?? '').trim() || it.taskKey;
                if (!it.subtype) return tk;
                const st = (it.subtypeLabel ?? '').trim() || it.subtype;
                return `${tk} / ${st}`;
              })();
              return (
                <option key={key} value={key}>
                  {label}
                </option>
              );
            })}
          </FormSelect>
        </FormField>
      ) : null}

      <TaskV2SchemaForm
        formConfig={formConfig}
        formValues={formValues}
        onChange={setFormValues}
        loading={configLoading || listLoading}
        surface="panel"
      />

      <FormPrimaryButton type="submit" disabled={loading || !formConfig?.schema}>
        {loading ? '生成中…' : '生成大纲'}
      </FormPrimaryButton>
    </OutlineForm>
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

      {formOpen &&
        createPortal(
          <>
            <DrawerOverlay onClick={() => setFormOpen(false)} />
            <DrawerPanel>
              <DrawerHeader>
                <DrawerTitle>新建大纲任务</DrawerTitle>
                <button
                  type="button"
                  aria-label="关闭"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors"
                  onClick={() => setFormOpen(false)}
                >
                  ×
                </button>
              </DrawerHeader>
              <DrawerBody>{renderForm()}</DrawerBody>
            </DrawerPanel>
          </>,
          document.body
        )}
    </section>
  );
}
