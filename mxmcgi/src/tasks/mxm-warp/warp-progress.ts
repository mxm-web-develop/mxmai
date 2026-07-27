/**
 * mxm-warp 五段进度：人话阶段文案 + 单调百分比区间。
 * 禁止业务硬编码；step 文案按平台 step 名映射，未知步用通用「处理中」。
 */

import type { PipelineStep } from '../types';

export type WarpProgressPhase = 'pre' | 'input' | 'enrich' | 'output' | 'post' | 'save';

/** 用户可见的五段（卡片分段条顺序） */
export const WARP_UI_PHASES: ReadonlyArray<{
  id: WarpProgressPhase;
  label: string;
}> = [
  { id: 'pre', label: '检索' },
  { id: 'input', label: '选题' },
  { id: 'enrich', label: '深挖' },
  { id: 'output', label: '成稿' },
  { id: 'post', label: '收尾' },
] as const;

/** 各阶段占用的进度区间 [start, end)，末段 end 可达 95；100 留给完成 */
const PHASE_BAND: Record<WarpProgressPhase, { start: number; end: number }> = {
  pre: { start: 12, end: 30 },
  input: { start: 30, end: 38 },
  enrich: { start: 38, end: 68 },
  output: { start: 68, end: 86 },
  post: { start: 86, end: 95 },
  save: { start: 95, end: 99 },
};

export type WarpProgressUpdate = {
  progress: number;
  message: string;
  phase: WarpProgressPhase;
  /** 0-based，对应 WARP_UI_PHASES；save 映射为 post 段满 */
  phaseIndex: number;
  phaseTotal: number;
};

const STEP_MESSAGE: Record<string, string> = {
  webSearch: '检索资讯中…',
  extractHotTopics: '提炼热点中…',
  pickMainTopic: '选定主线话题…',
  nestedText: '整理文稿中…',
  groupItemBatch: '并发撰写多路文稿…',
  assembleGroupText: '汇编多路成稿…',
  groupFanout: '派发子任务中…',
  sensitiveCheck: '内容检查中…',
  knowledgeRetrieve: '查阅知识库…',
  resolveContextFields: '准备上下文…',
  interactiveCard: '等待你确认…',
  manualReview: '等待审核…',
  noop: '准备中…',
};

const PHASE_MESSAGE: Record<WarpProgressPhase, string> = {
  pre: '检索资讯中…',
  input: '整理选题中…',
  enrich: '深挖补充中…',
  output: '撰写成稿中…',
  post: '排版润色中…',
  save: '保存文稿中…',
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(99, Math.max(0, Math.round(n)));
}

function phaseIndexOf(phase: WarpProgressPhase): number {
  if (phase === 'save') return WARP_UI_PHASES.length - 1;
  const i = WARP_UI_PHASES.findIndex((p) => p.id === phase);
  return i >= 0 ? i : 0;
}

/** 阶段内按步推进：index/total 落在 [start, end) */
export function progressWithinPhase(
  phase: WarpProgressPhase,
  stepIndex: number,
  stepTotal: number
): number {
  const band = PHASE_BAND[phase];
  if (stepTotal <= 0) return band.start;
  const t = Math.min(1, Math.max(0, (stepIndex + 0.35) / stepTotal));
  return clampPct(band.start + (band.end - band.start) * t);
}

export function progressAtPhaseStart(phase: WarpProgressPhase): number {
  return PHASE_BAND[phase].start;
}

export function messageForPipelineStep(step: PipelineStep): string {
  const name = String(step.step || '');
  if (name === 'nestedText') {
    const key = String(step.nestedTextTaskKey || '');
    if (key.includes('seek-variants')) return '定制多路写作合同…';
    if (key.includes('structure')) return '规划章节结构…';
    if (key.includes('body')) return '充实正文证据…';
    if (key.includes('md-format') || key.includes('format') || key.includes('prose-deai') || key.includes('polish'))
      return '排版润色中…';
    if (key.includes('hot-topics')) return '提炼热点中…';
  }
  if (name === 'groupItemBatch') {
    const p = (step.params ?? {}) as Record<string, unknown>;
    const hasMs = Boolean(p.itemManuscript);
    const hasSearch = Boolean(p.itemWebSearch);
    const hasPlan = Boolean(p.itemNestedText);
    if (hasMs && !hasSearch && !hasPlan) return '并发撰写多路文稿…';
    if (hasSearch && !hasMs) return '分路检索并回填合同…';
    if (hasSearch && hasMs) return '分路检索并撰写…';
  }
  return STEP_MESSAGE[name] ?? '处理中…';
}

export function buildWarpProgressUpdate(args: {
  phase: WarpProgressPhase;
  message?: string;
  stepIndex?: number;
  stepTotal?: number;
}): WarpProgressUpdate {
  const { phase } = args;
  let progress: number;
  if (
    typeof args.stepIndex === 'number' &&
    typeof args.stepTotal === 'number' &&
    args.stepTotal > 0
  ) {
    progress = progressWithinPhase(phase, args.stepIndex, args.stepTotal);
  } else {
    progress = progressAtPhaseStart(phase);
  }
  return {
    progress,
    message: args.message?.trim() || PHASE_MESSAGE[phase],
    phase,
    phaseIndex: phaseIndexOf(phase),
    phaseTotal: WARP_UI_PHASES.length,
  };
}

export type WarpProgressReporter = (update: WarpProgressUpdate) => void | Promise<void>;
