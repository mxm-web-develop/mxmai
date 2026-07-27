import { isGridQaEnabled, isGridPixelQaBlockDelivery, TEXT_FORMAT_STRUCTURE_LOCK } from './grid-config';
import { isMultiCellGrid } from './grid-contract';
import { buildGridPromptPlan } from './grid-prompt-plan';
import { buildContactSheetBriefing } from './grid-prompt-assemble';
import type { ApplyGridPipelineResult, GridPromptPlan } from './types';

export * from './types';
export * from './grid-config';
export { TEXT_FORMAT_STRUCTURE_LOCK } from './grid-config';
export * from './grid-contract';
export { buildGridPromptPlan } from './grid-prompt-plan';
export { validateFormatPreservedPanels, buildContactSheetBriefing } from './grid-prompt-assemble';
export { evaluatePixelSimilarity } from './grid-pixel-similarity';
export { parseOutputGrid, isMultiCellGrid } from './grid-contract';
export { isGridPixelQaBlockDelivery } from './grid-config';

export interface ApplyGridPromptPipelineArgs {
  params: Record<string, unknown>;
  formSchema?: { properties?: Record<string, unknown> };
  effectiveUserPrompt: string;
  parentTaskId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 宫格任务：构建 GridPromptPlan 与 contact sheet briefing；1x1 或 QA 关闭时返回 null
 */
export async function applyGridPromptPipelineIfNeeded(
  args: ApplyGridPromptPipelineArgs
): Promise<ApplyGridPipelineResult | null> {
  if (!isGridQaEnabled()) return null;
  if (!isMultiCellGrid(args.params)) return null;

  const plan = await buildGridPromptPlan({
    params: args.params,
    formSchema: args.formSchema,
    effectiveUserPrompt: args.effectiveUserPrompt,
    metadata: args.metadata,
  });
  if (!plan) return null;

  return {
    plan,
    contactSheetBriefing: buildContactSheetBriefing(plan),
  };
}

export function wrapPromptGenerationRequestWithGrid(
  promptGenerationRequest: string,
  gridBriefing: string
): string {
  return [
    gridBriefing,
    '',
    '[ORIGINAL_BRIEFING_FOR_CONTEXT]',
    promptGenerationRequest,
    '[/ORIGINAL_BRIEFING_FOR_CONTEXT]',
  ].join('\n');
}

export function applyPixelQaDeliveryPolicy(qa: import('./types').GridPixelQaResult): import('./types').GridPixelQaResult {
  if (qa.passed) return { ...qa, delivery: 'ok' };
  if (isGridPixelQaBlockDelivery()) {
    return { ...qa, delivery: 'blocked' };
  }
  return { ...qa, delivery: 'warning' };
}

export type { GridPromptPlan };
