/** 写作卡片：管道五段展示（与后端 WARP_UI_PHASES 对齐，仅人话） */

export const WRITING_PIPELINE_PHASES = [
  { id: 'pre', label: '检索' },
  { id: 'input', label: '选题' },
  { id: 'enrich', label: '深挖' },
  { id: 'output', label: '成稿' },
  { id: 'post', label: '收尾' },
] as const;

export type WritingPipelinePhaseId = (typeof WRITING_PIPELINE_PHASES)[number]['id'];

function phaseIdToIndex(phase?: string | null): number | null {
  if (phase === 'save' || phase === 'post') return 4;
  if (phase === 'output') return 3;
  if (phase === 'enrich') return 2;
  if (phase === 'input') return 1;
  if (phase === 'pre') return 0;
  return null;
}

function clampPhaseIndex(n: number): number {
  return Math.min(WRITING_PIPELINE_PHASES.length - 1, Math.max(0, Math.floor(n)));
}

/**
 * 解析当前高亮段。
 * - phase 与 phaseIndex 冲突时取较小值（避免进度字段漂移把五段全点亮）
 * - 组任务仍在写、已成稿数 < 总数时，最多停在「成稿」，不点亮「收尾」
 */
export function resolveWritingPipelinePhaseIndex(args: {
  phase?: string | null;
  phaseIndex?: number | null;
  progress?: number | null;
  status?: string | null;
  collectionReady?: number | null;
  collectionTotal?: number | null;
}): number {
  const { phase, phaseIndex, progress, status, collectionReady, collectionTotal } = args;
  const fromPhase = phaseIdToIndex(phase);
  let idx: number | null = null;

  if (typeof phaseIndex === 'number' && Number.isFinite(phaseIndex)) {
    idx = clampPhaseIndex(phaseIndex);
    // phase 更保守时以 phase 为准，防止旧高 phaseIndex 残留把条点满
    if (fromPhase != null && fromPhase < idx) idx = fromPhase;
  } else if (fromPhase != null) {
    idx = fromPhase;
  } else {
    const pct = typeof progress === 'number' ? progress : 0;
    if (pct >= 86) idx = 4;
    else if (pct >= 68) idx = 3;
    else if (pct >= 38) idx = 2;
    else if (pct >= 30) idx = 1;
    else idx = 0;
  }

  const stillRunning =
    status === 'processing' || status === 'pending' || status === 'queued';
  const collectionIncomplete =
    typeof collectionReady === 'number' &&
    typeof collectionTotal === 'number' &&
    collectionTotal > 0 &&
    collectionReady < collectionTotal;

  // 分路未齐，或仍在跑且没有明确进入 post/save：禁止把「收尾」点满
  if (stillRunning) {
    const inPost = phase === 'post' || phase === 'save';
    if (collectionIncomplete || (!inPost && idx >= 4)) {
      idx = Math.min(idx, 3);
    }
  }

  return clampPhaseIndex(idx);
}

/** 组任务进行中：用「已成稿 N/M」覆盖含糊文案 */
export function formatWritingCollectionProgressHint(args: {
  message?: string | null;
  statusLabel: string;
  ready?: number | null;
  total?: number | null;
  status?: string | null;
}): string {
  const stillRunning =
    args.status === 'processing' || args.status === 'pending' || args.status === 'queued';
  const ready = args.ready;
  const total = args.total;
  if (
    stillRunning &&
    typeof ready === 'number' &&
    typeof total === 'number' &&
    total > 0 &&
    ready >= 0
  ) {
    if (ready < total) return `已成稿 ${ready}/${total}…`;
    return `汇编收尾中（${ready}/${total}）…`;
  }
  return args.message?.trim() || args.statusLabel;
}
