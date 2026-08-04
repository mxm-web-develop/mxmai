import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Drawer,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import {
  getTask,
  getTaskFormConfig,
  getAdminTasks,
  deleteTask,
  runTaskV2,
  fetchMediaBlobUrl,
  fetchWritingMediaContent,
  type TaskFormConfig,
  type TaskFormConfigListItem,
  type TaskRunV2ResponseBody,
  type WritingTaskItem,
  type AdminTaskItem,
} from '../api/client';
import {
  extractCgiTaskFromApiResponse,
  extractFullCgiTaskFromApiResponse,
} from '../notifications/task-snapshot';
import {
  DocumentReaderShell,
  MarkdownReader,
  PdfJsReader,
} from './document-reader';
import { waitForCgiTask } from '../hooks/useWaitForCgiTask';
import { TaskV2SchemaForm } from '../task-v2/TaskV2SchemaForm';
import { buildDefaultsFromSchema } from '../task-v2/buildDefaultsFromSchema';
import { prepareTaskV2SubmitParams } from '../task-v2/prepareSubmitParams';
import { formatTaskSelectionKey } from '../task-v2';
import type { SchemaFormValue } from './SchemaForm';
import { ManualReviewModal } from './ManualReviewModal';
import {
  WritingCreateWizard,
  type CreateGuideStepIoEvent,
} from './WritingCreateWizard';
import { CollapsibleJsonView } from './CollapsibleJsonView';
import { slimTraceIoForDisplay } from './adminBizDebugTraceSlim';
import {
  loadDebugHistory,
  saveDebugHistorySession,
  removeDebugHistorySession,
  type DebugHistorySession,
} from './adminDebugHistory';
import type { TaskBillingState } from './billing/TaskBillingBar';
import { indicatesWarpGatesCreate, shouldUseWritingWarpGuidedCreate } from './writingCreateUx';
import './AdminBusinessDebugMonitor.css';

/** 从 request() 返回的 data 中解析 Task v2 运行结果 */
export function parseTaskRunV2Payload(raw: unknown): TaskRunV2ResponseBody {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const inner = (r.data && typeof r.data === 'object' ? r.data : r) as Record<string, unknown>;
  return {
    success: inner.success !== false && r.success !== false,
    taskId: (inner.taskId as string) ?? (r.taskId as string | undefined),
    status: (inner.status as string) ?? (r.status as string | undefined),
    scope: (inner.scope as string) ?? (r.scope as string | undefined),
    taskKey: (inner.taskKey as string) ?? (r.taskKey as string | undefined),
    subtype: (inner.subtype as string | null) ?? (r.subtype as string | null) ?? null,
    syncResult: (inner.syncResult as TaskRunV2ResponseBody['syncResult']) ?? (r.syncResult as TaskRunV2ResponseBody['syncResult']),
    error: (inner.error as string) ?? (r.error as string | undefined),
  };
}

function extractCgiTask(raw: unknown): Record<string, unknown> | null {
  const full = extractFullCgiTaskFromApiResponse(raw);
  if (full) return full as unknown as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const inner = (body.data ?? body) as Record<string, unknown>;
  const task = (inner.task ?? inner) as Record<string, unknown>;
  if (task && typeof task === 'object' && 'status' in task) return task;
  return null;
}

type FlowStep = 'idle' | 'submitting' | 'polling' | 'review' | 'done' | 'error';

type PipelineTraceRow = {
  step: string;
  durationMs?: number;
  phase?: string;
  skipped?: boolean;
  ok?: boolean;
  error?: string;
  label?: string;
  nestedTaskId?: string;
  costUsd?: number;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  budget?: {
    completion_tokens?: number;
    finish_reason?: string | null;
    had_reasoning?: boolean;
    truncated?: boolean;
    continued?: boolean;
    thinking_disabled_retry?: boolean;
  };
};

type TimelineNode = {
  key: string;
  phase?: string;
  step: string;
  label?: string;
  status?: 'running' | 'done' | 'error' | 'skipped';
  durationMs?: number;
  nestedTaskId?: string;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  error?: string;
  budget?: PipelineTraceRow['budget'];
};

function extractErrorFromUnknown(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  if (typeof o.message === 'string' && o.message.trim()) {
    const m = o.message.trim();
    if (/失败|error|涉敏|1026|exception|reject/i.test(m)) return m;
  }
  return null;
}

function extractErrorFromTraceRows(rows: PipelineTraceRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (typeof r.error === 'string' && r.error.trim()) return r.error.trim();
    if (r.ok === false) {
      return extractErrorFromUnknown(r.outputSnapshot) || '步骤执行失败';
    }
    const fromOut = extractErrorFromUnknown(r.outputSnapshot);
    if (fromOut) return fromOut;
  }
  return null;
}

function guideEventToNode(ev: CreateGuideStepIoEvent): TimelineNode {
  return {
    key: ev.id,
    phase: ev.phase,
    step: ev.step,
    label: ev.label,
    status: ev.status,
    durationMs: ev.durationMs,
    inputSnapshot: ev.inputSnapshot,
    outputSnapshot: ev.outputSnapshot,
    error: ev.error,
  };
}

function pipelineRowToNode(row: PipelineTraceRow, index: number): TimelineNode {
  const fromOut = extractErrorFromUnknown(row.outputSnapshot);
  const failed =
    row.ok === false ||
    (typeof row.error === 'string' && row.error.trim().length > 0) ||
    !!fromOut;
  const errText = (typeof row.error === 'string' && row.error.trim()) || fromOut || undefined;
  return {
    key: `pipeline:${index}:${row.step}`,
    phase: row.phase,
    step: row.step,
    label: row.label,
    status: row.skipped ? 'skipped' : failed ? 'error' : 'done',
    durationMs: row.durationMs,
    nestedTaskId: row.nestedTaskId,
    inputSnapshot: row.inputSnapshot,
    outputSnapshot: row.outputSnapshot,
    budget: row.budget,
    error: failed ? errText || '步骤执行失败' : undefined,
  };
}

function extractTaskErrorMessage(tsk: Record<string, unknown> | WritingTaskItem | null): string | null {
  if (!tsk) return null;
  const progress = (tsk as WritingTaskItem).progress;
  if (typeof progress?.error === 'string' && progress.error.trim()) return progress.error.trim();
  const meta = (tsk as WritingTaskItem).metadata as Record<string, unknown> | undefined;
  if (typeof meta?.error === 'string' && meta.error.trim()) return meta.error.trim();
  const resultMeta = (tsk as WritingTaskItem).result?.metadata;
  if (resultMeta && typeof resultMeta.error === 'string' && resultMeta.error.trim()) {
    return resultMeta.error.trim();
  }
  const status = String((tsk as WritingTaskItem).status || '');
  if (status === 'failed' || status === 'cancelled' || status === 'network_error') {
    return `任务状态：${status}`;
  }
  return null;
}

function buildFailureRuntimeNode(
  tsk: Record<string, unknown> | WritingTaskItem | null,
  fallback?: string
): TimelineNode | null {
  const msg = extractTaskErrorMessage(tsk) || (fallback?.trim() ? fallback.trim() : null);
  if (!msg) return null;
  const id = (tsk as WritingTaskItem | null)?.id;
  const status = (tsk as WritingTaskItem | null)?.status;
  const progress = (tsk as WritingTaskItem | null)?.progress;
  return {
    key: `runtime-error:task:${id || 'unknown'}`,
    phase: 'runtime',
    step: 'error',
    label: '执行失败',
    status: 'error',
    error: msg,
    inputSnapshot: {
      taskId: id,
      status,
      phase: progress?.phase,
      message: progress?.message,
    },
    outputSnapshot: { error: msg },
  };
}

function timelineHasErrorNode(nodes: TimelineNode[]): boolean {
  return nodes.some((n) => n.status === 'error' || (typeof n.error === 'string' && n.error.trim().length > 0));
}

function extractPipelineTrace(raw: unknown): PipelineTraceRow[] {
  if (!raw || typeof raw !== 'object') return [];
  const meta = raw as Record<string, unknown>;
  const fromMeta = meta.pipelineTrace;
  if (Array.isArray(fromMeta)) return fromMeta as PipelineTraceRow[];
  const bps = meta.businessPipelineState as Record<string, unknown> | undefined;
  if (bps && Array.isArray(bps.pipelineTrace)) return bps.pipelineTrace as PipelineTraceRow[];
  return [];
}

function formatTraceJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function TraceIoBody({
  value,
  emptyLabel,
  step,
  side,
}: {
  value: unknown;
  emptyLabel: string;
  step?: string;
  /** 输入/输出必须分开精简，否则输出会被当成「本步用」 */
  side: 'input' | 'output';
}) {
  if (value == null) {
    return <pre className="admin-biz-debug-raw">{emptyLabel}</pre>;
  }
  const display = step ? slimTraceIoForDisplay(step, value, side) : value;
  if (typeof display === 'object') {
    return <CollapsibleJsonView value={display} />;
  }
  return <pre className="admin-biz-debug-raw">{formatTraceJson(display)}</pre>;
}

function pullTraceFromTask(tsk: Record<string, unknown> | WritingTaskItem | null): PipelineTraceRow[] {
  if (!tsk) return [];
  const resultMeta = (tsk.result as { metadata?: Record<string, unknown> } | undefined)?.metadata;
  const rp = tsk.requestParams as Record<string, unknown> | undefined;
  const bps = rp?.businessPipelineState as Record<string, unknown> | undefined;
  const innerBps = (rp?.params as { businessPipelineState?: Record<string, unknown> } | undefined)
    ?.businessPipelineState;
  const metaBps = (tsk.metadata as { businessPipelineState?: Record<string, unknown> } | undefined)
    ?.businessPipelineState;
  const fromResult = extractPipelineTrace(resultMeta);
  if (fromResult.length) return fromResult;
  if (Array.isArray(bps?.pipelineTrace)) return bps.pipelineTrace as PipelineTraceRow[];
  if (Array.isArray(innerBps?.pipelineTrace)) return innerBps.pipelineTrace as PipelineTraceRow[];
  if (Array.isArray(metaBps?.pipelineTrace)) return metaBps.pipelineTrace as PipelineTraceRow[];
  return [];
}

async function refreshPipelineTraceFromTask(taskId: string): Promise<{
  rows: PipelineTraceRow[];
  status?: string;
  progress?: number | null;
  message?: string;
  item: WritingTaskItem | null;
}> {
  const g = await getTask(taskId);
  const full = extractFullCgiTaskFromApiResponse(g.data);
  const tsk = (full as unknown as Record<string, unknown> | null) ?? extractCgiTask(g.data);
  const rows = pullTraceFromTask(tsk);
  return {
    rows,
    status: full?.status,
    progress:
      typeof full?.progress?.progress === 'number' ? full.progress.progress : null,
    message: full?.progress?.message,
    item: full,
  };
}

/** 与业务列表行一致的最小字段 */
export type AdminBusinessTestRow = {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
};

function toWritingTaskItem(raw: WritingTaskItem | Record<string, unknown> | null): WritingTaskItem | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof (raw as WritingTaskItem).id === 'string' && typeof (raw as WritingTaskItem).status === 'string') {
    return raw as WritingTaskItem;
  }
  return extractCgiTaskFromApiResponse(raw) as WritingTaskItem | null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  row: AdminBusinessTestRow | null;
};

const DEFAULT_TEST_PROMPT = '【Admin 测试】请用一两句话确认本业务链路可用。';

function isInlineImagePreviewUrl(url: string): boolean {
  const u = url.trim();
  if (/^data:image\//i.test(u)) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  const path = u.split('?')[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\b|$)/i.test(path);
}

function truncateForDisplay(s: string, max = 180): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** 从 pipelineTrace 末尾挖终稿（历史回看媒体不可用时） */
function extractManuscriptFromPipelineTrace(rows: PipelineTraceRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const out = rows[i]?.outputSnapshot;
    if (!out || typeof out !== 'object' || Array.isArray(out)) continue;
    const o = out as Record<string, unknown>;
    const fa = o.finalArtifact as { text?: unknown } | undefined;
    const ca = o.coreArtifact as { text?: unknown } | undefined;
    const nested = o.nestedIo as { text?: unknown; outText?: unknown } | undefined;
    for (const c of [fa?.text, ca?.text, nested?.text, o.text]) {
      if (typeof c === 'string' && c.trim() && !c.trim().startsWith('{')) {
        return c.trim();
      }
    }
    // nested outText 有时是成稿 md
    if (typeof nested?.outText === 'string' && nested.outText.trim()) {
      const t = nested.outText.trim();
      if (!t.startsWith('{') && (t.includes('#') || t.includes('\n\n'))) return t;
    }
  }
  return null;
}

/** 从任务快照多路径取终稿正文（与 media 落盘同源字段） */
function extractManuscriptFromTaskPayload(tsk: Record<string, unknown> | null): string | null {
  if (!tsk) return null;
  const result = tsk.result as Record<string, unknown> | undefined;
  const meta = (result?.metadata ?? tsk.metadata) as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    meta?.text,
    meta?.formattedContent,
    result?.text,
    (tsk as { text?: unknown }).text,
  ];
  const rp = tsk.requestParams as Record<string, unknown> | undefined;
  const bps = (rp?.businessPipelineState ??
    (rp?.params as { businessPipelineState?: unknown } | undefined)?.businessPipelineState) as
    | Record<string, unknown>
    | undefined;
  if (bps) {
    const fa = bps.finalArtifact as { text?: unknown } | undefined;
    const ca = bps.coreArtifact as { text?: unknown } | undefined;
    candidates.push(fa?.text, ca?.text, bps.groupAssembledText);
  }
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const t = c.trim();
    // 跳过明显是专家 JSON / 合同中间产物
    if (t.startsWith('{') && (t.includes('"evidence_refs"') || t.includes('"analysis_beats"'))) {
      continue;
    }
    if (t.startsWith('{') && t.includes('"basic"') && t.includes('"business"')) {
      continue;
    }
    return t;
  }
  return null;
}

function isAdminDebugTaskItem(t: AdminTaskItem): boolean {
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  if (meta.adminPipelineDebug === true || meta.hideFromUserList === true) return true;
  const rp = (t.requestParams ?? {}) as Record<string, unknown>;
  if (rp.__adminPipelineDebug === true || rp.adminPipelineDebug === true) return true;
  const inner = rp.params as Record<string, unknown> | undefined;
  if (inner?.__adminPipelineDebug === true) return true;
  const label = typeof meta.label === 'string' ? meta.label : '';
  if (label.includes('【Admin 调试】') || label.includes('Admin 调试')) return true;
  return false;
}

function wizardScopeOf(
  scope: string
): 'writing' | 'audio' | 'graph' | 'video' | 'music' | null {
  if (scope === 'writing' || scope === 'audio' || scope === 'graph' || scope === 'video' || scope === 'music') {
    return scope;
  }
  return null;
}

/** 与 C 端一致：用 WritingCreateWizard 的业务 */
function shouldEmbedCreateWizard(scope: string, cfg: TaskFormConfig | null): boolean {
  const ws = wizardScopeOf(scope);
  if (!ws) return false;
  if (ws === 'writing' || ws === 'audio') return true;
  return (
    indicatesWarpGatesCreate({
      createUx: cfg?.createUx,
      schema: cfg?.schema,
      createGuide: cfg?.createGuide,
    }) ||
    shouldUseWritingWarpGuidedCreate({
      createUx: cfg?.createUx,
      schema: cfg?.schema,
      createGuide: cfg?.createGuide,
    })
  );
}

export function AdminBusinessTestModal({ open, onClose, row }: Props) {
  const { message } = App.useApp();
  const [formConfig, setFormConfig] = useState<TaskFormConfig | null>(null);
  const [formValues, setFormValues] = useState<SchemaFormValue>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<number | null>(null);
  const [pollStatus, setPollStatus] = useState<string>('');
  const [syncText, setSyncText] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  /** writing：与用户侧 WritingViewer 同源（PDF Range URL） */
  const [writingPdfUrl, setWritingPdfUrl] = useState<string | null>(null);
  const [writingPdfHeaders, setWritingPdfHeaders] = useState<Record<string, string> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
  const [inlineImageUrls, setInlineImageUrls] = useState<string[]>([]);
  const [pipelineTrace, setPipelineTrace] = useState<PipelineTraceRow[]>([]);
  const [guideIo, setGuideIo] = useState<CreateGuideStepIoEvent[]>([]);
  /** 任务生命周期报错等：只上右侧时间轴 */
  const [runtimeIo, setRuntimeIo] = useState<TimelineNode[]>([]);
  const [reviewTask, setReviewTask] = useState<WritingTaskItem | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [taskLabel, setTaskLabel] = useState('【Admin 调试】');
  const [billing, setBilling] = useState<TaskBillingState>({
    canSubmit: true,
    blockReason: null,
    estimate: null,
    loading: false,
  });
  const reviewWaitRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const pollAbortRef = useRef(0);
  /** 点击生成 / 进入管线后的监听起点（毫秒） */
  const [watchStartedAt, setWatchStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  /** 强制 remount 向导（完成后重新调试） */
  const [wizardEpoch, setWizardEpoch] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localHistory, setLocalHistory] = useState<DebugHistorySession[]>([]);
  const [serverHistory, setServerHistory] = useState<
    Array<{
      id: string;
      status: string;
      createdAt?: string;
      label?: string;
      isDebug: boolean;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<DebugHistorySession | null>(null);
  const lastSavedTaskIdRef = useRef<string | null>(null);

  const scope = row?.scope ?? '';
  const embedWizard = shouldEmbedCreateWizard(scope, formConfig);
  const isSyncText = scope === 'text';
  const wizardScope = wizardScopeOf(scope) ?? 'writing';

  const selectedValue = useMemo(
    () => (row ? formatTaskSelectionKey(row.type, row.subtype) : ''),
    [row]
  );

  const taskOptions = useMemo((): TaskFormConfigListItem[] => {
    if (!row) return [];
    return [
      {
        taskKey: row.type,
        subtype: row.subtype,
        taskLabel: formConfig?.taskLabel ?? row.type,
        subtypeLabel: formConfig?.subtypeLabel ?? row.subtype,
        description: 'Admin 调试（与线上同一创建引导）',
      },
    ];
  }, [row, formConfig?.taskLabel, formConfig?.subtypeLabel]);

  const selectOptions = useMemo(
    () => [{ label: selectedValue, value: selectedValue }],
    [selectedValue]
  );

  const scopeHint = useMemo(() => {
    if (embedWizard) {
      return '左侧：输入与人工审核。右侧时间轴追踪全流程 raw I/O（含报错）。';
    }
    return '左侧填参；运行后右侧时间轴追踪逐步 raw I/O（含报错）。';
  }, [embedWizard]);

  const leftStatusText = useMemo(() => {
    if (configLoading) return '加载表单配置…';
    if (flowStep === 'submitting') return '正在提交任务…';
    if (flowStep === 'polling') {
      return pollStatus || (running ? '管线执行中…' : '等待任务状态…');
    }
    if (flowStep === 'review') return '等待人工审核确认';
    if (flowStep === 'done') return '任务已完成';
    if (flowStep === 'error') return '执行失败（详情见右侧时间轴）';
    if (embedWizard) return '引导填写中';
    return '填写参数后运行';
  }, [configLoading, flowStep, pollStatus, running, embedWizard]);

  /** 管线进行中：左侧只监听，禁止继续点生成/改参 */
  const leftPipelineWatching = flowStep === 'submitting' || flowStep === 'polling';
  /** 可编辑引导：仅 idle（未开跑） */
  const leftGuideEditable = flowStep === 'idle';

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };

  useEffect(() => {
    if (watchStartedAt == null) return;
    if (!(flowStep === 'submitting' || flowStep === 'polling' || flowStep === 'review')) {
      return;
    }
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - watchStartedAt) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [flowStep, watchStartedAt]);

  /** 终态：冻结总用时并停止计时依赖 */
  const freezeElapsed = useCallback(() => {
    setWatchStartedAt((started) => {
      if (started != null) {
        setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
      }
      return started;
    });
  }, []);

  const beginPipelineWatch = useCallback(() => {
    setWatchStartedAt(Date.now());
    setElapsedSec(0);
  }, []);

  const timelineNodes = useMemo((): TimelineNode[] => {
    if (viewingHistory) {
      const nodes = [
        ...viewingHistory.guideIo.map(guideEventToNode),
        ...viewingHistory.pipelineTrace.map((r, i) => pipelineRowToNode(r, i)),
        ...viewingHistory.runtimeIo,
      ];
      const savedErr = viewingHistory.errorMessage?.trim();
      const fromTrace = extractErrorFromTraceRows(viewingHistory.pipelineTrace);
      const resolvedErr =
        savedErr ||
        fromTrace ||
        nodes.find((n) => n.status === 'error' && n.error)?.error ||
        null;
      // 失败跑次：保证时间轴上有一条标红失败节点，且带具体原文
      if (viewingHistory.status === 'error' || resolvedErr) {
        if (!timelineHasErrorNode(nodes)) {
          nodes.push({
            key: `runtime-error:history:${viewingHistory.id}`,
            phase: 'runtime',
            step: 'error',
            label: '执行失败',
            status: 'error',
            error:
              resolvedErr ||
              '任务已失败，但当时未保存具体报错原文（可重新跑一轮调试查看完整失败步）',
            inputSnapshot: {
              taskId: viewingHistory.taskId,
              savedAt: viewingHistory.savedAt,
            },
            outputSnapshot: {
              error:
                resolvedErr ||
                '任务已失败，但当时未保存具体报错原文',
            },
          });
        } else if (savedErr && !nodes.some((n) => n.error === savedErr)) {
          // 有步骤失败节点，但仍把会话级原文挂到顶部失败摘要节点
          nodes.push({
            key: `runtime-error:history-summary:${viewingHistory.id}`,
            phase: 'runtime',
            step: 'error',
            label: '失败摘要',
            status: 'error',
            error: savedErr,
            outputSnapshot: { error: savedErr },
          });
        }
      }
      return nodes;
    }
    const nodes = [
      ...guideIo.map(guideEventToNode),
      ...pipelineTrace.map((row, i) => pipelineRowToNode(row, i)),
      ...runtimeIo,
    ];
    if (
      (flowStep === 'polling' || flowStep === 'review') &&
      pollStatus &&
      !pollStatus.startsWith('awaiting_review')
    ) {
      nodes.push({
        key: 'pipeline:live',
        phase: 'pipeline',
        step: 'running',
        label: pollStatus.includes('·') ? pollStatus.split('·').slice(1).join('·').trim() : pollStatus,
        status: 'running',
        inputSnapshot: { taskId, status: pollStatus, progress: pollProgress },
        outputSnapshot: undefined,
      });
    }
    return nodes;
  }, [
    viewingHistory,
    guideIo,
    pipelineTrace,
    runtimeIo,
    flowStep,
    pollStatus,
    pollProgress,
    taskId,
  ]);

  const timelineErrorSummary = useMemo(() => {
    if (viewingHistory?.errorMessage?.trim()) return viewingHistory.errorMessage.trim();
    const fromNodes = timelineNodes.find((n) => n.status === 'error' && n.error?.trim())?.error;
    if (fromNodes?.trim()) return fromNodes.trim();
    if (viewingHistory?.status === 'error') {
      return extractErrorFromTraceRows(viewingHistory.pipelineTrace);
    }
    if (flowStep === 'error') {
      return runtimeIo.find((n) => n.status === 'error' && n.error)?.error ?? null;
    }
    return extractErrorFromTraceRows(pipelineTrace);
  }, [viewingHistory, timelineNodes, flowStep, runtimeIo, pipelineTrace]);

  const upsertGuideIo = useCallback((ev: CreateGuideStepIoEvent) => {
    setGuideIo((prev) => {
      const idx = prev.findIndex((x) => x.id === ev.id);
      if (idx < 0) return [...prev, ev];
      const next = prev.slice();
      next[idx] = ev;
      return next;
    });
  }, []);

  const pushRuntimeError = useCallback((messageText: string, detail?: unknown) => {
    setRuntimeIo((prev) => [
      ...prev,
      {
        key: `runtime-error:${Date.now()}`,
        phase: 'runtime',
        step: 'error',
        label: '执行失败',
        status: 'error',
        error: messageText,
        inputSnapshot: detail ?? { taskId },
        outputSnapshot: { error: messageText },
      },
    ]);
  }, [taskId]);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current);
      } catch {
        // ignore
      }
      blobUrlRef.current = null;
    }
    setMediaBlobUrl(null);
    setWritingPdfUrl(null);
    setWritingPdfHeaders(null);
  }, []);

  const resetRuntime = useCallback(() => {
    setRunning(false);
    setFlowStep('idle');
    setTaskId(null);
    setPollProgress(null);
    setPollStatus('');
    setSyncText(null);
    setTextPreview(null);
    setInlineImageUrls([]);
    setPipelineTrace([]);
    setGuideIo([]);
    setRuntimeIo([]);
    setWatchStartedAt(null);
    setElapsedSec(0);
    setReviewTask(null);
    setReviewOpen(false);
    setViewingHistory(null);
    lastSavedTaskIdRef.current = null;
    if (reviewWaitRef.current) {
      reviewWaitRef.current.reject(new Error('测试已关闭'));
      reviewWaitRef.current = null;
    }
    revokeBlob();
  }, [revokeBlob]);

  useEffect(() => {
    if (!open) {
      setFormConfig(null);
      setFormValues({});
      setTaskLabel('【Admin 调试】');
      setBilling({ canSubmit: true, blockReason: null, estimate: null, loading: false });
      pollAbortRef.current += 1;
      resetRuntime();
      return;
    }
    if (!row) return;

    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      try {
        const res = await getTaskFormConfig({
          scope: row.scope,
          taskKey: row.type,
          subtype: row.subtype ?? undefined,
        });
        if (cancelled) return;
        if (res.error) {
          setFormConfig(null);
          setFlowStep('error');
          setRuntimeIo([
            {
              key: `runtime-error:config:${Date.now()}`,
              phase: 'runtime',
              step: 'loadConfig',
              label: '加载配置失败',
              status: 'error',
              error: res.error,
              outputSnapshot: { error: res.error },
            },
          ]);
          return;
        }
        const raw = res.data as { data?: TaskFormConfig; success?: boolean } | undefined;
        const cfg = raw?.data ?? (res.data as unknown as TaskFormConfig);
        if (cfg?.schema) {
          setFormConfig(cfg);
          setFormValues(buildDefaultsFromSchema(cfg.schema, { fallbackUid: () => `test_${Date.now()}` }));
        } else {
          setFormConfig(null);
          setFlowStep('error');
          setRuntimeIo([
            {
              key: `runtime-error:schema:${Date.now()}`,
              phase: 'runtime',
              step: 'loadConfig',
              label: '加载配置失败',
              status: 'error',
              error: '未返回表单 schema',
              outputSnapshot: { error: '未返回表单 schema' },
            },
          ]);
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, row, resetRuntime]);

  useEffect(() => {
    return () => revokeBlob();
  }, [revokeBlob]);

  const mediaKind = useMemo(() => {
    if (scope === 'graph') return 'graph';
    if (scope === 'audio') return 'audio';
    if (scope === 'music') return 'music';
    if (scope === 'video') return 'video';
    return null;
  }, [scope]);

  /** 与用户侧 Writing 页同源：fetchWritingMediaContent + DocumentReader；失败再挖任务字段 */
  const loadWritingPreview = async (
    id: string,
    opts?: { fallbackTrace?: PipelineTraceRow[] }
  ) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setTextPreview(null);
    setWritingPdfUrl(null);
    setWritingPdfHeaders(null);

    const applyText = (text: string) => {
      setWritingPdfUrl(null);
      setWritingPdfHeaders(null);
      setTextPreview(text);
      setPreviewError(null);
    };

    try {
      // 媒体落盘可能略晚于 status=completed：短重试
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
          const media = await fetchWritingMediaContent(id, { timeoutMs: 45_000 });
          if (media.kind === 'pdf') {
            setWritingPdfUrl(media.sourceUrl);
            setWritingPdfHeaders(media.httpHeaders);
            setTextPreview(null);
            setPreviewError(null);
            return;
          }
          const text = media.text?.trim() ?? '';
          if (text) {
            applyText(text);
            return;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      const g = await getTask(id);
      const task = extractCgiTask(g.data);
      const fromTask = extractManuscriptFromTaskPayload(task);
      if (fromTask) {
        applyText(fromTask);
        return;
      }

      const fromTrace = extractManuscriptFromPipelineTrace(
        opts?.fallbackTrace ?? pullTraceFromTask(task)
      );
      if (fromTrace) {
        applyText(fromTrace);
        return;
      }

      const errMsg =
        lastErr instanceof Error
          ? lastErr.message
          : g.error
            ? String(g.error)
            : '无正文';
      setPreviewError(errMsg);
      setTextPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const waitForReviewApproval = () =>
    new Promise<void>((resolve, reject) => {
      reviewWaitRef.current = { resolve, reject };
    });

  const applyCompletedResult = async (tid: string) => {
    const gTrace = await getTask(tid);
    const tskTrace = extractCgiTask(gTrace.data);
    setPipelineTrace(pullTraceFromTask(tskTrace));

    if (scope === 'writing') {
      await loadWritingPreview(tid);
      return;
    }
    if (mediaKind) {
      try {
        const url = await fetchMediaBlobUrl(tid, mediaKind);
        revokeBlob();
        setInlineImageUrls([]);
        blobUrlRef.current = url;
        setMediaBlobUrl(url);
      } catch (me) {
        const g = await getTask(tid);
        const tsk = extractCgiTask(g.data);
        const urls = ((tsk?.result as { mediaUrls?: string[] } | undefined)?.mediaUrls ?? []).filter(
          (u): u is string => typeof u === 'string' && u.length > 0
        );
        const previewable = urls.filter((u) => {
          const t = u.trim();
          if (/^data:image\//i.test(t)) return true;
          if (scope === 'graph' && /^https?:\/\//i.test(t)) return true;
          return isInlineImagePreviewUrl(u);
        });
        setInlineImageUrls(previewable);
        const tail =
          urls.length && previewable.length < urls.length
            ? `\n另有 ${urls.length - previewable.length} 条 URL 未内联预览：\n${urls
                .filter((u) => !previewable.includes(u))
                .map((u) => truncateForDisplay(u, 220))
                .join('\n')}`
            : '';
        setTextPreview(
          `媒体拉取失败：${me instanceof Error ? me.message : String(me)}` +
            (previewable.length ? `\n\n已从任务结果提取 ${previewable.length} 张可预览图片（见下方）。` : '') +
            tail
        );
      }
      return;
    }
    const g = await getTask(tid);
    const tsk = extractCgiTask(g.data);
    const meta = tsk?.result as { metadata?: Record<string, unknown>; mediaUrls?: string[] } | undefined;
    const urls = Array.isArray(meta?.mediaUrls)
      ? meta.mediaUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : [];
    const previewable = urls.filter((u) => {
      const t = u.trim();
      if (/^data:image\//i.test(t)) return true;
      if (scope === 'graph' && /^https?:\/\//i.test(t)) return true;
      return isInlineImagePreviewUrl(u);
    });
    const txtRaw = meta?.metadata?.text;
    const textPart = typeof txtRaw === 'string' && txtRaw.trim() ? txtRaw.trim() : '';
    if (previewable.length > 0) {
      setInlineImageUrls(previewable);
      setTextPreview(
        textPart
          ? `${textPart}\n\n已生成 ${previewable.length} 张图片（下方预览）。`
          : `已生成 ${previewable.length} 张图片（下方预览）。`
      );
    } else if (textPart) {
      setInlineImageUrls([]);
      setTextPreview(textPart);
    } else if (urls.length > 0) {
      setInlineImageUrls([]);
      setTextPreview(`媒体 URL：\n${urls.map((u) => truncateForDisplay(u, 220)).join('\n')}`);
    } else {
      setInlineImageUrls([]);
      setTextPreview(JSON.stringify(tsk?.result ?? {}, null, 2));
    }
  };

  /** 任务创建后：轮询全量任务（含 requestParams.pipelineTrace），闸门用 ManualReviewModal */
  const followTaskLifecycle = async (tid: string) => {
    const token = ++pollAbortRef.current;
    setTaskId(tid);
    setRunning(true);
    setFlowStep('polling');
    setSyncText(null);
    setTextPreview(null);
    setInlineImageUrls([]);
    // 保留引导期时间轴；管线步由轮询增量覆盖
    setPipelineTrace([]);
    revokeBlob();

    // Admin 调试：等待上限 24h（切片续等），避免长管线被误报超时
    const maxMs = 86_400_000;
    const perWaitMs = 300_000;
    const waitDeadline = Date.now() + maxMs;

    const applyTraceRefresh = async () => {
      if (token !== pollAbortRef.current) return null;
      try {
        const snap = await refreshPipelineTraceFromTask(tid);
        if (token !== pollAbortRef.current) return null;
        if (snap.rows.length) setPipelineTrace(snap.rows);
        if (snap.progress != null) setPollProgress(snap.progress);
        if (snap.status) setPollStatus(snap.message ? `${snap.status} · ${snap.message}` : snap.status);
        return snap;
      } catch {
        return null;
      }
    };

    // 创建后立刻拉一次 + 定时轮询：不依赖 WS 才更新时间轴
    await applyTraceRefresh();
    const pollTimer = window.setInterval(() => {
      void applyTraceRefresh();
    }, 1500);

    try {
      while (Date.now() < waitDeadline) {
        if (token !== pollAbortRef.current) return;
        setFlowStep('polling');
        const sliceMs = Math.min(perWaitMs, Math.max(5_000, waitDeadline - Date.now()));
        const { task: doneTask, timedOut } = await waitForCgiTask(tid, {
          timeoutMs: sliceMs,
          stopOnStatuses: ['awaiting_review'],
          onProgress: (patch, st) => {
            if (token !== pollAbortRef.current) return;
            setPollProgress(typeof patch.progress?.progress === 'number' ? patch.progress.progress : null);
            setPollStatus(patch.progress?.message ? `${st} · ${patch.progress.message}` : st);
            void applyTraceRefresh();
          },
        });
        if (token !== pollAbortRef.current) return;
        if (timedOut || !doneTask) {
          // 单次切片超时：若总预算未尽则继续等（避免日报 6～8 分钟被 4 分钟误杀）
          if (Date.now() < waitDeadline) {
            setPollStatus('仍在执行，继续等待…');
            continue;
          }
          throw new Error('等待任务超时，请稍后在任务列表中查看');
        }
        const st = doneTask.status;
        if (st === 'failed' || st === 'cancelled' || st === 'network_error') {
          throw new Error(doneTask.progress?.error ?? `任务状态：${st}`);
        }
        if (st === 'awaiting_review') {
          const snap = await applyTraceRefresh();
          const item =
            snap?.item ??
            toWritingTaskItem(doneTask) ??
            toWritingTaskItem(extractCgiTaskFromApiResponse((await getTask(tid)).data));
          if (!item) throw new Error('审核闸门任务快照无效');
          setReviewTask(item);
          setReviewOpen(true);
          setFlowStep('review');
          setPollStatus('awaiting_review');
          await waitForReviewApproval();
          if (token !== pollAbortRef.current) return;
          setReviewOpen(false);
          setReviewTask(null);
          await applyTraceRefresh();
          continue;
        }
        if (st !== 'completed') {
          throw new Error(`任务未成功完成：${st}`);
        }
        await applyTraceRefresh();
        freezeElapsed();
        setFlowStep('done');
        setPollStatus('completed');
        // 先切完成态再拉终稿，右侧「生成内容」会立刻出现加载态
        await applyCompletedResult(tid);
        if (token !== pollAbortRef.current) return;
        message.success('调试任务已完成');
        // 延后一拍让 state 落齐再存 —— 用最新 snap 直接存
        {
          const snap = await refreshPipelineTraceFromTask(tid);
          const totalSec = Math.max(
            0,
            Math.floor((Date.now() - (watchStartedAt ?? Date.now())) / 1000)
          );
          if (row) {
            const next = saveDebugHistorySession(row.scope, row.type, row.subtype, {
              id: tid,
              savedAt: new Date().toISOString(),
              taskId: tid,
              status: 'done',
              elapsedSec: totalSec,
              label: taskLabel.trim() || undefined,
              guideIo,
              pipelineTrace: snap?.rows?.length ? snap.rows : pipelineTrace,
              runtimeIo,
            });
            setLocalHistory(next);
            lastSavedTaskIdRef.current = `done:${tid}`;
          }
        }
        return;
      }
      throw new Error('闸门次数过多，已中止测试');
    } catch (e) {
      if (token !== pollAbortRef.current) return;
      const msgText = e instanceof Error ? e.message : String(e);
      freezeElapsed();
      setFlowStep('error');
      pushRuntimeError(msgText, { taskId: tid, phase: 'followTaskLifecycle' });
      if (row) {
        let latestRows = pipelineTrace;
        let failNode = buildFailureRuntimeNode(null, msgText);
        try {
          const snap = await refreshPipelineTraceFromTask(tid);
          if (snap.rows.length) latestRows = snap.rows;
          failNode =
            buildFailureRuntimeNode(snap.item, msgText) ??
            buildFailureRuntimeNode(null, msgText);
        } catch {
          // ignore refresh failure
        }
        const totalSec = Math.max(
          0,
          Math.floor((Date.now() - (watchStartedAt ?? Date.now())) / 1000)
        );
        const errFromTrace = extractErrorFromTraceRows(latestRows);
        const errorMessage = msgText || errFromTrace || '执行失败';
        const ensuredFailNode =
          failNode ??
          ({
            key: `runtime-error:${Date.now()}`,
            phase: 'runtime',
            step: 'error',
            label: '执行失败',
            status: 'error' as const,
            error: errorMessage,
            outputSnapshot: { error: errorMessage },
          } satisfies TimelineNode);
        const next = saveDebugHistorySession(row.scope, row.type, row.subtype, {
          id: tid || `err-${Date.now()}`,
          savedAt: new Date().toISOString(),
          taskId: tid,
          status: 'error',
          errorMessage,
          elapsedSec: totalSec,
          label: taskLabel.trim() || undefined,
          guideIo,
          pipelineTrace: latestRows,
          runtimeIo: [
            ...runtimeIo.filter((n) => n.status !== 'error'),
            ensuredFailNode,
          ],
        });
        setLocalHistory(next);
        setPipelineTrace(latestRows);
      }
      message.error(msgText);
    } finally {
      window.clearInterval(pollTimer);
      if (token === pollAbortRef.current) {
        setRunning(false);
        setReviewOpen(false);
      }
    }
  };

  const mergeTaskLabelIntoParams = useCallback(
    (params: Record<string, unknown>) => {
      const label = taskLabel.trim();
      if (!label) return params;
      return { ...params, label };
    },
    [taskLabel]
  );

  const handleGuideStepIo = useCallback(
    (ev: CreateGuideStepIoEvent) => {
      upsertGuideIo(ev);
      if (ev.id === 'create-guide:create-task' && ev.status === 'running') {
        setFlowStep('submitting');
        beginPipelineWatch();
      }
      if (ev.id === 'create-guide:create-task' && ev.status === 'error') {
        setFlowStep('error');
        pushRuntimeError(ev.error || '创建任务失败', ev.inputSnapshot);
      }
    },
    [upsertGuideIo, beginPipelineWatch, pushRuntimeError]
  );

  const handleWizardTaskCreated = useCallback(
    (id: string) => {
      setFlowStep('polling');
      setWatchStartedAt((prev) => prev ?? Date.now());
      void followTaskLifecycle(id);
    },
    // followTaskLifecycle closes over latest row/scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, row?.id]
  );

  const restartGuide = useCallback(() => {
    pollAbortRef.current += 1;
    setViewingHistory(null);
    setFlowStep('idle');
    setTaskId(null);
    setPollProgress(null);
    setPollStatus('');
    setSyncText(null);
    setTextPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setInlineImageUrls([]);
    setPipelineTrace([]);
    setGuideIo([]);
    setRuntimeIo([]);
    setWatchStartedAt(null);
    setElapsedSec(0);
    setReviewTask(null);
    setReviewOpen(false);
    setRunning(false);
    lastSavedTaskIdRef.current = null;
    setWizardEpoch((n) => n + 1);
    revokeBlob();
  }, [revokeBlob]);

  const persistCurrentSession = useCallback(
    (status: 'done' | 'error' | 'partial') => {
      if (!row) return;
      if (
        guideIo.length === 0 &&
        pipelineTrace.length === 0 &&
        runtimeIo.length === 0
      ) {
        return;
      }
      const sid = taskId || `local-${Date.now()}`;
      if (taskId && lastSavedTaskIdRef.current === `${status}:${taskId}`) {
        return;
      }
      lastSavedTaskIdRef.current = `${status}:${sid}`;
      const errorMessage =
        status === 'error'
          ? runtimeIo.find((n) => n.error)?.error ||
            extractErrorFromTraceRows(pipelineTrace) ||
            undefined
          : undefined;
      const next = saveDebugHistorySession(row.scope, row.type, row.subtype, {
        id: sid,
        savedAt: new Date().toISOString(),
        taskId: taskId ?? null,
        status,
        errorMessage,
        elapsedSec,
        label: taskLabel.trim() || undefined,
        guideIo,
        pipelineTrace,
        runtimeIo,
      });
      setLocalHistory(next);
    },
    [row, guideIo, pipelineTrace, runtimeIo, taskId, elapsedSec, taskLabel]
  );

  const refreshHistoryLists = useCallback(async () => {
    if (!row) return;
    setLocalHistory(loadDebugHistory(row.scope, row.type, row.subtype));
    setHistoryLoading(true);
    try {
      const res = await getAdminTasks({ type: row.scope, limit: 40, offset: 0 });
      const tasks = res.data?.data?.tasks ?? [];
      const matched = tasks
        .map((t) => {
          const rp = t.requestParams as Record<string, unknown> | undefined;
          const tv2 = (rp?.taskV2 ??
            (rp?.params as { taskV2?: unknown } | undefined)?.taskV2 ??
            t.metadata) as { taskKey?: string; subtype?: string | null } | undefined;
          const metaTv2 = (t.metadata as { taskV2?: { taskKey?: string; subtype?: string | null } } | undefined)
            ?.taskV2;
          const key = tv2?.taskKey ?? metaTv2?.taskKey;
          const st = tv2?.subtype ?? metaTv2?.subtype ?? null;
          const bizMatch =
            key && key === row.type ? (st ?? null) === (row.subtype ?? null) : !key;
          const isDebug = isAdminDebugTaskItem(t);
          return { t, bizMatch, isDebug };
        })
        // 只列调试跑次，避免与用户正式任务混在一起
        .filter((x) => x.isDebug && x.bizMatch)
        .slice(0, 30)
        .map(({ t, isDebug }) => ({
          id: t.id,
          status: t.status,
          createdAt: t.createdAt,
          label:
            (t.metadata as { label?: string } | undefined)?.label ||
            t.progress?.message ||
            undefined,
          isDebug,
        }));
      setServerHistory(matched);
    } catch {
      setServerHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [row]);

  useEffect(() => {
    if (!open || !row) {
      setLocalHistory([]);
      setServerHistory([]);
      setViewingHistory(null);
      return;
    }
    setLocalHistory(loadDebugHistory(row.scope, row.type, row.subtype));
  }, [open, row]);

  const hydratedHistoryErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewingHistory || viewingHistory.status !== 'error' || !viewingHistory.taskId) return;
    if (hydratedHistoryErrorRef.current === viewingHistory.id) return;
    // 已有会话级原文且时间轴有失败节点 → 不必再拉
    if (
      viewingHistory.errorMessage?.trim() &&
      timelineHasErrorNode([
        ...viewingHistory.guideIo.map(guideEventToNode),
        ...viewingHistory.pipelineTrace.map((r, i) => pipelineRowToNode(r, i)),
        ...viewingHistory.runtimeIo,
      ])
    ) {
      hydratedHistoryErrorRef.current = viewingHistory.id;
      return;
    }
    const historyId = viewingHistory.id;
    const taskIdForHydrate = viewingHistory.taskId;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await refreshPipelineTraceFromTask(taskIdForHydrate);
        if (cancelled) return;
        const failNode =
          buildFailureRuntimeNode(snap.item) ||
          (extractErrorFromTraceRows(snap.rows)
            ? buildFailureRuntimeNode(null, extractErrorFromTraceRows(snap.rows)!)
            : null);
        hydratedHistoryErrorRef.current = historyId;
        if (!failNode && !snap.rows.length) return;
        setViewingHistory((prev) => {
          if (!prev || prev.id !== historyId) return prev;
          const errMsg =
            prev.errorMessage ||
            failNode?.error ||
            extractErrorFromTraceRows(snap.rows.length ? snap.rows : prev.pipelineTrace) ||
            undefined;
          return {
            ...prev,
            status: prev.status === 'done' && errMsg ? 'error' : prev.status,
            errorMessage: errMsg,
            pipelineTrace: snap.rows.length ? snap.rows : prev.pipelineTrace,
            runtimeIo: failNode
              ? [...prev.runtimeIo.filter((n) => n.key !== failNode.key), failNode]
              : prev.runtimeIo,
          };
        });
      } catch {
        hydratedHistoryErrorRef.current = historyId;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingHistory]);

  const openHistoryDrawer = () => {
    setHistoryOpen(true);
    void refreshHistoryLists();
  };

  /** 合并浏览器快照与任务列表为一条「最近调试」（不向用户暴露数据源概念） */
  const recentDebugRuns = useMemo(() => {
    type Row = {
      key: string;
      title: string;
      at: string;
      status: string;
      stepCount?: number;
      taskId?: string | null;
      errorMessage?: string;
      session?: DebugHistorySession;
    };
    const rows: Row[] = [];
    const seenTaskIds = new Set<string>();

    for (const s of localHistory) {
      const tid = s.taskId?.trim() || '';
      if (tid) seenTaskIds.add(tid);
      rows.push({
        key: `snap:${s.id}`,
        title: s.label || tid || s.id,
        at: s.savedAt,
        status: s.status === 'done' ? 'completed' : s.status === 'error' ? 'failed' : s.status,
        stepCount: s.guideIo.length + s.pipelineTrace.length + s.runtimeIo.length,
        taskId: tid || null,
        errorMessage:
          s.errorMessage ||
          extractErrorFromTraceRows(s.pipelineTrace) ||
          s.runtimeIo.find((n) => n.error)?.error ||
          undefined,
        session: s,
      });
    }

    for (const t of serverHistory) {
      if (seenTaskIds.has(t.id)) continue;
      const failed =
        t.status === 'failed' || t.status === 'cancelled' || t.status === 'network_error';
      rows.push({
        key: `task:${t.id}`,
        title: t.label || t.id,
        at: t.createdAt || '',
        status: t.status,
        taskId: t.id,
        errorMessage: failed ? `任务 ${t.status}` : undefined,
      });
    }

    rows.sort((a, b) => {
      const ta = a.at ? Date.parse(a.at) : 0;
      const tb = b.at ? Date.parse(b.at) : 0;
      return tb - ta;
    });
    return rows;
  }, [localHistory, serverHistory]);

  const loadLocalHistorySession = async (session: DebugHistorySession) => {
    let next = session;
    const nodes = [
      ...session.guideIo.map(guideEventToNode),
      ...session.pipelineTrace.map((r, i) => pipelineRowToNode(r, i)),
      ...session.runtimeIo,
    ];
    const needHydrate =
      (session.status === 'error' || !session.errorMessage) &&
      session.taskId &&
      (!timelineHasErrorNode(nodes) || !session.errorMessage?.trim());
    if (needHydrate && session.taskId) {
      try {
        const snap = await refreshPipelineTraceFromTask(session.taskId);
        const failNode =
          buildFailureRuntimeNode(snap.item) ||
          (extractErrorFromTraceRows(snap.rows)
            ? buildFailureRuntimeNode(null, extractErrorFromTraceRows(snap.rows)!)
            : null);
        const errorMessage =
          session.errorMessage ||
          failNode?.error ||
          extractErrorFromTraceRows(snap.rows.length ? snap.rows : session.pipelineTrace) ||
          undefined;
        next = {
          ...session,
          status: session.status === 'done' && errorMessage ? 'error' : session.status,
          errorMessage,
          pipelineTrace: snap.rows.length ? snap.rows : session.pipelineTrace,
          runtimeIo: failNode
            ? [...session.runtimeIo.filter((n) => n.key !== failNode.key), failNode]
            : session.runtimeIo,
        };
      } catch {
        // keep original session
      }
    } else if (!session.errorMessage) {
      const fromTrace =
        extractErrorFromTraceRows(session.pipelineTrace) ||
        session.runtimeIo.find((n) => n.error)?.error;
      if (fromTrace) next = { ...session, errorMessage: fromTrace };
    }
    setViewingHistory(next);
    setHistoryOpen(false);
    message.success('已加载该次调试');
    // 历史回看也拉终稿，与用户侧同一阅读器
    if (
      next.taskId &&
      (scope === 'writing' || scope === 'text' || next.scope === 'writing')
    ) {
      void loadWritingPreview(next.taskId, { fallbackTrace: next.pipelineTrace });
    } else {
      const fromTrace = extractManuscriptFromPipelineTrace(next.pipelineTrace);
      if (fromTrace) {
        setTextPreview(fromTrace);
        setPreviewError(null);
      } else {
        setTextPreview(null);
        setWritingPdfUrl(null);
        setWritingPdfHeaders(null);
        setPreviewError(next.taskId ? '无法识别业务类型，请点重新拉取' : '该历史无 taskId，无法拉取终稿');
      }
    }
  };

  const loadServerHistoryTask = async (tid: string) => {
    setHistoryLoading(true);
    try {
      const g = await getTask(tid);
      const full = extractFullCgiTaskFromApiResponse(g.data);
      if (!full) throw new Error('任务不存在');
      const tsk = full as unknown as Record<string, unknown>;
      const rows = pullTraceFromTask(tsk);
      const rp = full.requestParams as Record<string, unknown> | undefined;
      const tv2 = (rp?.taskV2 ??
        (rp?.params as { taskV2?: { taskKey?: string; subtype?: string | null } } | undefined)?.taskV2) as
        | { taskKey?: string; subtype?: string | null }
        | undefined;
      if (row && tv2?.taskKey && tv2.taskKey !== row.type) {
        message.warning('该任务业务与当前不一致，仍可查看 trace');
      }
      const status: DebugHistorySession['status'] =
        full.status === 'completed'
          ? 'done'
          : full.status === 'failed' ||
              full.status === 'cancelled' ||
              full.status === 'network_error'
            ? 'error'
            : 'partial';
      const failNode =
        status === 'error'
          ? buildFailureRuntimeNode(full as unknown as WritingTaskItem) ||
            (extractErrorFromTraceRows(rows)
              ? buildFailureRuntimeNode(null, extractErrorFromTraceRows(rows)!)
              : null)
          : null;
      const errorMessage =
        failNode?.error ||
        extractErrorFromTraceRows(rows) ||
        (status === 'error' ? `任务状态：${full.status}` : undefined);
      const session: DebugHistorySession = {
        id: `server:${tid}`,
        savedAt: full.createdAt || new Date().toISOString(),
        scope: row?.scope ?? full.type,
        taskKey: tv2?.taskKey ?? row?.type ?? '',
        subtype: tv2?.subtype ?? row?.subtype ?? null,
        taskId: tid,
        status,
        errorMessage,
        label: (full.metadata as { label?: string } | undefined)?.label,
        guideIo: [],
        pipelineTrace: rows,
        runtimeIo: failNode
          ? [failNode]
          : errorMessage
            ? [
                {
                  key: `runtime-error:task:${tid}`,
                  phase: 'runtime',
                  step: 'error',
                  label: '执行失败',
                  status: 'error',
                  error: errorMessage,
                  outputSnapshot: { error: errorMessage },
                },
              ]
            : [],
      };
      if (rows.length === 0 && !failNode) {
        message.warning('该任务暂无 pipelineTrace（可能非 Admin 调试跑次）');
      }
      setViewingHistory(session);
      setHistoryOpen(false);
      if (tid && (scope === 'writing' || scope === 'text' || session.scope === 'writing')) {
        void loadWritingPreview(tid, { fallbackTrace: rows });
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteServerDebugTask = async (tid: string) => {
    try {
      const res = await deleteTask(tid);
      if (res.error) throw new Error(res.error);
      setServerHistory((prev) => prev.filter((x) => x.id !== tid));
      if (viewingHistory?.taskId === tid) setViewingHistory(null);
      if (row) {
        for (const s of loadDebugHistory(row.scope, row.type, row.subtype)) {
          if (s.taskId === tid || s.id === tid || s.id === `server:${tid}`) {
            removeDebugHistorySession(row.scope, row.type, row.subtype, s.id);
          }
        }
        setLocalHistory(loadDebugHistory(row.scope, row.type, row.subtype));
      }
      message.success('已删除');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const openHistoryRow = async (rowItem: (typeof recentDebugRuns)[number]) => {
    if (rowItem.session) {
      await loadLocalHistorySession(rowItem.session);
      return;
    }
    if (rowItem.taskId) {
      await loadServerHistoryTask(rowItem.taskId);
    }
  };

  const deleteHistoryRow = async (rowItem: (typeof recentDebugRuns)[number]) => {
    if (!row) return;
    if (rowItem.session && !rowItem.taskId) {
      setLocalHistory(
        removeDebugHistorySession(row.scope, row.type, row.subtype, rowItem.session.id)
      );
      if (viewingHistory?.id === rowItem.session.id) setViewingHistory(null);
      message.success('已删除');
      return;
    }
    if (rowItem.taskId) {
      await deleteServerDebugTask(rowItem.taskId);
      return;
    }
    message.success('已删除');
  };

  const handleSchemaRun = async () => {
    if (!row || !formConfig?.schema) {
      message.warning('表单未就绪');
      return;
    }
    setRunning(true);
    setSyncText(null);
    setTextPreview(null);
    setInlineImageUrls([]);
    setPipelineTrace([]);
    setReviewOpen(false);
    setReviewTask(null);
    revokeBlob();
    setFlowStep('submitting');
    beginPipelineWatch();
    setTaskId(null);

    const params: Record<string, unknown> = prepareTaskV2SubmitParams(
      { ...formValues },
      formConfig.schema,
      { scope: row.scope }
    );
    if (typeof params.prompt === 'string' && !String(params.prompt).trim()) {
      params.prompt = DEFAULT_TEST_PROMPT;
    }
    if (
      params.prompt === undefined &&
      formConfig.schema.properties &&
      'prompt' in formConfig.schema.properties
    ) {
      params.prompt = DEFAULT_TEST_PROMPT;
    }
    if (row.scope === 'graph' && row.subtype && params.type === undefined) {
      params.type = row.subtype;
    }

    const useEphemeral = scope !== 'writing';

    try {
      const res = await runTaskV2({
        scope: row.scope,
        taskKey: row.type,
        subtype: row.subtype ?? null,
        params,
        ephemeral: useEphemeral,
        adminPipelineDebug: true,
      });
      if (res.error) throw new Error(res.error);

      const payload = parseTaskRunV2Payload(res.data);

      if (isSyncText) {
        freezeElapsed();
        setFlowStep('done');
        const t = payload.syncResult?.text?.trim();
        setSyncText(t || '（无文本，请检查模型返回与路由配置）');
        setPipelineTrace(extractPipelineTrace(payload.syncResult?.metadata));
        message.success('同步测试完成');
        return;
      }

      if (payload.syncResult && useEphemeral) {
        setPipelineTrace(extractPipelineTrace(payload.syncResult.metadata));
        const urls = (payload.syncResult.mediaUrls ?? []).filter(
          (u): u is string => typeof u === 'string' && u.length > 0
        );
        const previewable = urls.filter((u) => {
          const t = u.trim();
          if (/^data:image\//i.test(t)) return true;
          if (/^https?:\/\//i.test(t)) return true;
          return isInlineImagePreviewUrl(u);
        });
        if (previewable.length > 0) setInlineImageUrls(previewable);
        if (typeof payload.syncResult.text === 'string' && payload.syncResult.text.trim()) {
          setTextPreview(payload.syncResult.text.trim());
        } else if (
          (scope === 'audio' || scope === 'music' || scope === 'video') &&
          urls[0] &&
          /^https?:\/\//i.test(urls[0].trim())
        ) {
          setMediaBlobUrl(urls[0].trim());
        } else {
          setTextPreview(JSON.stringify(payload.syncResult.metadata ?? payload.syncResult, null, 2));
        }
        freezeElapsed();
        setFlowStep('done');
        message.success('测试任务已完成');
        return;
      }

      const tid = payload.taskId;
      if (!tid) throw new Error('响应中无 taskId');
      await followTaskLifecycle(tid);
    } catch (e) {
      const msgText = e instanceof Error ? e.message : String(e);
      freezeElapsed();
      setFlowStep('error');
      pushRuntimeError(msgText, { phase: 'schemaRun', scope, taskKey: row?.type });
      message.error(msgText);
      setRunning(false);
    }
  };

  return (
    <>
      <Modal
        className="admin-biz-debug-monitor"
        wrapClassName="admin-biz-debug-monitor-wrap"
        title={
          <div className="admin-biz-debug-monitor__titlebar">
            <div className="admin-biz-debug-monitor__title-main">
              {row ? (
                <Space wrap size={6}>
                  <span className="admin-biz-debug-monitor__brand">操作监控室</span>
                  <Tag color="geekblue">调试</Tag>
                  <Tag color={isSyncText ? 'green' : 'blue'}>{isSyncText ? '同步' : '异步'}</Tag>
                  {embedWizard ? <Tag color="cyan">同用户引导</Tag> : null}
                  <Typography.Text code>{row.scope}</Typography.Text>
                  <span className="admin-biz-debug-monitor__sep">/</span>
                  <Typography.Text code>{row.type}</Typography.Text>
                  {row.subtype ? (
                    <>
                      <span className="admin-biz-debug-monitor__sep">/</span>
                      <Typography.Text code>{row.subtype}</Typography.Text>
                    </>
                  ) : null}
                  {taskId ? (
                    <Typography.Text type="secondary" copyable style={{ fontSize: 12 }}>
                      {taskId}
                    </Typography.Text>
                  ) : null}
                </Space>
              ) : (
                <span className="admin-biz-debug-monitor__brand">操作监控室</span>
              )}
            </div>
            <Button
              size="small"
              className="admin-biz-debug-monitor__history-btn"
              icon={<HistoryOutlined />}
              onClick={openHistoryDrawer}
              disabled={leftPipelineWatching}
            >
              最近调试
            </Button>
          </div>
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width="100vw"
        style={{ top: 0, maxWidth: '100vw', paddingBottom: 0, margin: 0 }}
        styles={{
          header: { margin: 0, padding: '8px 44px 8px 14px', borderRadius: 0 },
          body: { height: 'calc(100vh - 49px)', padding: 0, overflow: 'hidden', borderRadius: 0 },
          content: { borderRadius: 0, boxShadow: 'none' },
        }}
        destroyOnHidden
      >
        <div className="admin-biz-debug-shell">
          <aside className="admin-biz-debug-left">
            <div className="admin-biz-debug-left__head">
              <h3>{embedWizard ? '输入 / 审核' : '请求参数'}</h3>
              <p>{scopeHint}</p>
              <div
                className={
                  flowStep === 'error'
                    ? 'admin-biz-debug-left__status is-error'
                    : flowStep === 'done'
                      ? 'admin-biz-debug-left__status is-done'
                      : flowStep === 'review'
                        ? 'admin-biz-debug-left__status is-review'
                        : flowStep === 'polling' || flowStep === 'submitting'
                          ? 'admin-biz-debug-left__status is-running'
                          : 'admin-biz-debug-left__status'
                }
              >
                {leftStatusText}
              </div>
            </div>
            <div className="admin-biz-debug-left__form mxm-form-surface">
              {viewingHistory ? (
                <div className="admin-biz-debug-watch admin-biz-debug-watch--settled">
                  <p className="admin-biz-debug-watch__title">回看这次调试</p>
                  <p className="admin-biz-debug-watch__timer">
                    总用时{' '}
                    <strong>
                      {formatElapsed(
                        viewingHistory.elapsedSec != null && viewingHistory.elapsedSec > 0
                          ? viewingHistory.elapsedSec
                          : Math.ceil(
                              viewingHistory.pipelineTrace.reduce(
                                (acc, r) =>
                                  acc + (typeof r.durationMs === 'number' ? r.durationMs : 0),
                                0
                              ) / 1000
                            )
                      )}
                    </strong>
                  </p>
                  <p className="admin-biz-debug-watch__msg">
                    {viewingHistory.status} · {viewingHistory.label || viewingHistory.taskId || viewingHistory.id}
                  </p>
                  <p className="admin-biz-debug-watch__hint">
                    {new Date(viewingHistory.savedAt).toLocaleString()}
                  </p>
                  <p className="admin-biz-debug-watch__hint">
                    {previewLoading
                      ? '正在拉取终稿…'
                      : textPreview || writingPdfUrl
                        ? '终稿在右侧上方；下方为 Raw I/O。'
                        : '右侧上方应显示终稿。'}
                  </p>
                  {viewingHistory.taskId && !previewLoading && !textPreview && !writingPdfUrl ? (
                    <Button
                      size="small"
                      style={{ marginTop: 8 }}
                      onClick={() =>
                        void loadWritingPreview(viewingHistory.taskId!, {
                          fallbackTrace: viewingHistory.pipelineTrace,
                        })
                      }
                    >
                      重新拉取终稿
                    </Button>
                  ) : null}
                  <Button
                    type="primary"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setViewingHistory(null);
                      setTextPreview(null);
                      setPreviewError(null);
                      setWritingPdfUrl(null);
                      setWritingPdfHeaders(null);
                    }}
                  >
                    返回当前调试
                  </Button>
                </div>
              ) : leftPipelineWatching ? (
                <div className="admin-biz-debug-watch" role="status" aria-live="polite" aria-busy="true">
                  {!/^completed\b/i.test(pollStatus) ? (
                    <div className="admin-biz-debug-watch__orb" aria-hidden>
                      <span className="admin-biz-debug-watch__ring" />
                      <span className="admin-biz-debug-watch__ring admin-biz-debug-watch__ring--delay" />
                    </div>
                  ) : null}
                  <p className="admin-biz-debug-watch__title">
                    {flowStep === 'submitting'
                      ? '正在创建任务…'
                      : /^completed\b/i.test(pollStatus)
                        ? '收尾中…'
                        : '管线执行中'}
                  </p>
                  <p className="admin-biz-debug-watch__msg">{leftStatusText}</p>
                  <p className="admin-biz-debug-watch__timer">
                    已用时 <strong>{formatElapsed(elapsedSec)}</strong>
                  </p>
                  {pollProgress != null ? (
                    <p className="admin-biz-debug-watch__progress">进度 {Math.min(100, Math.max(0, pollProgress))}%</p>
                  ) : null}
                  {taskId ? (
                    <Typography.Text type="secondary" copyable style={{ fontSize: 11 }}>
                      {taskId}
                    </Typography.Text>
                  ) : null}
                  <p className="admin-biz-debug-watch__hint">
                    {/^completed\b/i.test(pollStatus)
                      ? '任务已完成，正在拉取正文并停止计时…'
                      : '右侧时间轴同步追踪每步输入/输出。跑完或进入人工审核后可继续操作。'}
                  </p>
                </div>
              ) : flowStep === 'review' ? (
                <div className="admin-biz-debug-watch admin-biz-debug-watch--review">
                  <p className="admin-biz-debug-watch__title">人工审核</p>
                  <p className="admin-biz-debug-watch__msg">请在审核弹窗中确认参数；确认后管线将继续，左侧再次进入监听。</p>
                  <p className="admin-biz-debug-watch__timer">
                    已用时 <strong>{formatElapsed(elapsedSec)}</strong>
                  </p>
                  {taskId ? (
                    <Typography.Text type="secondary" copyable style={{ fontSize: 11 }}>
                      {taskId}
                    </Typography.Text>
                  ) : null}
                  <Button
                    type="primary"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      if (reviewTask) setReviewOpen(true);
                    }}
                  >
                    打开审核面板
                  </Button>
                </div>
              ) : flowStep === 'done' || flowStep === 'error' ? (
                <div className="admin-biz-debug-watch admin-biz-debug-watch--settled">
                  <p className="admin-biz-debug-watch__title">
                    {flowStep === 'done' ? '本轮已完成' : '本轮失败'}
                  </p>
                  <p className="admin-biz-debug-watch__timer">
                    总用时 <strong>{formatElapsed(elapsedSec)}</strong>
                  </p>
                  {taskId ? (
                    <Typography.Text type="secondary" copyable style={{ fontSize: 11 }}>
                      {taskId}
                    </Typography.Text>
                  ) : null}
                  {flowStep === 'error' && timelineErrorSummary ? (
                    <div className="admin-biz-debug-left-error">
                      <pre className="admin-biz-debug-error-banner__text">{timelineErrorSummary}</pre>
                    </div>
                  ) : flowStep === 'done' ? (
                    <p className="admin-biz-debug-watch__hint">
                      {previewLoading
                        ? '正在拉取终稿…'
                        : textPreview || writingPdfUrl || syncText
                          ? '终稿在右侧上方，与用户侧同一阅读器。'
                          : '右侧上方应显示终稿；若为空可点重新拉取。'}
                    </p>
                  ) : null}
                  {flowStep === 'done' &&
                  taskId &&
                  scope === 'writing' &&
                  !previewLoading &&
                  !textPreview &&
                  !writingPdfUrl ? (
                    <Button
                      size="small"
                      style={{ marginTop: 8 }}
                      onClick={() => void loadWritingPreview(taskId)}
                    >
                      重新拉取终稿
                    </Button>
                  ) : null}
                  <Button type="primary" style={{ marginTop: 12 }} onClick={restartGuide}>
                    重新调试
                  </Button>
                </div>
              ) : embedWizard && row ? (
                <WritingCreateWizard
                  key={`${row.scope}-${row.type}-${row.subtype ?? ''}-${wizardEpoch}`}
                  scope={wizardScope}
                  taskOptions={taskOptions}
                  selectOptions={selectOptions}
                  selectedValue={selectedValue}
                  onSelectBusiness={() => {}}
                  taskKey={row.type}
                  subtype={row.subtype}
                  formConfig={formConfig}
                  configLoading={configLoading}
                  taskLabel={taskLabel}
                  onTaskLabelChange={setTaskLabel}
                  mergeTaskLabelIntoParams={mergeTaskLabelIntoParams}
                  locale="zh"
                  generateLabel="生成"
                  billing={billing}
                  onBillingStateChange={setBilling}
                  onTaskCreated={handleWizardTaskCreated}
                  onFinished={() => {
                    /* 监控室保持打开，右侧继续跟任务 */
                  }}
                  lockBusiness
                  adminPipelineDebug
                  onGuideStepIo={handleGuideStepIo}
                />
              ) : (
                <TaskV2SchemaForm
                  formConfig={formConfig}
                  formValues={formValues}
                  onChange={setFormValues}
                  loading={configLoading}
                  loadingMessage="正在加载表单配置…"
                />
              )}
            </div>
            {!embedWizard && leftGuideEditable && !viewingHistory ? (
              <div className="admin-biz-debug-left__foot">
                <Button
                  type="primary"
                  loading={running}
                  disabled={!formConfig?.schema || configLoading}
                  onClick={() => void handleSchemaRun()}
                >
                  运行（同用户链路）
                </Button>
              </div>
            ) : null}
          </aside>

          <section className="admin-biz-debug-right">
            <div className="admin-biz-debug-right__status">
              <Space wrap size={8}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {viewingHistory || flowStep === 'done' || previewLoading
                    ? '终稿 · 管道时间轴'
                    : '管道时间轴 · Raw I/O'}
                </Typography.Text>
                {viewingHistory ? <Tag color="purple">历史</Tag> : null}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {viewingHistory || flowStep === 'done'
                    ? '用户侧同款阅读器 → 下方 Raw I/O'
                    : '引导预览 → 管线 → 报错'}
                </Typography.Text>
                {timelineNodes.length > 0 ? <Tag>{timelineNodes.length} 步</Tag> : null}
              </Space>
            </div>
            <div className="admin-biz-debug-right__body">
              {timelineErrorSummary ? (
                <Alert
                  type="error"
                  showIcon
                  className="admin-biz-debug-error-banner"
                  message="本轮报错"
                  description={
                    <pre className="admin-biz-debug-error-banner__text">{timelineErrorSummary}</pre>
                  }
                  style={{ marginBottom: 12 }}
                />
              ) : null}

              {timelineNodes.length === 0 &&
              !previewLoading &&
              !(syncText || textPreview || writingPdfUrl || mediaBlobUrl || inlineImageUrls.length > 0) ? (
                <div className="admin-biz-debug-empty">
                  <strong>等待步骤</strong>
                  左侧引导一旦跑网络检索 / 分析等预览，或任务管线推进，这里会按时间轴展开每步输入/输出。
                </div>
              ) : null}

              {timelineNodes.length > 0 ||
              flowStep === 'done' ||
              previewLoading ||
              !!viewingHistory ? (
                <ol className="admin-biz-debug-timeline">
                  {timelineNodes.map((node, i) => {
                    const statusClass =
                      node.status === 'running'
                        ? 'is-running'
                        : node.status === 'error'
                          ? 'is-error'
                          : node.status === 'skipped'
                            ? 'is-skipped'
                            : 'is-done';
                    const showFinalAfter =
                      flowStep === 'done' || previewLoading || !!viewingHistory;
                    return (
                      <li key={node.key} className={`admin-biz-debug-timeline__item ${statusClass}`}>
                        <div className="admin-biz-debug-timeline__rail" aria-hidden>
                          <span className="admin-biz-debug-timeline__dot" />
                          {i < timelineNodes.length - 1 || showFinalAfter ? (
                            <span className="admin-biz-debug-timeline__line" />
                          ) : null}
                        </div>
                        <div className="admin-biz-debug-timeline__card">
                          <div className="admin-biz-debug-step-label">
                            <Tag
                              color={
                                node.status === 'running'
                                  ? 'processing'
                                  : node.status === 'error'
                                    ? 'error'
                                    : node.status === 'skipped'
                                      ? 'default'
                                      : 'success'
                              }
                            >
                              {node.status === 'running'
                                ? '进行中'
                                : node.status === 'error'
                                  ? '失败'
                                  : node.status === 'skipped'
                                    ? '跳过'
                                    : '完成'}
                            </Tag>
                            {node.phase ? <Tag>{node.phase}</Tag> : null}
                            <Typography.Text code>{node.step}</Typography.Text>
                            {node.label ? (
                              <Typography.Text strong style={{ fontSize: 13 }}>
                                {node.label}
                              </Typography.Text>
                            ) : null}
                            {typeof node.durationMs === 'number' ? (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {node.durationMs}ms
                              </Typography.Text>
                            ) : null}
                            {node.budget?.completion_tokens != null ? (
                              <Tag>
                                out≈{node.budget.completion_tokens}
                                {node.budget.finish_reason
                                  ? ` · ${node.budget.finish_reason}`
                                  : ''}
                              </Tag>
                            ) : null}
                            {node.budget?.had_reasoning ? <Tag color="default">had reasoning</Tag> : null}
                            {node.budget?.truncated ? <Tag color="orange">truncated</Tag> : null}
                            {node.budget?.thinking_disabled_retry ? (
                              <Tag color="blue">thinking off retry</Tag>
                            ) : null}
                            {node.budget?.continued ? <Tag color="blue">continued</Tag> : null}
                            {node.nestedTaskId ? (
                              <Typography.Text type="secondary" copyable style={{ fontSize: 11 }}>
                                {node.nestedTaskId}
                              </Typography.Text>
                            ) : null}
                          </div>
                          {node.error ? (
                            <Alert
                              type="error"
                              showIcon
                              message="步骤失败"
                              description={
                                <pre className="admin-biz-debug-error-banner__text">{node.error}</pre>
                              }
                              style={{ marginTop: 8, marginBottom: 8 }}
                            />
                          ) : null}
                          <Collapse
                            size="small"
                            defaultActiveKey={
                              node.status === 'running' || node.status === 'error'
                                ? ['in', 'out']
                                : ['out']
                            }
                            items={[
                              {
                                key: 'in',
                                label: '本步输入（配置+解析）',
                                children: (
                                  <TraceIoBody
                                    side="input"
                                    step={node.step}
                                    value={node.inputSnapshot}
                                    emptyLabel={
                                      node.status === 'skipped' ? '（跳过）' : '（无）'
                                    }
                                  />
                                ),
                              },
                              {
                                key: 'out',
                                label: '本步输出（配置目标+产出）',
                                children: (
                                  <TraceIoBody
                                    side="output"
                                    step={node.step}
                                    value={
                                      node.outputSnapshot != null
                                        ? node.outputSnapshot
                                        : node.error
                                          ? { error: node.error }
                                          : null
                                    }
                                    emptyLabel={
                                      node.status === 'running'
                                        ? '（执行中…）'
                                        : node.status === 'skipped'
                                          ? '（跳过）'
                                          : '（无）'
                                    }
                                  />
                                ),
                              },
                            ]}
                          />
                        </div>
                      </li>
                    );
                  })}

                  {(flowStep === 'done' || previewLoading || !!viewingHistory) ? (
                    <li
                      className={`admin-biz-debug-timeline__item ${
                        previewLoading ? 'is-running' : 'is-done'
                      } is-final`}
                    >
                      <div className="admin-biz-debug-timeline__rail" aria-hidden>
                        <span className="admin-biz-debug-timeline__dot" />
                      </div>
                      <div className="admin-biz-debug-timeline__card admin-biz-debug-final">
                        <div className="admin-biz-debug-step-label">
                          <Tag color={previewLoading ? 'processing' : 'blue'}>
                            {previewLoading ? '拉取中' : '终稿'}
                          </Tag>
                          <Typography.Text strong style={{ fontSize: 13 }}>
                            {viewingHistory ? '生成内容（历史）' : '生成内容'}
                          </Typography.Text>
                        </div>
                        {previewLoading ? (
                          <p className="admin-biz-debug-final__hint">
                            正在拉取终稿（与用户侧同源）…
                          </p>
                        ) : writingPdfUrl ||
                          syncText ||
                          textPreview ||
                          mediaBlobUrl ||
                          inlineImageUrls.length > 0 ? (
                          <DocumentReaderShell
                            variant="compact"
                            className="admin-biz-debug-final__reader"
                          >
                            {writingPdfUrl ? (
                              <PdfJsReader
                                source={writingPdfUrl}
                                httpHeaders={writingPdfHeaders ?? undefined}
                                showInlineToolbar
                              />
                            ) : null}
                            {inlineImageUrls.length > 0 && scope === 'graph' ? (
                              <div className="admin-biz-debug-final__media">
                                {inlineImageUrls.map((src, i) => (
                                  <img
                                    key={`${i}-${src.slice(0, 40)}`}
                                    src={src}
                                    alt={`预览 ${i + 1}`}
                                  />
                                ))}
                              </div>
                            ) : null}
                            {mediaBlobUrl && scope === 'graph' && !writingPdfUrl ? (
                              <div className="admin-biz-debug-final__media">
                                <img src={mediaBlobUrl} alt="生成结果" />
                              </div>
                            ) : null}
                            {(scope === 'audio' || scope === 'music') && mediaBlobUrl ? (
                              <audio src={mediaBlobUrl} controls style={{ width: '100%' }} />
                            ) : null}
                            {scope === 'video' && mediaBlobUrl ? (
                              <video
                                src={mediaBlobUrl}
                                controls
                                style={{ width: '100%', borderRadius: 4 }}
                              />
                            ) : null}
                            {syncText != null && !writingPdfUrl ? (
                              <MarkdownReader content={syncText} />
                            ) : null}
                            {textPreview != null && !writingPdfUrl && syncText == null ? (
                              <MarkdownReader content={textPreview} />
                            ) : null}
                          </DocumentReaderShell>
                        ) : (
                          <div className="admin-biz-debug-final__empty">
                            <p>{previewError ? `拉取失败：${previewError}` : '暂无终稿正文'}</p>
                            {(viewingHistory?.taskId || taskId) &&
                            (scope === 'writing' || scope === 'text') ? (
                              <Button
                                size="small"
                                type="link"
                                onClick={() =>
                                  void loadWritingPreview(viewingHistory?.taskId || taskId!, {
                                    fallbackTrace:
                                      viewingHistory?.pipelineTrace ?? pipelineTrace,
                                  })
                                }
                              >
                                重新拉取
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </li>
                  ) : null}
                </ol>
              ) : null}

              {timelineNodes.length === 0 &&
              (flowStep === 'done' || flowStep === 'polling' || flowStep === 'review') &&
              !(syncText || textPreview || writingPdfUrl || mediaBlobUrl || inlineImageUrls.length > 0) ? (
                <div className="admin-biz-debug-empty">
                  <strong>尚无 pipelineTrace</strong>
                  任务仍在执行，或本业务未走可追踪管线步。完成后若仍为空，检查是否已启用 adminPipelineDebug。
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </Modal>
      <Drawer
        className="admin-biz-debug-history-drawer"
        title="最近调试"
        placement="right"
        width={420}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        destroyOnHidden
        styles={{
          content: { borderRadius: 0 },
          header: { borderRadius: 0 },
        }}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0 }}>
          本业务最近的调试跑次。点开可回看时间轴；删除会清掉对应任务。
        </Typography.Paragraph>
        <div className="admin-biz-debug-history-list">
          {historyLoading && recentDebugRuns.length === 0 ? (
            <p className="admin-biz-debug-history-empty">加载中…</p>
          ) : recentDebugRuns.length === 0 ? (
            <p className="admin-biz-debug-history-empty">暂无记录。跑完一轮后会出现在这里。</p>
          ) : (
            recentDebugRuns.map((item) => (
              <div key={item.key} className="admin-biz-debug-history-item">
                <button
                  type="button"
                  className="admin-biz-debug-history-item__main"
                  onClick={() => void openHistoryRow(item)}
                >
                  <span className="admin-biz-debug-history-item__title">
                    {item.title}
                  </span>
                  <span className="admin-biz-debug-history-item__meta">
                    {item.at ? new Date(item.at).toLocaleString() : '—'} ·{' '}
                    <span
                      className={
                        item.status === 'failed' ||
                        item.status === 'error' ||
                        item.status === 'network_error' ||
                        item.status === 'cancelled'
                          ? 'admin-biz-debug-history-item__status is-error'
                          : undefined
                      }
                    >
                      {item.status}
                    </span>
                    {item.stepCount != null ? ` · ${item.stepCount} 步` : ''}
                  </span>
                  {item.errorMessage ? (
                    <span className="admin-biz-debug-history-item__err" title={item.errorMessage}>
                      {item.errorMessage}
                    </span>
                  ) : null}
                  {item.taskId ? (
                    <Typography.Text
                      type="secondary"
                      copyable={{ text: item.taskId }}
                      style={{ fontSize: 11 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.taskId}
                    </Typography.Text>
                  ) : null}
                </button>
                <Popconfirm
                  title="删除这次调试？"
                  description="删除后列表不再显示；若有任务也会一并删除。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void deleteHistoryRow(item)}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    className="admin-biz-debug-history-item__del"
                    icon={<DeleteOutlined />}
                    aria-label="删除这次调试"
                  />
                </Popconfirm>
              </div>
            ))
          )}
        </div>
      </Drawer>
      <ManualReviewModal
        open={reviewOpen}
        task={reviewTask}
        onClose={() => {
          setReviewOpen(false);
          if (reviewWaitRef.current) {
            reviewWaitRef.current.reject(new Error('已取消闸门确认'));
            reviewWaitRef.current = null;
          }
        }}
        onApproved={() => {
          if (reviewWaitRef.current) {
            reviewWaitRef.current.resolve();
            reviewWaitRef.current = null;
          }
        }}
      />
    </>
  );
}
