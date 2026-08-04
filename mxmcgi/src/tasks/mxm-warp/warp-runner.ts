/**
 * mxm-warp 五段执行器：pre → input → enrich → output → post
 * pre/enrich 遇 interactiveCard / manualReview 可暂停；用 warpCursor 续跑。
 */
import type { JsonSchemaV2, PipelineStep, TaskContext, TaskTemplate } from '../types';
import {
  getContract,
  runInputAssembleOnly,
  runInputStage,
  type WarpLlmFn,
  withContract,
  enrichPipelineNeedsSearchPlan,
} from './input-stage';
import { runOutputStage } from './output-stage';
import {
  composeSkillSystemFromPack,
  resolveSkillPackFromTemplateExtra,
  runOutputSkillStage,
} from '../skill';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';
import { resolveWarpShape } from './unit-series';
import type { ReviewDraftPayload } from '../manual-review-types';
import { resolveGateId, type ManualReviewGateInfo } from '../manual-review-types';
import {
  buildWarpProgressUpdate,
  messageForPipelineStep,
  type WarpProgressReporter,
} from './warp-progress';
import { putEvidence, slimWebSearchForContract } from './evidence';

/** groupOutput.assemble 须继承根级 itemsFrom，避免默认读 seek 的 variants */
export function resolveGroupOutputAssembleParams(
  groupOutput: Record<string, unknown>
): { batchParams: Record<string, unknown>; assembleParams: Record<string, unknown> } {
  const batchParams: Record<string, unknown> = { ...groupOutput };
  const assembleRaw =
    batchParams.assemble &&
    typeof batchParams.assemble === 'object' &&
    !Array.isArray(batchParams.assemble)
      ? (batchParams.assemble as Record<string, unknown>)
      : {};
  delete batchParams.assemble;
  const manuscriptField =
    batchParams.itemManuscript &&
    typeof batchParams.itemManuscript === 'object' &&
    !Array.isArray(batchParams.itemManuscript)
      ? String((batchParams.itemManuscript as { field?: unknown }).field ?? '').trim()
      : '';
  const assembleParams: Record<string, unknown> = {
    itemsFrom: batchParams.itemsFrom ?? 'contract.business.variants',
    ...(manuscriptField ? { textField: manuscriptField } : {}),
    ...assembleRaw,
  };
  if (!String(assembleParams.itemsFrom ?? '').trim()) {
    assembleParams.itemsFrom = 'contract.business.variants';
  }
  return { batchParams, assembleParams };
}

export interface MxmWarpPipeline {
  pre?: PipelineStep[];
  enrich?: PipelineStep[];
  post?: PipelineStep[];
}

export type WarpCursor =
  | { phase: 'pre'; stepIndex: number }
  | { phase: 'input' }
  | { phase: 'enrich'; stepIndex: number }
  | { phase: 'output' };

export function isMxmWarpExecution(template: TaskTemplate, rowExtra?: Record<string, unknown> | null): boolean {
  const fromTpl = (template.extra as Record<string, unknown> | undefined)?.executionMode;
  const fromRow = rowExtra?.executionMode;
  return fromTpl === 'mxm-warp' || fromRow === 'mxm-warp';
}

export function readWarpPipeline(template: TaskTemplate): MxmWarpPipeline {
  const p = template.pipeline as MxmWarpPipeline | undefined;
  return {
    pre: p?.pre ?? [],
    enrich: p?.enrich ?? [],
    post: p?.post ?? [],
  };
}

export function readContractSchema(template: TaskTemplate): JsonSchemaV2 | undefined {
  return template.contractSchema;
}

const LIGHT_PIPELINE_STEPS = new Set([
  'noop',
  'sensitiveCheck',
  'knowledgeRetrieve',
  'webSearch',
  'interactiveCard',
  'manualReview',
  'pickMainTopic',
  'pruneToSelection',
  'extractHotTopics',
]);

function isGateStep(step: PipelineStep): boolean {
  return step.step === 'manualReview' || step.step === 'interactiveCard';
}

function readCompletedGateIds(ctx: TaskContext): Set<string> {
  const cp = ctx.state.reviewCheckpoint as { completedGateIds?: string[] } | undefined;
  return new Set(Array.isArray(cp?.completedGateIds) ? cp!.completedGateIds! : []);
}

function readCursor(ctx: TaskContext): WarpCursor {
  const c = ctx.state.warpCursor as WarpCursor | undefined;
  if (c && typeof c === 'object' && c.phase) return c;
  return { phase: 'pre', stepIndex: 0 };
}

async function runPhaseStepByStep(
  ctx: TaskContext,
  steps: PipelineStep[] | undefined,
  phase: 'pre' | 'enrich',
  startIndex: number,
  onProgress?: WarpProgressReporter,
  onPipelineCheckpoint?: (ctx: TaskContext) => void | Promise<void>
): Promise<TaskContext> {
  if (!steps?.length) return ctx;

  const { runInputPipeline } = await import('../pipeline-registry');
  await import('../pipeline');
  const { registerWarpWebSearchStep } = await import('./web-search-step');
  registerWarpWebSearchStep();
  const { registerEntityDiveStep } = await import('./entity-dive-step');
  registerEntityDiveStep();
  const { registerExtractHotTopicsStep } = await import('./extract-hot-topics-step');
  registerExtractHotTopicsStep();
  const { registerPruneToSelectionStep } = await import('./prune-to-selection-step');
  registerPruneToSelectionStep();
  const { registerDomainDataQueryStep } = await import('./domain-data-query-step');
  registerDomainDataQueryStep();
  const { registerExpandSeekVariantsStep } = await import('./expand-seek-variants-step');
  registerExpandSeekVariantsStep();
  const { registerInjectWritingVoiceStep } = await import('./inject-writing-voice-step');
  registerInjectWritingVoiceStep();
  await import('../business-pipeline-steps');
  const { registerMapSectionsStep } = await import('./map-sections-step');
  registerMapSectionsStep();

  const { appendSkippedPipelineTrace, shouldRunPipelineStep } = await import('../pipeline-step-when');
  const completed = readCompletedGateIds(ctx);

  let cur = ctx;
  for (let stepIndex = startIndex; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!;
    if (!shouldRunPipelineStep(cur, step)) {
      cur = appendSkippedPipelineTrace(cur, step, phase);
      if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
      continue;
    }
    if (isGateStep(step)) {
      const gid = resolveGateId(step, phase, stepIndex);
      if (completed.has(gid)) {
        cur = appendSkippedPipelineTrace(cur, step, phase);
        if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
        continue;
      }
    }
    if (onProgress) {
      await onProgress(
        buildWarpProgressUpdate({
          phase,
          message: messageForPipelineStep(step),
          stepIndex,
          stepTotal: steps.length,
        })
      );
    }
    const withIndex: PipelineStep = {
      ...step,
      params: { ...(step.params ?? {}), _stepIndex: stepIndex, phase },
    };
    const started = Date.now();
    const before = cur;
    try {
      cur = await runInputPipeline(cur, [withIndex]);
    } catch (stepErr) {
      const { appendFailedPipelineStepTrace } = await import('../pipeline-trace');
      cur = appendFailedPipelineStepTrace(before, {
        step: withIndex,
        phase,
        startedAt: started,
        error: stepErr,
      });
      if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
      throw stepErr;
    }
    if (!cur.state.__pendingManualReviewDraft) {
      const { finalizePipelineStepTrace } = await import('../pipeline-trace');
      cur = finalizePipelineStepTrace(before, cur, {
        step: withIndex,
        phase,
        startedAt: started,
      });
      if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
    }
    if (cur.state.__pendingManualReviewDraft) {
      const draft = cur.state.__pendingManualReviewDraft as ReviewDraftPayload;
      const gate: ManualReviewGateInfo = {
        gateId: draft.gateId || resolveGateId(step, phase, stepIndex),
        phase,
        stepIndex,
        kind: draft.kind,
        label: draft.label,
        hint: draft.hint,
      };
      const nextCursor: WarpCursor =
        stepIndex + 1 < steps.length
          ? { phase, stepIndex: stepIndex + 1 }
          : phase === 'pre'
            ? { phase: 'input' }
            : { phase: 'output' };
      // 闸门前先落盘已完成步的 trace，供 Admin 监控室立刻看见
      if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
      return {
        ...cur,
        state: {
          ...cur.state,
          warpAwaitingUserGate: true,
          warpAwaitingEnrichReview: phase === 'enrich',
          warpCursor: nextCursor,
          __warpReviewGate: gate,
          __pendingManualReviewDraft: { ...draft, gateId: gate.gateId, phase },
        },
      };
    }
  }
  return {
    ...cur,
    state: {
      ...cur.state,
      warpCursor: phase === 'pre' ? { phase: 'input' } : { phase: 'output' },
    },
  };
}

async function runPostPhase(
  ctx: TaskContext,
  steps: PipelineStep[] | undefined,
  onProgress?: WarpProgressReporter,
  onPipelineCheckpoint?: (ctx: TaskContext) => void | Promise<void>
): Promise<TaskContext> {
  if (!steps?.length) return ctx;
  const { runOutputPipeline } = await import('../pipeline-registry');
  await import('../pipeline');
  const { registerWarpWebSearchStep } = await import('./web-search-step');
  registerWarpWebSearchStep();
  const { registerEntityDiveStep } = await import('./entity-dive-step');
  registerEntityDiveStep();
  const { registerExtractHotTopicsStep } = await import('./extract-hot-topics-step');
  registerExtractHotTopicsStep();
  const { registerPruneToSelectionStep } = await import('./prune-to-selection-step');
  registerPruneToSelectionStep();
  const needsHeavy = steps.some((s) => !LIGHT_PIPELINE_STEPS.has(String(s.step || '')));
  if (needsHeavy) {
    const { registerDomainDataQueryStep } = await import('./domain-data-query-step');
    registerDomainDataQueryStep();
    const { registerExpandSeekVariantsStep } = await import('./expand-seek-variants-step');
    registerExpandSeekVariantsStep();
    await import('../business-pipeline-steps');
    const { registerMapSectionsStep } = await import('./map-sections-step');
    registerMapSectionsStep();
  }
  const { appendSkippedPipelineTrace, shouldRunPipelineStep } = await import('../pipeline-step-when');
  const runnable: PipelineStep[] = [];
  let cur = ctx;
  for (const step of steps) {
    if (!shouldRunPipelineStep(cur, step)) {
      cur = appendSkippedPipelineTrace(cur, step, 'post');
      if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
      continue;
    }
    runnable.push(step);
  }
  if (!runnable.length) return cur;

  // 逐步执行以便上报进度（避免整段 post 黑盒）
  for (let i = 0; i < runnable.length; i++) {
    const step = runnable[i]!;
    if (onProgress) {
      await onProgress(
        buildWarpProgressUpdate({
          phase: 'post',
          message: messageForPipelineStep(step),
          stepIndex: i,
          stepTotal: runnable.length,
        })
      );
    }
    const started = Date.now();
    const before = cur;
    try {
      cur = await runOutputPipeline(cur, [step]);
    } catch (stepErr) {
      const { appendFailedPipelineStepTrace } = await import('../pipeline-trace');
      cur = appendFailedPipelineStepTrace(before, {
        step,
        phase: 'post',
        startedAt: started,
        error: stepErr,
      });
      if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
      throw stepErr;
    }
    const { finalizePipelineStepTrace } = await import('../pipeline-trace');
    cur = finalizePipelineStepTrace(before, cur, {
      step,
      phase: 'post',
      startedAt: started,
    });
    if (onPipelineCheckpoint) await onPipelineCheckpoint(cur);
  }
  return cur;
}

function ensureSeedContract(ctx: TaskContext): TaskContext {
  let next = ctx;
  if (!getContract(ctx)) {
    next = withContract(
      ctx,
      emptyContract({
        version: MXM_WARP_CONTRACT_VERSION,
        scope: ctx.scope,
        taskKey: ctx.taskKey,
        subtype: ctx.subtype ?? null,
        taskId: ctx.taskId || '',
      })
    );
  }
  // C 端 pre 预览：允许 params.sources.websource 在 pre 阶段即可被 webSearch 跳过逻辑看到
  const sourcesFromParams =
    ctx.params.sources && typeof ctx.params.sources === 'object' && !Array.isArray(ctx.params.sources)
      ? (ctx.params.sources as Record<string, unknown>)
      : null;
  if (!sourcesFromParams) return next;
  const contract = getContract(next)!;
  const ws = sourcesFromParams.websource;
  let mergedSources: Record<string, unknown> = {
    ...(contract.sources && typeof contract.sources === 'object'
      ? (contract.sources as Record<string, unknown>)
      : {}),
    ...sourcesFromParams,
  };
  if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
    const payload = ws as Record<string, unknown>;
    next = putEvidence(next, 'websource', payload);
    mergedSources = {
      ...mergedSources,
      websource: slimWebSearchForContract(payload, 'websource'),
    };
  }
  return withContract(next, {
    ...contract,
    sources: mergedSources,
  });
}

export interface RunMxmWarpArgs {
  ctx: TaskContext;
  template: TaskTemplate;
  inputLlm?: WarpLlmFn;
  outputLlm: WarpLlmFn;
  /** @deprecated 使用 state.warpCursor；output 表示直接从成文续跑 */
  resumeAt?: 'start' | 'output';
  onProgress?: WarpProgressReporter;
  onPipelineCheckpoint?: (ctx: TaskContext) => void | Promise<void>;
}

export async function runMxmWarp(args: RunMxmWarpArgs): Promise<TaskContext> {
  const { template, outputLlm, inputLlm, onProgress, onPipelineCheckpoint } = args;
  let ctx = ensureSeedContract(args.ctx);
  const pipeline = readWarpPipeline(template);
  const contractSchema = readContractSchema(template);

  if (!contractSchema) {
    throw new Error('mxm-warp 需要 taskTemplate.contractSchema');
  }

  const shape = resolveWarpShape(ctx.scope, ctx.taskKey);
  ctx = {
    ...ctx,
    state: {
      ...ctx.state,
      warpShape: shape,
      _formSchema: template.formSchema,
      _contractSchema: contractSchema,
      warpAwaitingUserGate: false,
      warpAwaitingEnrichReview: false,
      _inputLlm: inputLlm,
      _outputLlm: outputLlm,
    },
  };

  // pre 检索前必须先把 params（topic 等）落入 contract.basic，否则 ${contract.basic.topic} 为空会跑偏
  ctx = runInputAssembleOnly(ctx, contractSchema);

  let cursor: WarpCursor =
    args.resumeAt === 'output' ? { phase: 'output' } : readCursor(ctx);

  // 清暂停草稿标记（续跑时）
  {
    const { __pendingManualReviewDraft: _a, __warpReviewGate: _b, ...rest } = ctx.state as Record<
      string,
      unknown
    >;
    ctx = { ...ctx, state: { ...rest } };
  }

  if (cursor.phase === 'pre') {
    if (onProgress) {
      await onProgress(buildWarpProgressUpdate({ phase: 'pre', message: '检索资讯中…' }));
    }
    ctx = await runPhaseStepByStep(
      ctx,
      pipeline.pre,
      'pre',
      cursor.stepIndex ?? 0,
      onProgress,
      onPipelineCheckpoint
    );
    if (ctx.state.warpAwaitingUserGate) return ctx;
    cursor = (ctx.state.warpCursor as WarpCursor) ?? { phase: 'input' };
  }

  if (cursor.phase === 'input') {
    if (onProgress) {
      await onProgress(buildWarpProgressUpdate({ phase: 'input' }));
    }
    const inputStarted = Date.now();
    try {
      ctx = await runInputStage({
        ctx,
        contractSchema,
        llm: inputLlm,
        requireEnrichSearchPlan: enrichPipelineNeedsSearchPlan(pipeline.enrich),
      });
    } catch (inputErr) {
      const { appendPipelineTraceEntry } = await import('../pipeline-trace');
      const { isAdminPipelineDebug, snapshotForTrace } = await import('./evidence');
      const msg = inputErr instanceof Error ? inputErr.message : String(inputErr);
      const entry: import('../types').PipelineTraceEntry = {
        step: 'inputStage',
        durationMs: Math.max(0, Date.now() - inputStarted),
        phase: 'input',
        ok: false,
        error: msg,
        label: 'input/LLM',
      };
      if (isAdminPipelineDebug(ctx)) {
        entry.outputSnapshot = snapshotForTrace({ error: msg }, 512_000);
      }
      ctx = appendPipelineTraceEntry(ctx, entry);
      if (onPipelineCheckpoint) await onPipelineCheckpoint(ctx);
      throw inputErr;
    }
    cursor = { phase: 'enrich', stepIndex: 0 };
    ctx = { ...ctx, state: { ...ctx.state, warpCursor: cursor } };
  }

  if (cursor.phase === 'enrich') {
    if (onProgress) {
      await onProgress(buildWarpProgressUpdate({ phase: 'enrich', message: '深挖补充中…' }));
    }
    const start = typeof cursor.stepIndex === 'number' ? cursor.stepIndex : 0;
    ctx = await runPhaseStepByStep(
      ctx,
      pipeline.enrich,
      'enrich',
      start,
      onProgress,
      onPipelineCheckpoint
    );
    if (ctx.state.warpAwaitingUserGate) return ctx;
    cursor = { phase: 'output' };
    ctx = { ...ctx, state: { ...ctx.state, warpCursor: cursor } };
  }

  if (onProgress) {
    await onProgress(buildWarpProgressUpdate({ phase: 'output' }));
  }
  const templateExtra = (template.extra as Record<string, unknown> | undefined) ?? {};
  const groupOutput =
    templateExtra.groupOutput &&
    typeof templateExtra.groupOutput === 'object' &&
    !Array.isArray(templateExtra.groupOutput)
      ? (templateExtra.groupOutput as Record<string, unknown>)
      : null;

  const skillPack = resolveSkillPackFromTemplateExtra(templateExtra);

  // group 业务：output 阶段并发成稿（对齐图集 post.albumImageBatch，但落在「成稿」段）
  if (groupOutput) {
    await import('../business-pipeline-steps');
    const { runGroupItemBatchStep } = await import('../group-item-batch-step');
    const { runAssembleGroupTextStep } = await import('../assemble-group-text-step');
    const { batchParams, assembleParams } = resolveGroupOutputAssembleParams(groupOutput);
    // Core Skill：执笔规范 = SKILL.md + references（以 compose 为准）
    if (skillPack) {
      const skillSystem = composeSkillSystemFromPack({ pack: skillPack, ctx });
      if (skillSystem.trim()) {
        const prevMs =
          batchParams.itemManuscript &&
          typeof batchParams.itemManuscript === 'object' &&
          !Array.isArray(batchParams.itemManuscript)
            ? (batchParams.itemManuscript as Record<string, unknown>)
            : {};
        batchParams.itemManuscript = {
          ...prevMs,
          field: String(prevMs.field ?? 'manuscript').trim() || 'manuscript',
          systemPrompt: skillSystem,
        };
      }
    }
    if (onProgress) {
      await onProgress(
        buildWarpProgressUpdate({
          phase: 'output',
          message: '并发撰写多路文稿…',
          stepIndex: 0,
          stepTotal: 2,
        })
      );
    }
    ctx = await runGroupItemBatchStep(ctx, { step: 'groupItemBatch', params: batchParams });
    if (onProgress) {
      await onProgress(
        buildWarpProgressUpdate({
          phase: 'output',
          message: '汇编多路成稿集合…',
          stepIndex: 1,
          stepTotal: 2,
        })
      );
    }
    ctx = await runAssembleGroupTextStep(ctx, {
      step: 'assembleGroupText',
      params: assembleParams,
    });
    const assembled =
      typeof ctx.state.groupAssembledText === 'string' ? ctx.state.groupAssembledText.trim() : '';
    if (!assembled) {
      throw new Error('mxm-warp：groupOutput 未产出 groupAssembledText');
    }
    const prevMeta =
      ctx.state.coreArtifact &&
      typeof ctx.state.coreArtifact === 'object' &&
      (ctx.state.coreArtifact as { metadata?: unknown }).metadata &&
      typeof (ctx.state.coreArtifact as { metadata?: unknown }).metadata === 'object'
        ? ((ctx.state.coreArtifact as { metadata: Record<string, unknown> }).metadata)
        : {};
    ctx = {
      ...ctx,
      state: {
        ...ctx.state,
        coreArtifact: {
          kind: 'text',
          text: assembled,
          metadata: {
            mxmWarp: true,
            assembledFromGroup: true,
            ...(skillPack ? { coreSkill: true } : {}),
            ...prevMeta,
          },
        },
        // nestedText（变体导演）会把策划 JSON 写进 finalArtifact；成稿后必须覆盖，否则落库 text 仍是 JSON
        finalArtifact: {
          kind: 'text',
          text: assembled,
          metadata: {
            mxmWarp: true,
            assembledFromGroup: true,
            ...(skillPack ? { coreSkill: true } : {}),
            ...prevMeta,
          },
        },
        finalPrompt: skillPack ? '(group-output-core-skill)' : '(group-output)',
        warpOutputRaw: assembled,
      },
    };
  } else {
    const outputStarted = Date.now();
    try {
      const skipOutputLlm =
        templateExtra.skipOutputLlm === true || Boolean(ctx.state.groupAssembledText);
      if (skipOutputLlm) {
        const fromGroup =
          typeof ctx.state.groupAssembledText === 'string' ? ctx.state.groupAssembledText.trim() : '';
        const coreExisting = ctx.state.coreArtifact as { text?: string; metadata?: unknown } | undefined;
        const fromCore =
          typeof coreExisting?.text === 'string' && coreExisting.text.trim() ? coreExisting.text.trim() : '';
        // audio 等媒体：enrich.transform 已写入 coreArtifact，无需 group 汇编
        const assembled = fromGroup || fromCore;
        if (!assembled) {
          throw new Error(
            'mxm-warp：skipOutputLlm 但缺少 state.groupAssembledText / coreArtifact.text（请先 enrich 成稿或 assembleGroupText）'
          );
        }
        const prevMeta =
          coreExisting?.metadata && typeof coreExisting.metadata === 'object'
            ? (coreExisting.metadata as Record<string, unknown>)
            : {};
        const meta = fromGroup
          ? { mxmWarp: true, assembledFromGroup: true, ...(skillPack ? { coreSkill: true } : {}), ...prevMeta }
          : { mxmWarp: true, skipOutputLlm: true, ...(skillPack ? { coreSkill: true } : {}), ...prevMeta };
        ctx = {
          ...ctx,
          state: {
            ...ctx.state,
            coreArtifact: {
              kind: 'text',
              text: assembled,
              metadata: meta,
            },
            finalArtifact: {
              kind: 'text',
              text: assembled,
              metadata: meta,
            },
            finalPrompt: fromGroup ? '(assembled)' : assembled,
            warpOutputRaw: assembled,
          },
        };
      } else if (skillPack) {
        ctx = await runOutputSkillStage({ ctx, pack: skillPack, llm: outputLlm });
      } else {
        const outputPrompt =
          typeof template.prompt?.unifiedTemplate === 'string' ? template.prompt.unifiedTemplate : '';
        ctx = await runOutputStage({ ctx, outputPrompt, llm: outputLlm });
      }
    } catch (outputErr) {
      const { appendPipelineTraceEntry } = await import('../pipeline-trace');
      const { isAdminPipelineDebug, snapshotForTrace } = await import('./evidence');
      const msg = outputErr instanceof Error ? outputErr.message : String(outputErr);
      const entry: import('../types').PipelineTraceEntry = {
        step: 'outputStage',
        durationMs: Math.max(0, Date.now() - outputStarted),
        phase: 'output',
        ok: false,
        error: msg,
        label: 'output/LLM',
      };
      if (isAdminPipelineDebug(ctx)) {
        entry.outputSnapshot = snapshotForTrace({ error: msg }, 512_000);
      }
      ctx = appendPipelineTraceEntry(ctx, entry);
      if (onPipelineCheckpoint) await onPipelineCheckpoint(ctx);
      throw outputErr;
    }
  }
  ctx = await runPostPhase(ctx, pipeline.post, onProgress, onPipelineCheckpoint);
  ctx = {
    ...ctx,
    state: {
      ...ctx.state,
      warpCursor: { phase: 'output' },
      warpAwaitingUserGate: false,
      warpAwaitingEnrichReview: false,
    },
  };
  return ctx;
}
