/**
 * mxm-warp output：业务 Prompt + 完整合同（不插值、不压缩）
 */
import type { TaskContext } from '../types';
import { getContract, type WarpLlmFn } from './input-stage';

export async function runOutputStage(args: {
  ctx: TaskContext;
  /** 业务 output Prompt（角色 / 业务 / 交付规范） */
  outputPrompt: string;
  llm: WarpLlmFn;
}): Promise<TaskContext> {
  const contract = getContract(args.ctx);
  if (!contract) {
    throw new Error('mxm-warp output：缺少 state.contract');
  }

  const system = [
    args.outputPrompt.trim() || 'You produce the final deliverable for this business.',
    '',
    'The filled business contract JSON below is the sole factual basis.',
    'Deliver exactly the scope planned by the business prompt and the contract (e.g. business.body_sections / user-selected fields).',
    'enrich_search and sources are supporting evidence for that planned scope — do NOT surface source items outside it as extra chapters, paragraphs, or lead mentions.',
  ].join('\n');

  const user = JSON.stringify({ contract }, null, 2);
  const text = await args.llm({ system, user, ctx: args.ctx });

  return {
    ...args.ctx,
    state: {
      ...args.ctx.state,
      coreArtifact: {
        kind: 'text',
        text,
        metadata: { mxmWarp: true },
      },
      finalPrompt: system,
      warpOutputRaw: text,
    },
  };
}
