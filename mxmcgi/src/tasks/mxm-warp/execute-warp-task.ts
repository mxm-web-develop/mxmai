/**
 * 在已有 TaskContext / TaskTemplate 上跑完整 mxm-warp，并带回用量袋
 */
import type { ModelScope } from '../../models/types';
import type { TaskContext, TaskTemplate } from '../types';
import { createWarpLlmAdapter, type WarpLlmUsageBag } from './llm-adapter';
import { getContract } from './input-stage';
import { isMxmWarpExecution, runMxmWarp } from './warp-runner';
import type { ManualReviewGateInfo, ReviewDraftPayload } from '../manual-review-types';
import type { WarpProgressReporter } from './warp-progress';
import { assertCleanWritingManuscript } from '../llm-output-hygiene';

export function detectMxmWarp(
  template: TaskTemplate,
  rowExtra?: Record<string, unknown> | null
): boolean {
  return isMxmWarpExecution(template, rowExtra);
}

export async function executeMxmWarpTask(args: {
  ctx: TaskContext;
  template: TaskTemplate;
  modelScope: ModelScope;
  modelKey: string;
  provider: string;
  runInputLlm?: boolean;
  resumeAt?: 'start' | 'output';
  onProgress?: WarpProgressReporter;
  /** Admin 调试：每跑完一步回调，便于落库 pipelineTrace */
  onPipelineCheckpoint?: (ctx: TaskContext) => void | Promise<void>;
}): Promise<{
  ctx: TaskContext;
  text: string;
  usageBag: WarpLlmUsageBag;
  paused?: {
    gate: ManualReviewGateInfo;
    draft: ReviewDraftPayload;
  };
}> {
  const usageBag: WarpLlmUsageBag = {};
  const llm = createWarpLlmAdapter({
    scope: args.modelScope,
    modelKey: args.modelKey,
    provider: args.provider,
    usageBag,
  });

  const next = await runMxmWarp({
    ctx: args.ctx,
    template: args.template,
    inputLlm: args.runInputLlm === false ? undefined : llm,
    outputLlm: llm,
    resumeAt: args.resumeAt,
    onProgress: args.onProgress,
    onPipelineCheckpoint: args.onPipelineCheckpoint,
  });

  if (next.state.warpAwaitingUserGate && next.state.__pendingManualReviewDraft) {
    const draft = next.state.__pendingManualReviewDraft as ReviewDraftPayload;
    const gate = (next.state.__warpReviewGate as ManualReviewGateInfo | undefined) ?? {
      gateId: draft.gateId,
      phase: 'pre' as const,
      stepIndex: 0,
      kind: draft.kind,
      label: draft.label,
      hint: draft.hint,
    };
    return {
      ctx: next,
      text: '',
      usageBag,
      paused: { gate, draft },
    };
  }

  // post 抛光写在 finalArtifact；未跑 post 时靠 output 同步写入的 finalArtifact / coreArtifact
  // group 成稿：优先 groupAssembledText / 带 assembledFromGroup 的 coreArtifact
  // 兜底：若 final 仍是 enrich expert JSON而 core 已是 Markdown 成稿，取 core（无 post 时也正确）
  const groupAssembled =
    typeof next.state.groupAssembledText === 'string' ? next.state.groupAssembledText.trim() : '';
  const coreArt = next.state.coreArtifact as
    | { text?: string; metadata?: { assembledFromGroup?: boolean } }
    | undefined;
  const coreAssembled =
    coreArt?.metadata?.assembledFromGroup === true && typeof coreArt.text === 'string'
      ? coreArt.text.trim()
      : '';
  const finalArt = next.state.finalArtifact as { text?: string } | undefined;
  const finalText = typeof finalArt?.text === 'string' ? finalArt.text.trim() : '';
  const coreText = typeof coreArt?.text === 'string' ? coreArt.text.trim() : '';
  const finalLooksLikeExpertJson =
    finalText.startsWith('{') &&
    (finalText.includes('"body_sections"') ||
      finalText.includes('"evidence_refs"') ||
      finalText.includes('"analysis_beats"'));
  const coreLooksLikeArticle =
    !!coreText &&
    !coreText.startsWith('{') &&
    (/^#\s/m.test(coreText) || coreText.includes('\n## '));
  const textRaw =
    groupAssembled ||
    coreAssembled ||
    (finalText && !(finalLooksLikeExpertJson && coreLooksLikeArticle) ? finalText : '') ||
    coreText ||
    '';
  if (!textRaw.trim()) {
    throw new Error('mxm-warp output 未产出文本');
  }

  const text = assertCleanWritingManuscript(textRaw, 'mxm-warp 成稿');

  return { ctx: next, text, usageBag };
}

export function contractSnapshotFromCtx(ctx: TaskContext): Record<string, unknown> | null {
  const c = getContract(ctx);
  return c ? (c as unknown as Record<string, unknown>) : null;
}
