import type { CoreArtifact, PipelineStep, PipelineTraceEntry, TaskContext, TaskTemplate } from './types';
import { mergeEffectivePipeline } from './business-pipeline-defaults';
import { runInputPipeline, runOutputPipeline } from './pipeline-registry';
import {
  appendSkippedPipelineTrace,
  shouldRunPipelineStep,
} from './pipeline-step-when';
import './pipeline';
import './business-pipeline-steps';

const SINGLE_PIPELINE_PLACEHOLDER_RE = /^\$\{([^}]+)\}$/;

/** inputMapping 纯占位符（如 ${params.render_plan}）时保留原始类型（array/object/number），避免 stringify 后 schema 校验失败 */
export function resolvePipelineMappingValue(template: string, ctx: TaskContext): unknown {
  const trimmed = template.trim();
  const single = trimmed.match(SINGLE_PIPELINE_PLACEHOLDER_RE);
  if (single) {
    const path = single[1]!.trim();
    if (path.startsWith('params.')) {
      const key = path.slice('params.'.length);
      const v = (ctx.params as Record<string, unknown>)[key];
      return v ?? '';
    }
    if (path.startsWith('state.')) {
      const rest = path.slice('state.'.length);
      const dot = rest.indexOf('.');
      if (dot === -1) {
        const v = ctx.state[rest];
        return v ?? '';
      }
      const head = rest.slice(0, dot);
      const tail = rest.slice(dot + 1);
      let cur: unknown = ctx.state[head];
      for (const seg of tail.split('.')) {
        if (cur == null || typeof cur !== 'object') return '';
        cur = (cur as Record<string, unknown>)[seg];
      }
      return cur ?? '';
    }
    if (Object.prototype.hasOwnProperty.call(ctx.params, path)) {
      return ctx.params[path];
    }
    if (Object.prototype.hasOwnProperty.call(ctx.state, path)) {
      return ctx.state[path] ?? '';
    }
  }
  return interpolatePipelineTemplate(template, ctx);
}

export function interpolatePipelineTemplate(template: string, ctx: TaskContext): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, rawPath: string) => {
    const path = rawPath.trim();
    if (path.startsWith('params.')) {
      const key = path.slice('params.'.length);
      const v = ctx.params[key];
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    if (path.startsWith('state.')) {
      const rest = path.slice('state.'.length);
      const dot = rest.indexOf('.');
      if (dot === -1) {
        const v = ctx.state[rest];
        return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
      const head = rest.slice(0, dot);
      const tail = rest.slice(dot + 1);
      let cur: unknown = ctx.state[head];
      for (const seg of tail.split('.')) {
        if (cur == null || typeof cur !== 'object') return '';
        cur = (cur as Record<string, unknown>)[seg];
      }
      return cur == null ? '' : typeof cur === 'object' ? JSON.stringify(cur) : String(cur);
    }
    if (ctx.params[path] !== undefined) return String(ctx.params[path]);
    if (ctx.state[path] !== undefined) {
      const v = ctx.state[path];
      return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    }
    return '';
  });
}

function appendTrace(
  ctx: TaskContext,
  entry: Omit<PipelineTraceEntry, 'durationMs'> & { durationMs?: number }
): TaskContext {
  const trace = Array.isArray(ctx.state.pipelineTrace)
    ? [...(ctx.state.pipelineTrace as PipelineTraceEntry[])]
    : [];
  trace.push({
    step: entry.step,
    durationMs: entry.durationMs ?? 0,
    nestedTaskId: entry.nestedTaskId,
    costUsd: entry.costUsd,
    phase: entry.phase,
  });
  return { ...ctx, state: { ...ctx.state, pipelineTrace: trace } };
}

function mergeEnhancedPrompt(ctx: TaskContext): TaskContext {
  const stateFp =
    typeof ctx.state.finalPrompt === 'string' ? String(ctx.state.finalPrompt).trim() : '';
  const ep =
    typeof ctx.state.enhancedPrompt === 'string' ? String(ctx.state.enhancedPrompt).trim() : '';
  if (ep && !stateFp) {
    return { ...ctx, params: { ...ctx.params, prompt: ep } };
  }
  return ctx;
}

export async function runBusinessPrePipeline(
  ctx: TaskContext,
  template: TaskTemplate,
  scope: string
): Promise<TaskContext> {
  const { pre } = mergeEffectivePipeline(scope, template, (template.extra as Record<string, unknown>) ?? null);
  const runnable = pre.filter(
    (s) =>
      !(
        s.step === 'nestedText' &&
        (s.params?.graphPreFormat === true || s.params?.afterPromptRender === true)
      )
  );
  if (!runnable.length) return ctx;

  let next = {
    ...ctx,
    state: {
      ...ctx.state,
      _formSchema: template.formSchema,
      _contractSchema: template.contractSchema ?? template.formSchema,
    },
  };
  for (const step of runnable) {
    if (!shouldRunPipelineStep(next, step)) {
      next = appendSkippedPipelineTrace(next, step, 'pre');
      continue;
    }
    const started = Date.now();
    if (step.step === 'resolveContextFields') {
      const { resolveContextFields } = await import('./context-field-resolver');
      const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'pre';
      const kinds = step.params?.kinds as ('kbRecall' | 'webSearch')[] | undefined;
      next = await resolveContextFields(next, template.formSchema, { phase, kinds });
    } else if (step.step === 'resolveVoiceoverAudio') {
      const { runResolveVoiceoverAudioStep } = await import('./voiceover-audio-resolver');
      next = await runResolveVoiceoverAudioStep(next, step);
    } else if (step.step === 'transcribeVoiceoverAudio') {
      const { runTranscribeVoiceoverAudioStep } = await import('../core/audio/voiceover-asr-step');
      next = await runTranscribeVoiceoverAudioStep(next, step);
    } else if (step.step === 'buildVideoEditTimeline' || step.step === 'buildSciencePopTimeline') {
      const { runBuildVideoEditTimelineStep } = await import('./build-video-edit-timeline-step');
      next = await runBuildVideoEditTimelineStep(next, step);
    } else {
      const { runInputPipeline: runPre } = await import('./pipeline-registry');
      next = await runPre(next, [step]);
    }
    next = appendTrace(next, { step: step.step, durationMs: Date.now() - started, phase: 'pre' });
  }
  return mergeEnhancedPrompt(next);
}

/** graph：在 renderPrompt 之后执行 nestedText（使用 state.finalPrompt） */
export async function runBusinessPrePromptSteps(
  ctx: TaskContext,
  template: TaskTemplate,
  scope: string,
  finalPrompt: string
): Promise<TaskContext> {
  const { pre } = mergeEffectivePipeline(scope, template, (template.extra as Record<string, unknown>) ?? null);
  const promptSteps = pre.filter(
    (s) => s.step === 'nestedText' && (s.params?.graphPreFormat === true || s.params?.afterPromptRender === true)
  );
  if (!promptSteps.length) return { ...ctx, state: { ...ctx.state, finalPrompt } };

  let next: TaskContext = { ...ctx, state: { ...ctx.state, finalPrompt } };
  for (const step of promptSteps) {
    if (!shouldRunPipelineStep(next, step)) {
      next = appendSkippedPipelineTrace(next, step, 'pre');
      continue;
    }
    const started = Date.now();
    const { runNestedTextStep } = await import('./business-pipeline-steps');
    next = await runNestedTextStep(next, step);
    next = appendTrace(next, { step: step.step, durationMs: Date.now() - started, phase: 'pre' });
  }
  return next;
}

export function buildCoreArtifactFromResult(
  scope: string,
  result: { text?: string; mediaUrls?: string[]; metadata?: Record<string, unknown> }
): CoreArtifact {
  const meta = result.metadata ?? {};
  const text =
    (typeof result.text === 'string' && result.text.trim() ? result.text : undefined) ??
    (typeof meta.text === 'string' && meta.text.trim() ? meta.text : undefined);
  if (scope === 'graph' || scope === 'image') {
    return { kind: 'image', mediaUrls: result.mediaUrls, metadata: meta, text };
  }
  if (scope === 'video') return { kind: 'video', mediaUrls: result.mediaUrls, metadata: meta, text };
  if (scope === 'audio') return { kind: 'audio', mediaUrls: result.mediaUrls, metadata: meta, text };
  if (scope === 'music') return { kind: 'music', mediaUrls: result.mediaUrls, metadata: meta, text };
  return { kind: 'text', text: text ?? '', metadata: meta };
}

export async function runBusinessPostPipeline(
  ctx: TaskContext,
  template: TaskTemplate,
  scope: string
): Promise<TaskContext> {
  const { post } = mergeEffectivePipeline(scope, template, (template.extra as Record<string, unknown>) ?? null);
  if (!post.length) {
    const core = ctx.state.coreArtifact as CoreArtifact | undefined;
    if (core && !ctx.state.finalArtifact) {
      return { ...ctx, state: { ...ctx.state, finalArtifact: core } };
    }
    return ctx;
  }

  let next = ctx;
  if (!next.state.coreArtifact && !next.state.finalArtifact) {
    return next;
  }
  if (!next.state.finalArtifact) {
    next = { ...next, state: { ...next.state, finalArtifact: next.state.coreArtifact } };
  }

  for (const step of post) {
    if (!shouldRunPipelineStep(next, step)) {
      next = appendSkippedPipelineTrace(next, step, 'post');
      continue;
    }
    const started = Date.now();
    if (step.step === 'resolveContextFields') {
      const { resolveContextFields } = await import('./context-field-resolver');
      const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'post';
      const kinds = step.params?.kinds as ('kbRecall' | 'webSearch')[] | undefined;
      next = await resolveContextFields(next, template.formSchema, { phase, kinds });
    } else if (step.step === 'nestedText') {
      const { runNestedTextStep } = await import('./business-pipeline-steps');
      next = await runNestedTextStep(next, step);
    } else if (step.step === 'polishManuscript') {
      const { runPolishManuscriptStep } = await import('./business-pipeline-steps');
      next = await runPolishManuscriptStep(next, step);
    } else if (step.step === 'nestedVideo' || step.step === 'videoTimelineRender') {
      const { runNestedVideoStep } = await import('./business-pipeline-steps');
      next = await runNestedVideoStep(next, step);
    } else if (step.step === 'renderDocumentPdf') {
      const { runRenderDocumentPdfStep } = await import('../core/document-render/render-document-pdf-step');
      next = await runRenderDocumentPdfStep(next, step);
    } else if (step.step === 'albumImageBatch') {
      const { runAlbumImageBatchStep } = await import('../core/graph/album/album-image-batch-step');
      next = await runAlbumImageBatchStep(next, step);
    } else {
      next = await runOutputPipeline(next, [step]);
    }
    next = appendTrace(next, { step: step.step, durationMs: Date.now() - started, phase: 'post' });
  }
  return next;
}

export function applyFinalArtifactToGenerateResult(
  artifact: CoreArtifact | undefined,
  result: { text?: string; mediaUrls?: string[]; metadata?: Record<string, unknown> }
): { text?: string; mediaUrls?: string[]; metadata?: Record<string, unknown> } {
  if (!artifact) return result;
  const metadata = { ...(result.metadata ?? {}), ...(artifact.metadata ?? {}) };
  if (artifact.kind === 'text' && typeof artifact.text === 'string') {
    metadata.text = artifact.text;
    return { ...result, text: artifact.text, metadata };
  }
  if (artifact.mediaUrls?.length) {
    return { ...result, mediaUrls: artifact.mediaUrls, metadata };
  }
  return { ...result, metadata };
}

export function parseNestedVideoTaskKey(nestedVideoTaskKey: string): {
  scope: string;
  taskKey: string;
  subtype: string | null;
} {
  const parts = nestedVideoTaskKey.split("/").filter(Boolean);
  if (parts[0] !== "video" || !parts[1]) {
    throw new Error(`nestedVideoTaskKey 必须以 video/ 开头：${nestedVideoTaskKey}`);
  }
  return {
    scope: "video",
    taskKey: parts[1],
    subtype: parts.length > 2 ? parts.slice(2).join("/") : null,
  };
}

export function parseNestedTextTaskKey(nestedTextTaskKey: string): {
  scope: string;
  taskKey: string;
  subtype: string | null;
} {
  const parts = nestedTextTaskKey.split('/').filter(Boolean);
  if (parts[0] !== 'text' || !parts[1]) {
    throw new Error(`nestedTextTaskKey 必须以 text/ 开头：${nestedTextTaskKey}`);
  }
  return {
    scope: 'text',
    taskKey: parts[1],
    subtype: parts.length > 2 ? parts.slice(2).join('/') : null,
  };
}
