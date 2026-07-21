/**
 * 在已有 TaskContext / TaskTemplate 上跑完整 mxm-warp，并带回用量袋
 */
import type { ModelScope } from '../../models/types';
import type { TaskContext, TaskTemplate } from '../types';
import { createWarpLlmAdapter, type WarpLlmUsageBag } from './llm-adapter';
import { getContract } from './input-stage';
import { isMxmWarpExecution, runMxmWarp } from './warp-runner';

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
  /** false 时跳过 input LLM（仅组装） */
  runInputLlm?: boolean;
}): Promise<{
  ctx: TaskContext;
  text: string;
  usageBag: WarpLlmUsageBag;
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
  });

  const artifact = next.state.coreArtifact as { text?: string } | undefined;
  const text = typeof artifact?.text === 'string' ? artifact.text : '';
  if (!text.trim()) {
    throw new Error('mxm-warp output 未产出文本');
  }

  return { ctx: next, text, usageBag };
}

export function contractSnapshotFromCtx(ctx: TaskContext): Record<string, unknown> | null {
  const c = getContract(ctx);
  return c ? (c as unknown as Record<string, unknown>) : null;
}
