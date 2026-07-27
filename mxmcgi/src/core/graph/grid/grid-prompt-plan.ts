import {
  buildFrozenUserContract,
  hashFrozenParams,
  parseOutputGrid,
  readParallelIndex,
} from './grid-contract';
import { resolveGridSeamAppendEn } from './grid-enum-prompt-append';
import { pickScriptsForGrid } from './grid-pose-scripts';
import {
  assembleContactSheetPromptEn,
  buildSharedBlockEn,
} from './grid-prompt-assemble';
import {
  evaluateTextSimilarity,
  evaluateTextSimilarityWithEmbedding,
} from './grid-prompt-similarity';
import {
  gridTextQaMaxRetries,
  isGridEmbeddingQaEnabled,
  isGridPlannerEnabled,
} from './grid-config';
import type { GridCellPlan, GridPromptPlan } from './types';

export async function buildGridPromptPlan(args: {
  params: Record<string, unknown>;
  formSchema?: { properties?: Record<string, unknown> };
  effectiveUserPrompt: string;
  parallelIndex?: number;
  metadata?: Record<string, unknown>;
}): Promise<GridPromptPlan | null> {
  const parsed = parseOutputGrid(args.params.output_grid);
  if (!parsed || parsed.gridN <= 1) return null;

  const fuc = buildFrozenUserContract(args.params);
  const frozenParamsHash = hashFrozenParams(fuc);
  const parallelIndex =
    args.parallelIndex ?? readParallelIndex(args.params, args.metadata);

  const seamAppendEn = resolveGridSeamAppendEn({
    formSchema: args.formSchema,
    presetValue: args.params.grid_cell_constraint_preset,
    gridN: parsed.gridN,
    totalCells: parsed.totalCells,
  });

  const aspectRatio =
    typeof args.params.aspect_ratio === 'string' ? args.params.aspect_ratio : undefined;

  const sharedBlockEn = buildSharedBlockEn({
    effectiveUserPrompt: args.effectiveUserPrompt,
    aspectRatio,
    outputGrid: parsed.outputGrid,
  });

  let retries = 0;
  const maxRetries = gridTextQaMaxRetries();
  let cells: GridCellPlan[] = [];
  let textQa = { passed: false, retries: 0, conflicts: [] as GridPromptPlan['textQa']['conflicts'] };

  while (retries <= maxRetries) {
    if (isGridPlannerEnabled()) {
      cells = await buildCellsViaPlanner({
        parsed,
        fuc,
        sharedBlockEn,
        parallelIndex,
        formSchema: args.formSchema,
        retryOffset: retries,
      });
    } else {
      cells = buildCellsFromScripts({
        parsed,
        parallelIndex,
        formSchema: args.formSchema,
        retryOffset: retries,
      });
    }

    const qa = isGridEmbeddingQaEnabled()
      ? await evaluateTextSimilarityWithEmbedding(cells, fuc)
      : evaluateTextSimilarity(cells, fuc);

    textQa = {
      passed: qa.passed,
      retries,
      conflicts: qa.conflicts,
    };

    if (qa.passed) break;
    retries++;
  }

  if (!textQa.passed) {
    const { GraphPromptGenerationError } = await import('../graph-prompt-errors');
    throw new GraphPromptGenerationError(
      `宫格文案门禁未通过（${textQa.conflicts?.length ?? 0} 项冲突，已重试 ${textQa.retries} 次）。请调整脚本或关闭冲突格位后重试。`,
      {
        phase: 'prompt_generation',
        cause: 'grid_text_qa_failed',
      }
    );
  }

  const contactSheetPromptEn = assembleContactSheetPromptEn({
    gridN: parsed.gridN,
    totalCells: parsed.totalCells,
    outputGrid: parsed.outputGrid,
    aspectRatio,
    sharedBlockEn,
    cells,
    seamAppendEn,
  });

  return {
    gridN: parsed.gridN,
    totalCells: parsed.totalCells,
    outputGrid: parsed.outputGrid,
    frozenParamsHash,
    sharedBlockEn,
    cells,
    contactSheetPromptEn,
    textQa,
    seamAppendEn: seamAppendEn || undefined,
  };
}

function buildCellsFromScripts(args: {
  parsed: { gridN: number; totalCells: number; outputGrid: string };
  parallelIndex: number;
  formSchema?: { properties?: Record<string, unknown> };
  retryOffset: number;
}): GridCellPlan[] {
  const scripts = pickScriptsForGrid({
    outputGrid: args.parsed.outputGrid,
    totalCells: args.parsed.totalCells,
    parallelIndex: args.parallelIndex + args.retryOffset,
    formSchema: args.formSchema,
  });

  return scripts.map((entry, index) => {
    const row = Math.floor(index / args.parsed.gridN);
    const col = index % args.parsed.gridN;
    return {
      index,
      row,
      col,
      slots: entry.slots,
      directiveEn: entry.directiveEn,
    };
  });
}

async function buildCellsViaPlanner(args: {
  parsed: { gridN: number; totalCells: number; outputGrid: string };
  fuc: Record<string, unknown>;
  sharedBlockEn: string;
  parallelIndex: number;
  formSchema?: { properties?: Record<string, unknown> };
  retryOffset: number;
}): Promise<GridCellPlan[]> {
  const { runGraphInternalText } = await import('./run-graph-internal-text');
  const prompt = [
    'Output JSON only: { "cells": [{ "pose","framing","shotType","action","directiveEn" }] }',
    `Exactly ${args.parsed.totalCells} cells for ${args.parsed.outputGrid}.`,
    'Do NOT change scene, wardrobe, aspect ratio, or grid size from frozen contract.',
    `Frozen: ${JSON.stringify(args.fuc)}`,
    `Shared: ${args.sharedBlockEn.slice(0, 2000)}`,
    `parallelIndex=${args.parallelIndex + args.retryOffset}`,
  ].join('\n');

  const { text } = await runGraphInternalText({
    taskKey: 'grid-planner',
    subtype: 'internal',
    prompt,
    caller: 'graph-grid-planner',
  });

  try {
    const json = JSON.parse(text.replace(/^```json?\s*|\s*```$/gi, '').trim()) as {
      cells?: Array<{
        directiveEn?: string;
        pose?: string;
        framing?: string;
        shotType?: string;
        action?: string;
        lens?: string;
        slots?: GridCellPlan['slots'];
      }>;
    };
    const raw = json.cells ?? [];
    return raw.slice(0, args.parsed.totalCells).map((c, index) => {
      const row = Math.floor(index / args.parsed.gridN);
      const col = index % args.parsed.gridN;
      return {
        index,
        row,
        col,
        slots: {
          pose: String(c.pose ?? c.slots?.pose ?? 'custom'),
          framing: String(c.framing ?? c.slots?.framing ?? 'custom'),
          shotType: String(c.shotType ?? c.slots?.shotType ?? 'custom'),
          action: String(c.action ?? c.slots?.action ?? 'custom'),
          lens: c.lens ? String(c.lens) : c.slots?.lens,
        },
        directiveEn: String(c.directiveEn ?? '').trim(),
      };
    });
  } catch {
    return buildCellsFromScripts({
      parsed: args.parsed,
      parallelIndex: args.parallelIndex,
      formSchema: args.formSchema,
      retryOffset: args.retryOffset + 1,
    });
  }
}
